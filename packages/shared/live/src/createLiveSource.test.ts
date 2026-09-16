import { combineSlices, configureStore, type Middleware } from '@reduxjs/toolkit';
import createSagaMiddleware from 'redux-saga';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BackoffOptions } from './backoff';
import { createEventSourceChannel, type LiveMessage } from './channels';
import { createLiveSource } from './createLiveSource';

/**
 * EventSource, которым управляет тест. Поток подаётся текстом в формате SSE и разбирается по
 * правилам спецификации: комментарии и блоки без data событий не порождают.
 */
class MockEventSource extends EventTarget {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSED = 2;
  static instances: MockEventSource[] = [];

  readyState = MockEventSource.CONNECTING;
  closed = false;

  readonly url: string;

  constructor(url: string) {
    super();
    this.url = url;
    MockEventSource.instances.push(this);
  }

  close() {
    this.readyState = MockEventSource.CLOSED;
    this.closed = true;
  }

  open() {
    this.readyState = MockEventSource.OPEN;
    this.dispatchEvent(new Event('open'));
  }

  /** Обрыв: браузер перешёл бы в CONNECTING и переподключался бы сам. */
  drop() {
    this.readyState = MockEventSource.CONNECTING;
    this.dispatchEvent(new Event('error'));
  }

  receive(chunk: string) {
    let type = '';
    let data: string[] = [];
    let id = '';
    for (const line of chunk.split('\n')) {
      if (line === '') {
        if (data.length > 0) {
          this.dispatchEvent(
            new MessageEvent(type || 'message', { data: data.join('\n'), lastEventId: id }),
          );
        }
        type = '';
        data = [];
      } else if (!line.startsWith(':')) {
        const colon = line.indexOf(':');
        const field = colon === -1 ? line : line.slice(0, colon);
        const value = colon === -1 ? '' : line.slice(colon + 1).replace(/^ /, '');
        if (field === 'event') {
          type = value;
        } else if (field === 'data') {
          data.push(value);
        } else if (field === 'id') {
          id = value;
        }
      }
    }
  }
}

interface TestEvent {
  type: string;
  seq: number;
}

const parseEvent = (message: LiveMessage): TestEvent => {
  const payload = JSON.parse(message.data) as { seq?: unknown };
  if (typeof payload.seq !== 'number') {
    throw new Error('seq must be a number');
  }
  return { type: message.type, seq: payload.seq };
};

/** Документ, видимостью которого управляет тест. */
class MockDocument extends EventTarget {
  visibilityState: DocumentVisibilityState = 'hidden';

  show() {
    this.visibilityState = 'visible';
    this.dispatchEvent(new Event('visibilitychange'));
  }

  hide() {
    this.visibilityState = 'hidden';
    this.dispatchEvent(new Event('visibilitychange'));
  }
}

const BASE_MS = 1000;
const MAX_MS = 8000;
/** Джиттер в тестах — ровно половина потолка: без джиттера задержка была бы вдвое больше. */
const JITTER = 0.5;

function setup(backoff: BackoffOptions = {}) {
  const parse = vi.fn(parseEvent);
  const source = createLiveSource({
    name: 'live',
    url: '/api/stream',
    eventTypes: ['hello', 'patch'],
    parse,
    backoff: { baseMs: BASE_MS, maxMs: MAX_MS, random: () => JITTER, ...backoff },
  });

  const types: string[] = [];
  const recordActions: Middleware = () => (next) => (action) => {
    types.push((action as { type: string }).type);
    return next(action);
  };
  const sagaMiddleware = createSagaMiddleware();
  const store = configureStore({
    reducer: combineSlices(source),
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware().concat(recordActions, sagaMiddleware),
  });
  const task = sagaMiddleware.run(source.saga);

  return {
    parse,
    task,
    types,
    subscribe: () => store.dispatch(source.actions.subscribed()),
    unsubscribe: () => store.dispatch(source.actions.unsubscribed()),
    reconnect: () => store.dispatch(source.actions.reconnect()),
    state: () => store.getState().live,
    /** Через сколько мс начнётся следующая попытка. */
    retryIn: () => {
      const { retryAt } = store.getState().live;
      return retryAt === null ? null : retryAt - Date.now();
    },
  };
}

const sources = () => MockEventSource.instances;
const current = () => MockEventSource.instances.at(-1)!;
/** Даёт отработать продолжениям саги после промисов delay. */
const tick = (ms: number) => vi.advanceTimersByTimeAsync(ms);

let visibility: MockDocument;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
  MockEventSource.instances = [];
  visibility = new MockDocument();
  vi.stubGlobal('EventSource', MockEventSource);
  vi.stubGlobal('document', visibility);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('createLiveSource: подписки', () => {
  it('подписка открывает соединение, отписка последнего — закрывает', () => {
    const live = setup();
    expect(live.state()).toEqual({
      status: 'idle',
      lastSeq: null,
      attempt: 0,
      lastError: null,
      retryAt: null,
    });

    live.subscribe();
    expect(sources()).toHaveLength(1);
    expect(current().url).toBe('/api/stream');
    expect(live.state().status).toBe('connecting');

    current().open();
    expect(live.state().status).toBe('open');

    live.unsubscribe();
    expect(current().closed).toBe(true);
    expect(live.state().status).toBe('idle');
    expect(sources()).toHaveLength(1);
  });

  it('два подписчика — одно соединение; уход одного его не закрывает', () => {
    const live = setup();

    live.subscribe();
    live.subscribe();
    current().open();
    expect(sources()).toHaveLength(1);

    live.unsubscribe();
    expect(current().closed).toBe(false);
    expect(live.state().status).toBe('open');

    live.unsubscribe();
    expect(current().closed).toBe(true);
    expect(live.state().status).toBe('idle');

    // Лишняя отписка не уводит счётчик в минус: следующая подписка снова открывает соединение.
    live.unsubscribe();
    live.subscribe();
    expect(sources()).toHaveLength(2);
  });
});

describe('createLiveSource: backoff', () => {
  it('обрыв: источник закрыт сразу, status reconnecting, попытка через base с джиттером', async () => {
    const live = setup();
    live.subscribe();
    current().open();

    current().drop();
    // Встроенный повтор EventSource не используется: источник закрыт.
    expect(current().closed).toBe(true);
    expect(live.state()).toMatchObject({
      status: 'reconnecting',
      attempt: 1,
      lastError: 'Соединение потеряно',
    });
    expect(live.retryIn()).toBe(BASE_MS * JITTER);

    await tick(BASE_MS * JITTER - 1);
    expect(sources()).toHaveLength(1);
    await tick(1);
    expect(sources()).toHaveLength(2);
    expect(live.state()).toMatchObject({ status: 'reconnecting', attempt: 1, retryAt: null });

    current().open();
    expect(live.state()).toMatchObject({ status: 'open', attempt: 0 });
  });

  it('последовательные обрывы: задержки растут экспоненциально до потолка', async () => {
    const live = setup({ maxAttempts: 100 });
    live.subscribe();

    const delays: (number | null)[] = [];
    for (let i = 0; i < 6; i++) {
      current().drop();
      delays.push(live.retryIn());
      const count = sources().length;
      await tick(live.retryIn()! - 1);
      expect(sources()).toHaveLength(count);
      await tick(1);
      expect(sources()).toHaveLength(count + 1);
    }

    // min(8000, 1000 · 2^n) · 0.5
    expect(delays).toEqual([500, 1000, 2000, 4000, 4000, 4000]);
    expect(live.state().attempt).toBe(6);
  });

  it('attempt сбрасывается успешным открытием, событие для этого не нужно', async () => {
    const live = setup();
    live.subscribe();

    current().drop();
    await tick(live.retryIn()!);
    current().drop();
    expect(live.retryIn()).toBe(1000);
    await tick(live.retryIn()!);

    current().open();
    expect(live.state().attempt).toBe(0);

    current().drop();
    expect(live.state().attempt).toBe(1);
    expect(live.retryIn()).toBe(BASE_MS * JITTER);
  });

  it('N неудач подряд — status failed, новых попыток нет', async () => {
    const live = setup({ maxAttempts: 3 });
    live.subscribe();

    current().drop();
    await tick(live.retryIn()!);
    current().drop();
    await tick(live.retryIn()!);
    current().drop();

    expect(live.state()).toMatchObject({ status: 'failed', attempt: 3, retryAt: null });
    expect(current().closed).toBe(true);

    await tick(MAX_MS * 10);
    visibility.show();
    await tick(0);
    expect(sources()).toHaveLength(3);
    expect(live.state().status).toBe('failed');
  });

  it('reconnect() из failed начинает заново с attempt 0', async () => {
    const live = setup({ maxAttempts: 2 });
    live.subscribe();
    current().drop();
    await tick(live.retryIn()!);
    current().drop();
    expect(live.state().status).toBe('failed');

    live.reconnect();
    expect(sources()).toHaveLength(3);
    expect(live.state()).toMatchObject({ status: 'connecting', attempt: 0 });

    current().drop();
    expect(live.state()).toMatchObject({ status: 'reconnecting', attempt: 1 });
    expect(live.retryIn()).toBe(BASE_MS * JITTER);

    // Пока соединение живо или идёт пауза, reconnect второе соединение не открывает.
    live.reconnect();
    expect(sources()).toHaveLength(3);
  });

  it('уход последнего подписчика во время паузы прерывает её немедленно', async () => {
    const live = setup();
    live.subscribe();
    current().open();
    current().drop();
    expect(live.state().status).toBe('reconnecting');

    live.unsubscribe();
    expect(live.state()).toMatchObject({ status: 'idle', attempt: 0, retryAt: null });

    await tick(MAX_MS * 10);
    expect(sources()).toHaveLength(1);
    expect(live.state().status).toBe('idle');

    live.subscribe();
    expect(sources()).toHaveLength(2);
    expect(live.state()).toMatchObject({ status: 'connecting', attempt: 0 });
  });

  it('возврат вкладки на экран во время паузы — попытка сразу, таймер паузы снят', async () => {
    const live = setup({ baseMs: 4000 });
    live.subscribe();
    current().open();
    current().drop();
    expect(live.retryIn()).toBe(2000);

    visibility.hide();
    await tick(0);
    expect(sources()).toHaveLength(1);

    visibility.show();
    await tick(0);
    expect(sources()).toHaveLength(2);
    expect(live.state()).toMatchObject({ status: 'reconnecting', attempt: 1, retryAt: null });

    // Таймер прерванной паузы не запускает ещё одну попытку.
    await tick(2000);
    expect(sources()).toHaveLength(2);

    // Вне паузы возврат вкладки ничего не делает.
    current().open();
    visibility.show();
    await tick(0);
    expect(sources()).toHaveLength(2);
    expect(current().closed).toBe(false);
  });
});

describe('createLiveSource: события', () => {
  it('события hello и patch обновляют lastSeq; событие без имени из списка не слушается', () => {
    const live = setup();
    live.subscribe();
    current().open();

    current().receive('event: hello\ndata: {"seq":3}\n\n');
    expect(live.state().lastSeq).toBe(3);
    current().receive('event: patch\ndata: {"seq":4}\n\ndata: {"seq":99}\n\n');
    expect(live.state().lastSeq).toBe(4);
    expect(live.types.filter((type) => type === 'live/messageReceived')).toHaveLength(2);
    expect(live.parse).toHaveBeenCalledWith({ type: 'patch', data: '{"seq":4}', lastEventId: '' });
  });

  it('битое событие не роняет сагу и не рвёт соединение', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const live = setup();
    live.subscribe();
    current().open();

    current().receive('event: patch\ndata: {broken\n\n');
    current().receive('event: patch\ndata: {"seq":"7"}\n\n');

    expect(error).toHaveBeenCalledTimes(2);
    expect(live.task.isRunning()).toBe(true);
    expect(current().closed).toBe(false);
    expect(sources()).toHaveLength(1);
    expect(live.state()).toMatchObject({ status: 'open', lastSeq: null, lastError: null });
    expect(live.types).not.toContain('live/messageReceived');

    current().receive('event: patch\ndata: {"seq":8}\n\n');
    expect(live.state().lastSeq).toBe(8);
  });

  it('heartbeat-комментарий не порождает событие', () => {
    const live = setup();
    live.subscribe();
    current().open();
    const before = live.types.length;

    current().receive(': ping\n\n');

    expect(live.parse).not.toHaveBeenCalled();
    expect(live.types).toHaveLength(before);
    expect(live.state()).toMatchObject({ status: 'open', lastSeq: null });
    expect(current().closed).toBe(false);
  });

  it('отказ сервера до открытия — неудача с повтором, как обрыв', () => {
    const live = setup();
    live.subscribe();

    current().readyState = MockEventSource.CLOSED;
    current().dispatchEvent(new Event('error'));

    expect(live.state()).toMatchObject({
      status: 'reconnecting',
      attempt: 1,
      lastError: 'Сервер отклонил подключение',
    });
  });
});

describe('createEventSourceChannel', () => {
  it('ошибка закрывает EventSource сразу, не дожидаясь, пока сага заберёт сигнал', () => {
    const channel = createEventSourceChannel('/api/stream', ['patch']);
    const source = current();
    source.open();

    // Сигналы лежат в буфере канала: сага их ещё не взяла, а браузер уже начал бы свой повтор.
    source.drop();
    expect(source.closed).toBe(true);

    const signals: unknown[] = [];
    channel.take((signal) => signals.push(signal));
    channel.take((signal) => signals.push(signal));
    expect(signals).toEqual([{ kind: 'open' }, { kind: 'error', error: 'Соединение потеряно' }]);
    channel.close();
  });
});
