import type { Suite } from '../types.ts';

export const webSuperviseSuite: Suite = {
  name: 'web-supervise',
  file: 'apps/web/src/app/store/supervise.ts',
  tests: 'apps/web/src/app/store/supervise.test.ts',
  mutations: [
    {
      name: 'исключение пробрасывается дальше',
      from: 'yield* delay(RESTART_DELAY_MS);',
      to: 'yield* delay(RESTART_DELAY_MS);\n      throw error;',
    },
    {
      name: 'перезапуск и после штатного завершения',
      from: 'yield* call(saga);\n      return;',
      to: 'yield* call(saga);\n      yield* delay(RESTART_DELAY_MS);',
    },
    {
      name: 'перезапуск без паузы',
      from: '      yield* delay(RESTART_DELAY_MS);\n',
      to: '',
    },
  ],
};
