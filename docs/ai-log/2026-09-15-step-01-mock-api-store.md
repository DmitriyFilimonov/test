# Шаг 01 — мок-API и сборка стора

Дата: 2026-09-15

Добавлены мок-сервер `@app/mock-api` (Express + tsx, порт 3001) с детерминированным
оргдеревом, ETag/304 и дев-ручками, прокси `/api` в Vite, корневой `npm run dev`
через concurrently. В `@app/web` собран стор: `configureStore` + redux-saga,
статические реестры редьюсеров и саг. UI, сетевой слой клиента, zod-схемы,
`@shared/query` и `@entities/org-tree` не создавались.

Место записи: задание просило «допиши docs/ai-log.md», по согласованию с
пользователем запись сделана отдельным файлом по правилам CLAUDE.md.

## Изменения

- `apps/mock-api/` — новый пакет: `server.ts` (роуты), `org-tree-data.ts` (каталог,
  генерация, invalid-пейлоад), `http-cache.ts` (ETag, If-None-Match), `prng.ts`.
- `apps/web/src/app/store/` — `rootReducer.ts`, `rootSaga.ts`, `store.ts`, `hooks.ts`;
  `providers.tsx` монтирует `Provider` поверх `ThemeProvider`.
- `apps/web/vite.config.ts` — proxy `/api`, `react-redux` в `dedupe`.
- `eslint.config.js` — правила typed-redux-saga, node-globals для mock-api.
- Корневой `package.json` — скрипт `dev`.
- Зависимости: `express`, `tsx`, `@types/express`, `@types/node` (mock-api);
  `@reduxjs/toolkit`, `react-redux`, `redux-saga`, `typed-redux-saga` (web);
  `concurrently`, `@jambit/eslint-plugin-typed-redux-saga`, `@eslint/compat` (корень).

## Решения

**Данные.** Иерархия имён задана каталогом «дивизион → отдел → команды»
(5 / 14 / 34 = 53 узла), числа и id — из PRNG mulberry32 с зашитым сидом
`20260915`. Каталог вместо генерации имён: так имена осмысленные и отдел
тематически соответствует дивизиону.

- `updatedAt` отсчитывается от зашитой даты, а не от `Date.now()`, иначе данные
  зависели бы от момента запуска.
- `headcount` и `budget` — собственные значения узла, не агрегаты по потомкам.
  Иначе `POST /api/dev/touch` не смог бы менять «ровно один узел»: пришлось бы
  пересчитывать родителей. Агрегация, если понадобится, — задача клиента.
- `budget` — целые рубли в год, кратно 10 000.
- id непрозрачные (`org-xxxxxx`), без зашитой иерархии: клиент обязан строить дерево
  по `parentId`, а не по id.
- Порядок массива детерминированно перемешан: потомок может идти раньше родителя.
  Это проверяет, что клиент не полагается на порядок; сам порядок стабилен.
- Состояние в памяти: перезапуск возвращает данные к сиду. Меняет их только `touch`.
  `tsx watch` перезапускает процесс и при правке исходников — это тоже сброс к сиду.

**HTTP.** Встроенный ETag Express отключён (`app.set('etag', false)`), ETag и 304
реализованы явно: сильный ETag `"base64url(sha256(тело))"`, If-None-Match по
слабому сравнению RFC 9110 (список тегов, `*`, `W/`). `Cache-Control: no-cache`
ставится на все ответы `/api/org-tree`, ETag — только на JSON-ответы (200/304).
Некорректные `scenario`/`delay` дают 400, а не молча игнорируются; `delay` ≤ 60 000 мс
и применяется до сценария. `invalid` строится из текущих данных: у первого узла
`performance` строкой, у второго нет `id`, остальное валидно. У сервера свой тип
`OrgNode`, общий с клиентом не заводился: контракт клиент будет проверять сам.

**Прокси.** Кроме `server.proxy` добавлен такой же `preview.proxy`, чтобы
`vite preview` production-сборки тоже ходил в мок. Это не требовалось; одна строка.

**rootReducer — `combineSlices()`, а не `combineReducers({})`.** Проверено:
пустой `combineReducers({})` на каждом dispatch пишет в `console.error`
«Store does not have a valid reducer», `combineSlices()` молчит. `combineSlices`
без `.inject()` — статическая сборка; аргументы — слайсы или карты редьюсеров.

**rootSaga.** Реестр `packageSagas`, запуск `yield* all(packageSagas.map((s) => fork(s)))`
(паттерн из документации redux-saga). Тип элемента — `() => Generator`: саги на
typed-redux-saga несовместимы с `SagaIterator` из redux-saga (TS2322 на `all`).
Ошибка в одной форкнутой саге обрывает корневую — изоляцию (spawn + перезапуск)
стоит решить, когда появятся реальные саги.

> Пересмотрено: `2026-09-15-step-01-review-fixes.md` — саги пакетов запускаются под `supervise`.

**Store.** Фабрика `createAppStore()` + единственный экземпляр `store`: фабрика
пригодится в тестах. Middleware по умолчанию (включая thunk) не отключались —
отключение thunk ограничило бы будущие решения без явной причины.
`devTools: import.meta.env.DEV`. `RootState`/`AppDispatch` и хуки лежат в
`@app/web` и наружу не уходят: пакеты не могут импортировать `@app/*` (lint).

**dedupe `react-redux`.** Две копии дали бы два контекста, и хуки из пакетов
`@entities/*` не увидели бы `Provider`. Добавлено к списку из шага 01.

**ESLint для саг.** `@jambit/eslint-plugin-typed-redux-saga` 0.4.0 (2022) падает на
ESLint 10: `TypeError: context.getSourceCode is not a function` (воспроизведено).
Метод вызывается в фиксерах, а ESLint вычисляет фикс сразу при репорте, так что
падение на первом же нарушении. Обёрнут в `fixupPluginRules` из `@eslint/compat` —
официальный слой совместимости. `use-typed-effects` настроен как `['error', 'default']`
(без макроса): он запрещает и `redux-saga/effects`, и `typed-redux-saga/macro`.
Правила действуют на все `.ts/.tsx` — саги появятся и в пакетах.

## Отступления от инструкции

- Запись журнала — отдельным файлом, а не в `docs/ai-log.md` (согласовано).
- Добавлен `@eslint/compat`: без него указанный плагин не работает на ESLint 10.
- Добавлены `preview.proxy` и `react-redux` в `dedupe` (причины выше).
- `rootReducer` через `combineSlices`, а не `combineReducers` (причина выше).

## Проверки

Окружение: порт 5173 был занят dev-сервером пользователя — остановлен с его
согласия; `jq` поставлен через `brew install jq` (1.8.2) по выбору пользователя.

| Критерий                                                            | Результат                                                                                                                      |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `npm run dev`                                                       | concurrently поднял `[api] mock-api: http://localhost:3001/api/org-tree (53 nodes)` и `[web] VITE v8.3.0 ready`, Local 5173    |
| `jq 'length'`                                                       | 53                                                                                                                             |
| корни                                                               | 5                                                                                                                              |
| глубина                                                             | уровни 1/2/3 = 5/14/34, max 3; у всех 34 команд цепочка родитель → родитель → корень; неизвестных `parentId` нет, id уникальны |
| поля                                                                | `performance` целое 0–100, `updatedAt` `YYYY-MM-DDTHH:mm:ss.sssZ`, `parentId` только string/null, у всех 7 ключей              |
| два запроса подряд                                                  | `diff` пуст, ETag совпадает с sha256 тела                                                                                      |
| перезапуск процесса                                                 | PID 65803 → 66485, тело и ETag идентичны; генерация в двух отдельных процессах даёт одинаковый sha256                          |
| If-None-Match                                                       | 304, тело 0 байт, ETag и Cache-Control в ответе; список с `W/` — 304; чужой тег — 200                                          |
| прокси `localhost:5173/api/org-tree`                                | 200, тело идентично прямому; 304 через прокси тоже работает                                                                    |
| `scenario=empty`                                                    | 200 `[]`                                                                                                                       |
| `scenario=error`                                                    | 500 `{"error":"Mock server error (scenario=error)"}`                                                                           |
| `scenario=invalid`                                                  | 200, валидный JSON; 1 узел с `performance: "41"` (string), 1 узел без `id`                                                     |
| `delay=3000`                                                        | ответ через 3.0 с                                                                                                              |
| `POST /api/dev/touch`                                               | изменился ровно 1 узел, поля `headcount` (7 → 8) и `updatedAt`; длина и порядок массива те же; старый ETag → 200, новый → 304  |
| `npx lerna run typecheck --no-bail && npx lerna run lint --no-bail` | 6/6 и 6/6, exit 0                                                                                                              |

Стор (временные пробы, откачены, файлы побайтово совпадают с исходными):

- с пустыми реестрами страница рендерится, в консоли браузера только сообщения Vite
  и React DevTools;
- пробный слайс в `combineSlices(...)` и сага в `packageSagas`: typecheck чистый,
  `RootState['probe']['pings']` — `number`, `@ts-expect-error` на `state.missing`
  срабатывает; в headless Chrome сага выполнила `put` + `select` и вывела
  `SAGA_PROBE pings = 1`;
- lint на нарушениях: импорт из `redux-saga/effects` и `typed-redux-saga/macro` —
  `use-typed-effects`; `yield call(...)` и `yield take(...)` без `*` — `delegate-effects`.

`npm run build -w @app/web` — успешно. `npm audit` — те же 5 high через lerna,
новые зависимости уязвимостей не добавили.

## Известные проблемы

- `@jambit/eslint-plugin-typed-redux-saga` заброшен (последний релиз 2022) и работает
  только через `fixupPluginRules`. Правило `delegate-effects` при загрузке делает
  `require('typed-redux-saga')`, но не объявляет его зависимостью — находит пакет
  лишь благодаря хойстингу из `@app/web`.
- При остановке `npm run dev` tsx пишет «Previous process hasn't exited yet. Force
  killing...» — косметика, процессы завершаются.
- В mock-api нет автотестов: критерии проверены вручную командами выше.

## Авторство

> Секция добавлена 2026-09-15 после ревью (`2026-09-15-step-01-review-fixes.md`); заполнена по ходу той же сессии, не по памяти.

- Сгенерировано агентом: `apps/mock-api` целиком (включая каталог имён и выбор диапазонов
  метрик), стор в `apps/web/src/app/store`, изменения `vite.config.ts`, ESLint и
  корневого `package.json`, эта запись. Решения: `combineSlices`, `@eslint/compat`,
  собственные (не агрегированные) метрики, перемешанный порядок узлов.
- Написано или переписано человеком: нет (агент не наблюдал).
- Решения и указания человека: ТЗ; выбор «остановить свой dev-сервер», «brew install
  jq», «журнал отдельным файлом».
