# Проверка запрета глубоких импортов

Дата: 2026-09-15

Повторная и более строгая проверка критерия №2 из
`2026-09-15-step-01-scaffold.md`: глубокие импорты в workspace-пакеты закрывает
именно поле `exports`, а не алиасы или случайность. Подтверждено контрольным опытом.

## Изменения

Нет. Пробы и правки `package.json` были временными и откачены, `git diff` пустой.

## Решения

- Проверка сделана с контролем: убрав `exports`, убеждаемся, что те же импорты
  начинают резолвиться. Без этого «не резолвится» могло объясняться чем-то
  посторонним (опечаткой в пути, отсутствием файла и т.п.).
- Резолвер Vite проверен двумя способами: матрицей через
  `server.environments.client.pluginContainer.resolveId` и сквозным прогоном
  реального приложения (прямой `npx vite build` и dev-сервер).
- Сквозная проба стоит в модуле, который действительно входит в граф
  (`main.tsx → router → @pages/org-dashboard → OrgDashboardPage.tsx`). Пробный файл,
  который никто не импортирует, бандлер вообще не резолвит, и сборка прошла бы
  молча — ложный успех.
- `vite build` запускался напрямую, а не через `npm run build`: скрипт сначала
  выполняет typecheck, и сборка упала бы на TS2307 раньше, чем бандлер начнёт
  резолвить импорты.

## Отступления от инструкции

Нет.

## Проверки

Исходное состояние: у всех пакетов нет `main`/`module`/`browser`/`typesVersions`;
`tsc --showConfig` во всех шести tsconfig показывает `moduleResolution: bundler` без
`paths`/`baseUrl`/`customConditions`; алиасов в `vite.config.ts` нет.

Проба из `@pages/org-dashboard`:

| Импорт                             | tsc (bundler) | Vite         | Node `require.resolve`        | ESLint               |
| ---------------------------------- | ------------- | ------------ | ----------------------------- | -------------------- |
| `@shared/lib`                      | ok            | ok           | ok                            | ok                   |
| `@shared/lib/src/internal`         | TS2307        | not exported | ERR_PACKAGE_PATH_NOT_EXPORTED | no-unresolved        |
| `@shared/lib/src/internal.ts`      | TS2307        | not exported | ERR_PACKAGE_PATH_NOT_EXPORTED | no-unresolved        |
| `@shared/lib/src/index`            | TS2307        | not exported | ERR_PACKAGE_PATH_NOT_EXPORTED | no-unresolved        |
| `@shared/lib/src`                  | TS2307        | not exported | ERR_PACKAGE_PATH_NOT_EXPORTED | no-unresolved        |
| `@shared/theme/src/theme`          | TS2307        | not exported | ERR_PACKAGE_PATH_NOT_EXPORTED | no-unresolved        |
| `../../../shared/lib/src/internal` | резолвится    | резолвится   | —                             | no-relative-packages |

Через tsconfig приложения (`apps/web`) глубокий импорт тоже даёт TS2307.

Контроль и режимы отказа:

- **`exports` удалён** из `@shared/lib`: в tsc TS2307 по его глубоким импортам
  исчезли, Vite резолвит все четыре варианта. `@shared/theme` при этом по-прежнему
  закрыт. Значит, блокирует именно `exports`.
- **`moduleResolution: node10`** при нетронутом `exports`: tsc резолвит все глубокие
  импорты, потому что node10 не читает `exports`. В TS 6 node10 объявлен устаревшим
  и без `ignoreDeprecations: "6.0"` даёт ошибку TS5107, так что случайный откат
  на него будет заметен сразу.
- **Лишние `main` и `module`** (оба `./src/index.ts`) при `bundler`: ничего не открывают.
  Осталось 5 из 5 TS2307, Vite и Node по-прежнему блокируют. При наличии `exports`
  эти поля игнорируются. Опасны они только для инструментов, которые не читают
  `exports` (node10, старые резолверы).

Сквозная проверка бандлера. В `OrgDashboardPage.tsx` добавлен
`import { internalOnly } from '@shared/lib/src/internal'`:

| Режим                     | `exports` на месте                                                                                                                       | `exports` удалён (контроль; `main` добавлен, чтобы работал `"."`)                     |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `npx vite build` напрямую | exit 1: `[rolldown:vite-resolve] … "./src/internal" is not exported under the conditions ["module", "browser", "production", "import"]`  | exit 0; строка из `internal.ts` попала в бандл                                        |
| `vite` dev                | модуль отдаётся с HTTP 500 (`… not exported under the conditions [… "development" …]`), dep-scan падает с той же ошибкой, `#root` пустой | импорт переписан на `/@fs/…/packages/shared/lib/src/internal.ts`, страница рендерится |

Build и dev ведут себя одинаково: расхождений между двумя путями резолва нет.
В Vite 8 бандлер Rolldown, поэтому текст ошибки отличается от роллаповского
«Failed to resolve import».

Скрипты:

- `tsconfig.node.json` после переезда в монорепозиторий проверяет ровно
  `apps/web/vite.config.ts` (`--listFilesOnly`). `tsconfig.json` приложения этот файл
  не включает, так что пересечения нет. Если бы `include` не находил файлов, tsc
  упал бы с TS18003, а не прошёл молча.
- `lerna run typecheck` запускает `tsc` в каждом из 5 проектов. Кеш nx не срабатывает
  (0/5 попаданий при повторном запуске), значит ложных пропусков нет. Доказательство
  через внесённые ошибки: TS2322 в `@shared/ui` (его никто не импортирует) и в
  `@shared/lib/src/internal.ts` (недоступен из `exports`). `npm run typecheck -w @app/web`
  при этом проходит, потому что этих файлов нет в программе приложения, а
  `lerna run typecheck` падает.
- `lerna run build` запускает только `@app/web`: у пакетов-исходников скрипта `build` нет.

## Известные проблемы

- По умолчанию `lerna run` останавливается после первого упавшего пакета. При ошибках
  в `@shared/ui` и `@shared/lib` в сводке «Failed tasks» указан только `@shared/ui`,
  а `@shared/lib` значится как «not run», хотя его ошибка есть в логе.
  С `--no-bail` в сводке оба. Корневые скрипты пока без этого флага.
- `exports` работает только для импортов по имени пакета. Относительный путь в
  чужой пакет (`../../../shared/lib/src/internal`) резолвится и в tsc, и в Vite.
  Его ловит только ESLint (`import/no-relative-packages`); без прогона lint такой
  обход пройдёт.
- Автоматической регрессионной проверки нет. Если `moduleResolution` сменится на
  node10 с `ignoreDeprecations`, typecheck глубокие импорты пропустит, заметит только
  ESLint (`import/no-unresolved`: его резолвер не зависит от tsconfig).

## Авторство

> Секция добавлена 2026-09-15 после ревью (`2026-09-15-step-01-review-fixes.md`); заполнена по ходу той же сессии, не по памяти.

- Сгенерировано агентом: пробы и скрипты проверки, контрольные опыты (удаление
  `exports`, node10, лишние `main`/`module`), эта запись.
- Написано или переписано человеком: нет (агент не наблюдал).
- Решения и указания человека: запрос проверки с гипотезами об отказе (старый
  `moduleResolution`, лишний `main`) — из другой сессии; требование запускать
  `npx vite build` напрямую и проверить dev-сервер, `tsconfig.node.json` и охват
  `lerna run typecheck`.
