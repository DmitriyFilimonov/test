import { buffers, eventChannel, type EventChannel } from 'redux-saga';

/** Событие потока в том виде, в каком его отдал EventSource. Разбор data — у потребителя. */
export interface LiveMessage {
  /** Имя события (поле `event:`). */
  type: string;
  data: string;
  lastEventId: string;
}

export type SourceSignal =
  { kind: 'open' } | { kind: 'message'; message: LiveMessage } | { kind: 'error'; error: string };

/**
 * EventSource как канал. На ошибке источник закрывается сразу: встроенным повтором браузера
 * нельзя управлять (ни задержкой, ни числом попыток), повторы делает сага по своему таймеру.
 * Закрытие канала закрывает EventSource.
 */
export function createEventSourceChannel(
  url: string,
  eventTypes: readonly string[],
): EventChannel<SourceSignal> {
  // Буфер: сообщения, пришедшие, пока сага занята предыдущим, не теряются.
  return eventChannel<SourceSignal>((emit) => {
    let source: EventSource;
    try {
      source = new EventSource(url);
    } catch (error) {
      emit({ kind: 'error', error: error instanceof Error ? error.message : String(error) });
      return () => {};
    }

    source.addEventListener('open', () => emit({ kind: 'open' }));
    source.addEventListener('error', () => {
      // CLOSED до нашего close() — браузер сам отказался от соединения (ответ не 200 или не
      // text/event-stream); CONNECTING — соединение оборвалось.
      const refused = source.readyState === EventSource.CLOSED;
      source.close();
      emit({
        kind: 'error',
        error: refused ? 'Сервер отклонил подключение' : 'Соединение потеряно',
      });
    });
    for (const type of eventTypes) {
      source.addEventListener(type, (event) => {
        const { data, lastEventId } = event as MessageEvent<string>;
        emit({ kind: 'message', message: { type, data, lastEventId } });
      });
    }

    return () => source.close();
  }, buffers.expanding());
}

/** Возврат вкладки на экран (visibilitychange → visible). Вне браузера канал молчит. */
export function createVisibleChannel(): EventChannel<true> {
  return eventChannel<true>((emit) => {
    if (typeof document === 'undefined') {
      return () => {};
    }
    const onChange = () => {
      if (document.visibilityState === 'visible') {
        emit(true);
      }
    };
    document.addEventListener('visibilitychange', onChange);
    return () => document.removeEventListener('visibilitychange', onChange);
  });
}
