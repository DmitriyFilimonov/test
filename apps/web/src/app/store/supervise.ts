import { call, delay } from 'typed-redux-saga';

/** Любой генератор: саги на typed-redux-saga несовместимы с `SagaIterator` из redux-saga. */
export type PackageSaga = () => Generator;

/**
 * Пауза перед перезапуском. Без неё сага, падающая синхронно при старте, крутила бы
 * цикл без единого асинхронного шага и повесила бы вкладку.
 */
export const RESTART_DELAY_MS = 1000;

/**
 * Изолирует сагу пакета: исключение не всплывает в корневую сагу и не отменяет соседние.
 * Упавшая сага перезапускается после паузы, штатно завершившаяся — нет.
 * Локальное состояние саги (например, счётчик подписчиков) при перезапуске обнуляется.
 */
export function* supervise(saga: PackageSaga) {
  while (true) {
    try {
      yield* call(saga);
      return;
    } catch (error) {
      console.error(`Saga "${saga.name}" crashed, restarting in ${RESTART_DELAY_MS} ms`, error);
      yield* delay(RESTART_DELAY_MS);
    }
  }
}
