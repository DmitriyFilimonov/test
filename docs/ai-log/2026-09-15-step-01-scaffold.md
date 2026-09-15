# Шаг 01 — каркас монорепозитория

Дата: 2026-09-15

Каркас монорепозитория: Vite + React + TypeScript, npm workspaces + Lerna.
Кода стора, сетевого слоя и бизнес-логики нет.

## Окружение

- Системный Node 20.12.1 не подходит к текущему тулчейну: create-vite 9 и Vite 8
  требуют `^20.19 || >=22.12`, ESLint 10 — `^20.19 || ^22.13 || >=24`,
  Lerna 10 — `^22.13 || ^24`, react-router 8 — `>=22.22`. По согласованию с
  пользователем через nvm (в `~/.nvm`) поставлен Node 24.21.0 LTS, npm 11.19.0.
  Системный `/usr/local/bin/node` не тронут; установщик nvm дописал свою загрузку
  в `~/.zshrc`. В проект добавлены `.nvmrc` (`24`) и `engines.node: ">=22.22.0"`.
- В `~/.npm` есть файлы, принадлежащие root (остались от старого `sudo npm`), поэтому
  npm падал с EACCES. Установка шла с временным кешем (`npm_config_cache`).
  Починка на стороне пользователя: `sudo chown -R $(id -u):$(id -g) ~/.npm`.

## Как создавались файлы

- `apps/web` сгенерирован командой `npm create vite@latest web -- --template react-ts`
  (create-vite 9.2.1: vite 8.3.0, @vitejs/plugin-react 6.1.1, typescript ~6.0.2,
  react 19.2). Остальные зависимости поставлены через `npm i`, версии пришли из реестра.
- Lerna — через `npx lerna init` (lerna 10.0.1). Что она сгенерировала:
  - `lerna.json`: `{ "$schema": "node_modules/lerna/schemas/lerna-schema.json", "version": "0.0.0" }`.
    Полей `useWorkspaces` и `packages` в нём нет, убирать было нечего, файл оставлен как есть.
  - `package.json`: `name: "root"`, `private: true`, `workspaces: ["packages/*"]`,
    `devDependencies.lerna`. Позже `workspaces` заменены на `["apps/*", "packages/*/*"]`,
    добавлены скрипты и тулчейн.
  - `.gitignore` с `node_modules/` (дополнен).
  - Кроме того, `lerna init` выполнила `git init`. Коммитов нет.

## Созданные файлы

```
.gitignore  .nvmrc  .prettierrc.json  .prettierignore
package.json  package-lock.json  lerna.json  tsconfig.base.json  eslint.config.js
docs/ai-log/2026-09-15-step-01-scaffold.md

apps/web/                         @app/web
  package.json  index.html  public/favicon.svg
  tsconfig.json  tsconfig.node.json  vite.config.ts
  src/main.tsx
  src/app/App.tsx                 RouterProvider внутри Providers
  src/app/providers.tsx           ThemeProvider (styled-components) с темой из @shared/theme
  src/app/router.tsx              createBrowserRouter([orgDashboardRoute])

packages/pages/org-dashboard/     @pages/org-dashboard
  package.json  tsconfig.json
  src/index.ts
  src/OrgDashboardPage.tsx        заголовок + результат ping() из @shared/lib, styled-компоненты на теме
  src/route.tsx                   { path: '/', element: <OrgDashboardPage /> }

packages/shared/theme/            @shared/theme
  package.json  tsconfig.json
  src/index.ts
  src/theme.ts                    interface AppTheme, const theme, аугментация DefaultTheme

packages/shared/ui/               @shared/ui
  package.json  tsconfig.json  src/index.ts   (export {})

packages/shared/lib/              @shared/lib
  package.json  tsconfig.json
  src/index.ts  src/ping.ts       ping(caller) — тривиальная функция
  src/internal.ts                 не экспортируется; нужен для проверки запрета глубоких импортов
```

Из шаблона Vite удалены демо-компонент, CSS, картинки, `README.md`, `.gitignore` приложения
(перенесён в корень), `tsconfig.app.json` и `.oxlintrc.json`.

## Решения

**Резолв пакетов.** У каждого пакета `private: true`, `exports: { ".": "./src/index.ts" }`,
`types: "./src/index.ts"`. `paths` и alias нет: резолв идёт через симлинки
`node_modules/@scope/name -> packages/...`, в TS используется `moduleResolution: "bundler"`.
Зависимость на workspace-пакет указана версией `"*"`: npm не поддерживает протокол `workspace:`.

**tsconfig.** В `tsconfig.base.json` общие опции: strict, `noEmit`, `verbatimModuleSyntax`,
`types: []`. Пустой `types` важен: в пакетах нет глобальных типов `vite/client`, поэтому
`import.meta.env` в пакете — ещё и ошибка типов, а не только lint. Каждый пакет делает
`extends` базы и `include: ["src"]`. Приложение подключает `types: ["vite/client"]`.
Project references из шаблона Vite убраны: у `tsconfig.json` и `tsconfig.node.json`
общий `extends` базы, `typecheck` вызывает `tsc --noEmit -p` для каждого по очереди.
Сборка приложения — `npm run typecheck && vite build` вместо `tsc -b && vite build`.

**Peer-зависимости.** В `@pages/org-dashboard` `react` и `styled-components` лежат в
`peerDependencies` (`^19.0.0`, `^6.0.0`) и `devDependencies`. В `@shared/theme`
так же устроен `styled-components`. `react-dom` пакеты не импортируют, поэтому его нет.
В `vite.config.ts` задан `resolve.dedupe: ['react', 'react-dom', 'styled-components']`.

**Аугментация темы.** `declare module 'styled-components' { interface DefaultTheme extends AppTheme {} }`
лежит в том же модуле, что и тип, так что любой импорт из `@shared/theme` подтягивает её в
программу потребителя. Два нюанса:

- в `theme.ts` понадобился `import type {} from 'styled-components'`: без него при
  изолированной типизации пакета TS отвечал TS2664 (модуль для аугментации не найден);
- страница, которой нужна типизированная тема, должна импортировать `@shared/theme`.
  В `OrgDashboardPage.tsx` для этого стоит `import type {} from '@shared/theme'`:
  он стирается при компиляции и не тянет объект темы в бандл.

**Роутер.** `react-router` 8.3.1 — единственная зависимость сверх перечисленных в задаче.
Без роутера нельзя собрать `@app/web` («только роутер, провайдеры…») и применить
дескриптор маршрута. Роутер живёт только в `@app/web`. Пакет страницы отдаёт дескриптор
как данные с локальным типом `{ path: string; element: ReactElement }` и от react-router
не зависит. `RouterProvider` импортируется из `react-router/dom`, как рекомендовано для DOM.

**displayName для styled-components.** В `@vitejs/plugin-react` 6 (Vite 8) больше нет опции
`babel`; babel-плагины подключаются через `@rolldown/plugin-babel`. Поэтому в devDependencies
приложения добавлены `@rolldown/plugin-babel`, `@babel/core`, `@types/babel__core` и
`babel-plugin-styled-components`. Плагин включается только при `command === 'serve'`.
Проверено: в dev классы вида `OrgDashboardPage__Title-sc-…`, в production — `sc-…`.
Исходники пакетов лежат вне `node_modules` (realpath симлинка), поэтому babel их тоже обрабатывает.

**ESLint: плагин импортов.** Взят `eslint-plugin-import-x`, а не `eslint-plugin-import`:
у последнего (2.32.0) peer `eslint` ограничен `^9`, а текущий ESLint — 10.10.
import-x зарегистрирован под неймспейсом `import`, поэтому правила называются ровно так,
как в задаче: `import/no-extraneous-dependencies`, `import/no-cycle`.
`eslint-import-resolver-typescript` не поставился: npm падает с ERESOLVE на его optional
peer `eslint-plugin-import`. Вместо него используется встроенный `createNodeResolver`
из import-x (unrs-resolver) с TS-расширениями и условиями `types/import/default`.
Он учитывает `exports`, так что `paths` не нужен. Грабли, которые пришлось обойти:

- `no-extraneous-dependencies` по умолчанию пропускает workspace-пакеты: после realpath
  симлинка они резолвятся вне `node_modules`, и import-x считает их internal. Нужен
  `includeInternal: true`; плюс `includeTypes: true`, чтобы проверялись и `import type`;
- без `import-x/extensions` и `import-x/parsers` import-x не разбирает `.ts`-файлы, и
  `no-cycle` молча ничего не находил. Добавлены обе настройки; ловятся циклы и внутри
  пакета, и между пакетами (`@pages/org-dashboard -> @shared/lib -> @pages/org-dashboard`).

**ESLint: границы слоёв — `no-restricted-imports`, не `eslint-plugin-boundaries`.**

- Слой однозначно задан двумя вещами: каталогом пакета (`packages/<layer>/*`) и npm-скоупом
  импорта (`@<layer>/*`). Для такого правила достаточно блока `files: packages/<layer>/**`
  и regex по строке импорта, резолвить путь не нужно.
- `eslint-plugin-boundaries` классифицирует элементы по файловым путям разрезолвленного
  импорта. Для workspace-симлинков это зависит от того, как резолвер обработает realpath
  и `node_modules`, то есть появляется ещё одна точка отказа. Кроме того, это лишняя
  зависимость и отдельный DSL.
- Минус: `no-restricted-imports` не видит обходы через относительные пути в чужой пакет.
  Эту дыру закрывает `import/no-relative-packages`.
  Правила генерируются из массива `LAYERS = [shared, entities, features, widgets, pages]`:
  каждому слою запрещены все слои выше и `@app/*`. Блоки для entities/features/widgets уже
  есть, хотя самих пакетов пока нет.

**Дополнительные правила сверх перечисленных (все проверены на нарушающих файлах):**

- `import/no-relative-packages` — запрет `../../shared/lib/src/...` в обход границ;
- `import/no-unresolved` — глубокий импорт `@shared/lib/src/internal` ловится уже линтером;
- в `packages/pages/**` запрещены `react-redux`, `redux`, `redux-saga`, `@reduxjs/toolkit`:
  страница работает со стором только через хуки `@entities/*`;
- в `packages/**` запрещено `import.meta.env` (через `no-restricted-syntax`);
- `eslint-plugin-react-hooks` и `eslint-plugin-react-refresh` заменяют правила oxlint
  из шаблона Vite (`rules-of-hooks`, `only-export-components`), который удалён в пользу ESLint;
- `eslint-config-prettier` отключает стилистические правила, конфликтующие с Prettier.
  В корне есть скрипты `format` и `format:check`.

## Отступления от инструкции

1. **Node 24 через nvm** вместо системного 20.12.1 — согласовано с пользователем (см. «Окружение»).
2. **`eslint-plugin-import-x` вместо `eslint-plugin-import`**: последний несовместим с ESLint 10.
   Имена правил сохранены.
3. **Добавлен `react-router`**: нужен роутер в `@app/web`, причины выше.
4. **Добавлены `@rolldown/plugin-babel` и `@babel/core`**: в plugin-react 6 без них
   `babel-plugin-styled-components` не подключить.
5. **Провайдер конфигурации пока не создан**: страница ничего не читает из конфигурации.
   Контекст для него должен жить в shared-пакете (например, `@shared/config`), а не в
   `@app/web`, иначе странице пришлось бы импортировать `@app/*`.
6. **`lerna.json` не менялся**: устаревших полей в сгенерированном файле не было.
   Поле `version` оставлено как сгенерировано.

## Результаты проверок

| Команда                                            | Результат                                                                     |
| -------------------------------------------------- | ----------------------------------------------------------------------------- |
| `npm install` (с чистого `node_modules`)           | exit 0; симлинки `@app/web`, `@pages/org-dashboard`, `@shared/{lib,theme,ui}` |
| `npx lerna run typecheck`                          | 5/5 проектов успешно                                                          |
| `npx tsc --noEmit -p packages/pages/org-dashboard` | exit 0; в программе только `src` страницы, `@shared/lib`, `@shared/theme`     |
| `npx lerna run lint`                               | 5/5 проектов успешно                                                          |
| `npm run build -w @app/web`                        | успешно, 99 модулей, `dist/assets/index-*.js` 338 kB                          |
| `npm run dev -w @app/web`                          | Vite 8.3.0 ready; headless Chrome рендерит заголовок и ping                   |
| `ls node_modules/react && npm ls react`            | одна копия `react@19.3.0`, все остальные вхождения `deduped`                  |

1. **Сквозной резолв.** `@pages/org-dashboard` рендерит `ping('@pages/org-dashboard')` из
   `@shared/lib`. Headless Chrome выводит `pong from @shared/lib to @pages/org-dashboard`
   и в dev (`vite`), и в production (`vite preview` поверх `vite build`).
2. **Глубокий импорт запрещён.** `import { internalOnly } from '@shared/lib/src/internal'`
   (файл существует) отклоняется в четырёх местах:
   - tsc: `TS2307: Cannot find module '@shared/lib/src/internal'`;
   - `vite build`: `Build failed`;
   - dev: `"./src/internal" is not exported under the conditions [...]`, страница не рендерится;
   - eslint: `import/no-unresolved`.
     Везде причина одна — поле `exports`.
3. **Тема типизирована в пакете.** Проба внутри styled-компонента страницы при изолированном tsc:
   - `const n: number = theme` даёт `Type 'DefaultTheme' is not assignable to type 'number'`;
   - проверка `IsAny<typeof theme> = false` компилируется, значит theme не `any`;
   - `// @ts-expect-error` на `theme.colors.doesNotExist` не срабатывает как «unused», то есть обращение к несуществующему ключу — ошибка.

Проверки линтера на нарушениях (файлы после проверки удалены): незадекларированная
зависимость (`react-router`, `@shared/ui`), импорт `@app/web` из страницы, `react-redux`
в странице, относительный импорт в чужой пакет, `import.meta.env`, импорт вверх из
shared/entities/widgets, цикл внутри пакета и между пакетами — всё даёт `error`.

## Известные проблемы

- `npm audit`: 5 high-уязвимостей, все транзитивные через `lerna@10.0.1`
  (`nx` → `smol-toml`, `pacote`, `js-yaml`). Это dev-тулинг, в бандл не попадает.
  `npm audit fix --force` предлагает откатиться на lerna 6.4.1, поэтому не применялся.
- npm 11 не запускает install-скрипты без одобрения (`fsevents`, `nx`, `unrs-resolver`).
  На этом шаге ничего не сломалось: все проверки выше прошли без них.

## Авторство

> Секция добавлена 2026-09-15 после ревью (`2026-09-15-step-01-review-fixes.md`); заполнена по ходу той же сессии, не по памяти.

- Сгенерировано агентом: все файлы шага — `apps/web` (из шаблона `create-vite`, далее
  правки агента), пакеты `@pages/org-dashboard`, `@shared/{lib,theme,ui}`, корневые
  конфиги (ESLint, Prettier, tsconfig), `.nvmrc`, эта запись. Решения: import-x вместо
  eslint-plugin-import, `no-restricted-imports` для слоёв, react-router, babel через
  `@rolldown/plugin-babel`, доп. правила линтера.
- Написано или переписано человеком: нет (агент не наблюдал).
- Решения и указания человека: ТЗ шага; выбор «поставить Node 24 через nvm».
