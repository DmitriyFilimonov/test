# Шаг 01 — UI дерева перенесён из widgets в entities

Дата: 2026-09-15

Пакет `@widgets/org-tree` удалён, его содержимое перенесено в `@entities/org-tree`. Слой
определяется тем, что пакет агрегирует: фича — агрегация сущностей, виджет — агрегация фич.
Дерево работает с одной сущностью и фич не агрегирует — это UI сущности, а не виджет.

## Изменения

- `packages/widgets/org-tree/src/*` → `packages/entities/org-tree/src/`:
  `lib/nodeMetrics.ts`, `lib/useTreeLayout.ts` (с тестами), `model/expansion.ts` (с тестом),
  `ui/TreeCanvas.tsx`, `ui/TreeEdge.tsx`, `ui/states.tsx`, `ui/primitives.ts`;
  `ui/OrgNode.tsx` → `ui/OrgNodeCard.tsx` (`OrgNode` → `OrgNodeCard`: в сущности уже есть
  тип `OrgNode` из схемы); `ui/OrgTreeWidget.tsx` → `ui/OrgTreeView.tsx` (`OrgTreeWidget` →
  `OrgTreeView`). Пакет `packages/widgets/org-tree` удалён.
- Внутри пакета импорты `@entities/org-tree` заменены относительными (импорт собственного
  пакета через `index.ts` дал бы цикл).
- `@entities/org-tree`: зависимости `@shared/theme`, `@shared/tidy-tree`; `styled-components` —
  peer и dev; экспорт `OrgTreeView`.
- `@pages/org-dashboard` — импорт `OrgTreeView` из `@entities/org-tree`.
- `scripts/mutation` — наборы `widgets-*` → `entities-expansion`, `entities-layout-forest`,
  `entities-node-metrics` с новыми путями.
- `CLAUDE.md` — определения слоёв по агрегации; `README.md`, `docs/requirements/step-02-table.md`,
  `step-03-ui.md`, пометка «Пересмотрено» в `2026-09-15-step-01-tree-render.md`.

## Решения

- **Слой по агрегации, а не по импортам.** Правило задал пользователь; агент до этого
  предлагал разнести содержимое по ответственности (холст — в shared, карточку — в сущность,
  композицию оставить в виджете), пользователь это отклонил. Определения записаны в CLAUDE.md,
  чтобы новые пакеты раскладывались так же.
- **Код не менялся, только место и имена.** Поведение, тесты и мутации те же; требования к
  холсту («знает только LayoutResult») и к карточке сохранены внутри пакета.

## Отступления от инструкции

Нет.

## Проверки

- `npx lerna run typecheck --no-bail` / `lint --no-bail` — 11/11 (пакетов на один меньше).
- `npx vitest run` — 11 файлов, 106 тестов (как до переноса).
- `npm run test:mutation` — 46/46 killed, все наборы по новым путям.
- `npm run build -w @app/web` — 244 модуля, успешно.
- Браузер (production, «Развернуть всё»): 53 карточки совпадают с API; у листьев 2 строки, у
  узлов с дочерними 4; после `touch` листа итоги у команды, отдела и дивизиона изменились
  согласованно (9 → 8, 22 → 21, 73 → 72); сдвиг макета 0.
- Ссылок на `@widgets/org-tree`, `OrgTreeWidget`, `OrgNodeProps` в коде нет; симлинка
  `node_modules/@widgets` нет.

## Известные проблемы

- `@entities/org-tree` стал крупным: данные, запрос, агрегаты и весь UI дерева, включая холст с
  панорамой и зумом, который про оргструктуру не знает. Если появится второе дерево другой
  сущности, холст придётся выносить в shared.
- Файлы виджета были в индексе git под старыми путями: после `mv` индекс нужно обновить
  (`git add -A packages/`).

## Авторство

- Сгенерировано агентом: перенос, переименования, правки зависимостей, наборов мутаций и
  документов, эта запись.
- Написано или переписано человеком: нет (подтверждено автором ранее).
- Решения и указания человека: «фича — агрегация сущностей, виджет — агрегация фич»; перенести
  содержимое `@widgets/org-tree` в `@entities/org-tree`.
