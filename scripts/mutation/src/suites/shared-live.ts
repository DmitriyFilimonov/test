import type { Suite } from '../types.ts';

const TESTS = 'packages/shared/live/src/createLiveSource.test.ts';

export const sharedLiveBackoffSuite: Suite = {
  name: 'shared-live-backoff',
  file: 'packages/shared/live/src/backoff.ts',
  tests: TESTS,
  mutations: [
    {
      name: 'backoff линейный вместо экспоненциального',
      from: 'baseMs * 2 ** retry',
      to: 'baseMs * (retry + 1)',
    },
    {
      name: 'нет потолка задержки',
      from: 'const ceiling = Math.min(maxMs, baseMs * 2 ** retry);',
      to: 'const ceiling = baseMs * 2 ** retry;',
    },
    {
      name: 'нет джиттера',
      from: 'return Math.round(random() * ceiling);',
      to: 'return ceiling;',
    },
  ],
};

export const sharedLiveSuite: Suite = {
  name: 'shared-live',
  file: 'packages/shared/live/src/createLiveSource.ts',
  tests: TESTS,
  mutations: [
    {
      name: 'attempt сбрасывается по первому сообщению, а не по открытию',
      from: "            attempt = 0;\n            yield* put(connectionOpened());\n          } else if (signal.kind === 'message') {\n            const event = parseMessage(signal.message);\n            if (event !== undefined) {\n              yield* put(messageReceived({ event }));",
      to: "            yield* put(connectionOpened());\n          } else if (signal.kind === 'message') {\n            const event = parseMessage(signal.message);\n            if (event !== undefined) {\n              attempt = 0;\n              yield* put(messageReceived({ event }));",
    },
    {
      name: 'пауза не отменяется при уходе последнего подписчика',
      from: '          if (task?.isRunning()) {\n            yield* cancel(task);',
      to: "          if (task?.isRunning() && (yield* select(selectors.selectStatus)) !== 'reconnecting') {\n            yield* cancel(task);",
    },
    {
      name: 'соединение на каждого подписчика',
      from: 'if (subscribers === 1) {',
      to: 'if (subscribers >= 1) {',
    },
    {
      name: 'failed не прекращает попытки',
      from: '      if (failed) {\n        return;\n      }\n',
      to: '',
    },
    {
      name: 'битое событие рвёт соединение',
      from: '              yield* put(messageReceived({ event }));\n            }',
      to: "              yield* put(messageReceived({ event }));\n            } else {\n              error = 'Битое событие';\n            }",
    },
    {
      name: 'битое событие роняет сагу',
      from: '      return parse(message);\n    } catch (error) {',
      to: '      return parse(message);\n    } catch (error) {\n      throw error;',
    },
    {
      name: 'возврат вкладки не прерывает паузу',
      from: 'yield* race({ timeout: delay(wait), visible: take(visible) });',
      to: 'yield* delay(wait);',
    },
    {
      name: 'reconnect не сбрасывает attempt (продолжает счёт неудач)',
      from: '    let attempt = 0;\n    while (true) {',
      to: '    let attempt = 0;\n    attempt = (yield* select(selectors.selectAttempt));\n    while (true) {',
    },
    {
      name: 'reconnect открывает второе соединение поверх живого',
      from: "(yield* select(selectors.selectStatus)) === 'failed'",
      to: 'true',
    },
  ],
};

export const sharedLiveChannelsSuite: Suite = {
  name: 'shared-live-channels',
  file: 'packages/shared/live/src/channels.ts',
  tests: TESTS,
  mutations: [
    {
      name: 'на ошибке EventSource не закрывается (встроенный повтор браузера)',
      from: '      source.close();\n      emit({',
      to: '      emit({',
    },
    {
      name: 'слушаются и безымянные события',
      from: 'for (const type of eventTypes) {',
      to: "for (const type of [...eventTypes, 'message']) {",
    },
    {
      name: 'уход вкладки в фон тоже будит паузу',
      from: "if (document.visibilityState === 'visible') {",
      to: 'if (true) {',
    },
  ],
};
