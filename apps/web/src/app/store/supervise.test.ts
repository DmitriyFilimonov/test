import { configureStore } from '@reduxjs/toolkit';
import createSagaMiddleware from 'redux-saga';
import { all, fork, take } from 'typed-redux-saga';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RESTART_DELAY_MS, supervise, type PackageSaga } from './supervise';

function runSagas(rootSaga: () => Generator) {
  const sagaMiddleware = createSagaMiddleware({ onError: () => {} });
  const store = configureStore({
    reducer: (state: Record<string, never> = {}) => state,
    middleware: (getDefaultMiddleware) => getDefaultMiddleware().concat(sagaMiddleware),
  });
  const task = sagaMiddleware.run(rootSaga);
  return { dispatch: (type: string) => store.dispatch({ type }), task };
}

function createSagas() {
  const stats = { crashingStarts: 0, pings: 0 };

  function* crashing() {
    stats.crashingStarts += 1;
    yield* take('crash');
    throw new Error('boom');
  }

  function* healthy() {
    while (true) {
      yield* take('ping');
      stats.pings += 1;
    }
  }

  return { stats, crashing, healthy };
}

describe('supervise', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('контроль: без supervise исключение в одной саге останавливает соседнюю', () => {
    const { stats, crashing, healthy } = createSagas();
    const { dispatch, task } = runSagas(function* () {
      yield* all([fork(crashing), fork(healthy)]);
    });

    dispatch('crash');
    dispatch('ping');

    expect(task.isRunning()).toBe(false);
    expect(stats.pings).toBe(0);
  });

  it('под supervise соседняя сага продолжает работать, упавшая перезапускается после паузы', async () => {
    const { stats, crashing, healthy } = createSagas();
    const { dispatch, task } = runSagas(function* () {
      yield* all([fork(supervise, crashing), fork(supervise, healthy)]);
    });

    dispatch('crash');
    dispatch('ping');

    expect(task.isRunning()).toBe(true);
    expect(stats.pings).toBe(1);
    expect(console.error).toHaveBeenCalledTimes(1);
    expect(stats.crashingStarts).toBe(1);

    await vi.advanceTimersByTimeAsync(RESTART_DELAY_MS - 1);
    expect(stats.crashingStarts).toBe(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(stats.crashingStarts).toBe(2);

    dispatch('crash');
    await vi.advanceTimersByTimeAsync(RESTART_DELAY_MS);
    expect(stats.crashingStarts).toBe(3);
  });

  it('сага, падающая синхронно при старте, перезапускается с паузой, а не в цикле', async () => {
    let starts = 0;
    // После пятой попытки сага перестаёт падать: без паузы цикл завершился бы синхронно
    // с starts === 5, и проверка ниже упала бы, а не повесила воркер.
    // eslint-disable-next-line require-yield -- сага падает до первого эффекта
    const failsOnStart: PackageSaga = function* () {
      starts += 1;
      if (starts < 5) {
        throw new Error('fails on start');
      }
    };

    runSagas(function* () {
      yield* fork(supervise, failsOnStart);
    });
    expect(starts).toBe(1);

    await vi.advanceTimersByTimeAsync(RESTART_DELAY_MS * 3);
    expect(starts).toBe(4);
  });

  it('штатно завершившаяся сага не перезапускается', async () => {
    let starts = 0;
    // eslint-disable-next-line require-yield -- сага завершается сразу
    const finishes: PackageSaga = function* () {
      starts += 1;
    };

    runSagas(function* () {
      yield* fork(supervise, finishes);
    });
    await vi.advanceTimersByTimeAsync(RESTART_DELAY_MS * 3);

    expect(starts).toBe(1);
  });
});
