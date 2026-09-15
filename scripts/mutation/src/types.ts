export interface Mutation {
  /** Какую регрессию моделирует мутация. */
  name: string;
  /** Фрагмент исходника. Должен встречаться в файле ровно один раз. */
  from: string;
  /** Чем заменить фрагмент. */
  to: string;
}

export interface Suite {
  /** Имя набора для CLI: `npm run test:mutation -- <name>`. */
  name: string;
  /** Файл, в который вносятся мутации, относительно корня репозитория. */
  file: string;
  /** Фильтр для `vitest run`: путь к тестовому файлу или пакету. */
  tests: string;
  /** Таймаут одного прогона тестов. По умолчанию 60 с. */
  timeoutMs?: number;
  mutations: Mutation[];
}
