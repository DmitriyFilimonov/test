import { createAction, type UnknownAction } from '@reduxjs/toolkit';
import type { Task } from 'redux-saga';
import { call, cancel, delay, fork, put, race, select, take } from 'typed-redux-saga';
import { getBackoffDelay, resolveBackoff, type BackoffOptions } from './backoff';
import {
  createEventSourceChannel,
  createVisibleChannel,
  type LiveMessage,
  type SourceSignal,
} from './channels';

export type LiveStatus = 'idle' | 'connecting' | 'open' | 'reconnecting' | 'failed';

export interface LiveState {
  status: LiveStatus;
  /** seq последнего принятого события; null — событий ещё не было. */
  lastSeq: number | null;
  /** Неудач подряд: 0 — соединение открывалось после последней неудачи или ещё не рвалось. */
  attempt: number;
  /** Последняя ошибка соединения. Битые события сюда не пишутся: они не ошибка соединения. */
  lastError: string | null;
  /** Когда начнётся следующая попытка (мс эпохи); null — паузы нет. */
  retryAt: number | null;
}

/** Событие после разбора. seq — позиция источника: по нему потребитель видит пропуски. */
export interface LiveEvent {
  seq: number;
}

export interface CreateLiveSourceOptions<TName extends string, TEvent extends LiveEvent> {
  /** Ключ стейта в корневом редьюсере (`reducerPath`) и префикс типов экшенов. */
  name: TName;
  url: string;
  /** Имена событий (`event:`), которые слушает источник. */
  eventTypes: readonly string[];
  /** Разбор и валидация. Исключение — событие пропускается, соединение остаётся. */
  parse: (message: LiveMessage) => TEvent;
  backoff?: BackoffOptions;
}

const initialState: LiveState = {
  status: 'idle',
  lastSeq: null,
  attempt: 0,
  lastError: null,
  retryAt: null,
};

export function createLiveSource<TName extends string, TEvent extends LiveEvent>({
  name,
  url,
  eventTypes,
  parse,
  backoff: backoffOptions,
}: CreateLiveSourceOptions<TName, TEvent>) {
  const backoff = resolveBackoff(backoffOptions);

  // Публичные: объявляют намерение, решение принимает сага.
  const subscribed = createAction(`${name}/subscribed`);
  const unsubscribed = createAction(`${name}/unsubscribed`);
  /** Начать заново с attempt 0. Действует, когда попыток нет (status 'failed'). */
  const reconnect = createAction(`${name}/reconnect`);

  // Диспатчит только сага. Потребитель может их слушать (take, свои редьюсеры).
  const connectionStarted = createAction<{ attempt: number }>(`${name}/connectionStarted`);
  const connectionOpened = createAction(`${name}/connectionOpened`);
  const messageReceived = createAction<{ event: TEvent }>(`${name}/messageReceived`);
  const connectionLost = createAction<{
    error: string;
    attempt: number;
    /** null — попыток больше не будет. */
    retryAt: number | null;
  }>(`${name}/connectionLost`);
  const connectionClosed = createAction(`${name}/connectionClosed`);

  function reducer(state: LiveState = initialState, action: UnknownAction): LiveState {
    if (connectionStarted.match(action)) {
      const { attempt } = action.payload;
      return {
        ...state,
        status: attempt === 0 ? 'connecting' : 'reconnecting',
        attempt,
        retryAt: null,
      };
    }
    if (connectionOpened.match(action)) {
      return { ...state, status: 'open', attempt: 0, retryAt: null };
    }
    if (messageReceived.match(action)) {
      const { seq } = action.payload.event;
      return state.lastSeq === seq ? state : { ...state, lastSeq: seq };
    }
    if (connectionLost.match(action)) {
      const { error, attempt, retryAt } = action.payload;
      return {
        ...state,
        status: retryAt === null ? 'failed' : 'reconnecting',
        attempt,
        lastError: error,
        retryAt,
      };
    }
    if (connectionClosed.match(action)) {
      return { ...state, status: 'idle', attempt: 0, retryAt: null };
    }
    return state;
  }

  type RootState = { [K in TName]: LiveState };
  const selectState = (root: RootState): LiveState => root[name];

  const selectors = {
    selectState,
    selectStatus: (root: RootState) => selectState(root).status,
    selectLastSeq: (root: RootState) => selectState(root).lastSeq,
    selectAttempt: (root: RootState) => selectState(root).attempt,
    selectLastError: (root: RootState) => selectState(root).lastError,
    selectRetryAt: (root: RootState) => selectState(root).retryAt,
  };

  /** Разобранное событие; undefined — событие битое и пропущено. */
  function parseMessage(message: LiveMessage): TEvent | undefined {
    try {
      return parse(message);
    } catch (error) {
      console.error(`[${name}] Событие "${message.type}" пропущено: не прошло разбор`, error);
      return undefined;
    }
  }

  /**
   * Соединение с повторами. Живёт, пока есть подписчики и не исчерпаны попытки; отмена задачи
   * закрывает EventSource и прерывает паузу между попытками сразу, не дожидаясь её конца.
   */
  function* connection() {
    let attempt = 0;
    while (true) {
      yield* put(connectionStarted({ attempt }));
      const channel = yield* call(createEventSourceChannel, url, eventTypes);
      let error: string | undefined;
      try {
        while (error === undefined) {
          const signal: SourceSignal = yield* take(channel);
          if (signal.kind === 'open') {
            // Сброс по открытию, а не по первому событию: открытое соединение — уже успех,
            // даже если сервер пока молчит.
            attempt = 0;
            yield* put(connectionOpened());
          } else if (signal.kind === 'message') {
            const event = parseMessage(signal.message);
            if (event !== undefined) {
              yield* put(messageReceived({ event }));
            }
          } else {
            error = signal.error;
          }
        }
      } finally {
        channel.close();
      }

      attempt += 1;
      const failed = attempt >= backoff.maxAttempts;
      const wait = getBackoffDelay(attempt - 1, backoff);
      yield* put(connectionLost({ error, attempt, retryAt: failed ? null : Date.now() + wait }));
      if (failed) {
        return;
      }

      // Вкладка вернулась на экран — попытка сразу: пользователь смотрит на страницу сейчас,
      // а пауза могла вырасти до потолка, пока вкладка была в фоне.
      const visible = yield* call(createVisibleChannel);
      try {
        yield* race({ timeout: delay(wait), visible: take(visible) });
      } finally {
        visible.close();
      }
    }
  }

  /**
   * Вотчер — единственный владелец счётчика подписчиков и задачи соединения: соединение
   * открывается при первом подписчике и закрывается при уходе последнего.
   */
  function* saga() {
    let subscribers = 0;
    let task: Task | undefined;

    while (true) {
      const action = yield* take<UnknownAction>([
        subscribed.type,
        unsubscribed.type,
        reconnect.type,
      ]);

      if (subscribed.match(action)) {
        subscribers += 1;
        if (subscribers === 1) {
          task = yield* fork(connection);
        }
      } else if (unsubscribed.match(action)) {
        if (subscribers === 0) {
          continue;
        }
        subscribers -= 1;
        if (subscribers === 0) {
          // Отмена действует и на паузу между попытками: delay снимается сразу.
          if (task?.isRunning()) {
            yield* cancel(task);
          }
          task = undefined;
          yield* put(connectionClosed());
        }
      } else if (reconnect.match(action)) {
        // failed — задача соединения завершилась сама: попытки исчерпаны.
        if (subscribers > 0 && (yield* select(selectors.selectStatus)) === 'failed') {
          task = yield* fork(connection);
        }
      }
    }
  }

  return {
    reducerPath: name,
    reducer,
    saga,
    actions: { subscribed, unsubscribed, reconnect },
    sagaActions: {
      connectionStarted,
      connectionOpened,
      messageReceived,
      connectionLost,
      connectionClosed,
    },
    selectors,
  };
}

export type LiveSource<TName extends string, TEvent extends LiveEvent> = ReturnType<
  typeof createLiveSource<TName, TEvent>
>;
