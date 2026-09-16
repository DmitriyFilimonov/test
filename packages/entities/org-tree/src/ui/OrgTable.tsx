import { memo, useCallback, useEffect, useRef, type MouseEvent, type ReactNode } from 'react';
import styled, { css, useTheme } from 'styled-components';
import { ORG_TREE_MAX_QUERY_LENGTH } from '../model/params';
import type { RevealRequest } from '../model/selection';
import {
  ORG_TABLE_COLUMNS,
  type OrgTableColumn,
  type OrgTableSortColumn,
  type TableRow,
} from '../model/table';
import { useTableKeyboard } from '../model/useTableKeyboard';
import type { TableModel } from '../model/useTableModel';
import { OrgTableRow } from './OrgTableRow';
import { Button } from './primitives';
import { Cell } from './tableCells';

type AriaSort = 'ascending' | 'descending' | 'none';

const NO_ROWS: readonly TableRow[] = [];

const COLUMN_LABELS: Record<OrgTableColumn, string> = {
  name: 'Подразделение',
  level: 'Уровень',
  totalHeadcount: 'Всего сотрудников',
  totalBudget: 'Бюджет суммарный',
  totalPerformance: 'Средняя эффективность',
};

const SORT_LABELS: Record<AriaSort, string> = {
  ascending: 'сортировка по возрастанию',
  descending: 'сортировка по убыванию',
  none: 'без сортировки',
};

const SORT_GLYPHS: Record<AriaSort, string> = { ascending: '▲', descending: '▼', none: '↕' };

const visuallyHidden = css`
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  padding: 0;
  border: 0;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
`;

/** Высоту задаёт родитель (панель на странице), без неё — по содержимому. */
const Root = styled.section`
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
`;

/** Высота постоянная: ошибка и индикатор обновления появляются, не сдвигая таблицу. */
const Toolbar = styled.div`
  flex: none;
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.space.sm};
  height: 32px;
  margin-bottom: ${({ theme }) => theme.space.sm};
`;

const SearchInput = styled.input`
  box-sizing: border-box;
  flex: 0 1 280px;
  min-width: 0;
  height: 100%;
  padding: 0 ${({ theme }) => theme.space.sm};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.sm};
  background: ${({ theme }) => theme.colors.background};
  color: ${({ theme }) => theme.colors.text};
  font: inherit;

  &:focus-visible {
    outline: none;
    box-shadow: 0 0 0 2px ${({ theme }) => theme.colors.focus};
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  /* Очистка — одна, своей кнопкой: она сбрасывает q сразу, без паузы дебаунса. */
  &::-webkit-search-cancel-button {
    appearance: none;
  }
`;

const Status = styled.div`
  display: flex;
  flex: 1;
  align-items: center;
  justify-content: flex-end;
  gap: ${({ theme }) => theme.space.sm};
  min-width: 0;
  font-size: ${({ theme }) => theme.fontSizes.sm};
`;

const ErrorStatus = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.space.sm};
  min-width: 0;
  color: ${({ theme }) => theme.colors.danger};
`;

const ErrorText = styled.span`
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
`;

const ValidatingText = styled.span`
  flex: none;
  color: ${({ theme }) => theme.colors.textMuted};

  &[data-active='false'] {
    visibility: hidden;
  }
`;

/* Прокручивается сама, если родитель ограничил высоту; иначе растёт по строкам. */
const Scroller = styled.div`
  flex: 1 1 auto;
  min-height: 0;
  overflow: auto;
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.md};
  background: ${({ theme }) => theme.colors.background};
`;

/*
 * table-layout: fixed — ширины колонок из CSS заголовков, от содержимого не зависят:
 * смена строк не перестраивает колонки. Приглушение строк прежнего ключа — статическим
 * правилом по data-placeholder, а не значением из пропса.
 */
const Table = styled.table`
  width: 100%;
  min-width: 720px;
  table-layout: fixed;
  border-collapse: collapse;

  &[data-placeholder='true'] > tbody {
    opacity: 0.55;
  }
`;

const Caption = styled.caption`
  ${visuallyHidden}
`;

/* Заголовок липкий при прокрутке внутри панели. Нижняя граница — тенью: рамки ячеек при
   border-collapse уезжают вместе со строками. */
const HeaderCell = styled.th`
  position: sticky;
  top: 0;
  z-index: 1;
  box-sizing: border-box;
  height: ${({ theme }) => theme.table.rowHeight};
  padding: 0;
  box-shadow: inset 0 -1px 0 ${({ theme }) => theme.colors.border};
  background: ${({ theme }) => theme.colors.surface};
  font-weight: 600;

  &[data-column='name'] {
    width: 34%;
  }
  &[data-column='level'] {
    width: 10%;
  }
  &[data-column='totalHeadcount'] {
    width: 17%;
  }
  &[data-column='totalBudget'] {
    width: 21%;
  }
  &[data-column='totalPerformance'] {
    width: 18%;
  }
`;

const SortButton = styled.button`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.space.xs};
  width: 100%;
  height: 100%;
  padding: 0 ${({ theme }) => theme.space.sm};
  border: 0;
  background: none;
  color: inherit;
  font: inherit;
  cursor: pointer;

  &[data-numeric='true'] {
    justify-content: flex-end;
  }

  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.colors.focus};
    outline-offset: -2px;
  }
`;

/** Заголовок без сортировки: те же отступы и выравнивание, что у кнопки. */
const StaticHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: flex-end;
  height: 100%;
  padding: 0 ${({ theme }) => theme.space.sm};
`;

const HeaderLabel = styled.span`
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
`;

/** Ширина глифа постоянна: смена направления не двигает подпись. */
const SortGlyph = styled.span`
  flex: none;
  width: 1em;
  color: ${({ theme }) => theme.colors.textMuted};
  text-align: center;

  &[data-active='true'] {
    color: ${({ theme }) => theme.colors.text};
  }
`;

const MessageCell = styled(Cell)`
  color: ${({ theme }) => theme.colors.textMuted};
  text-align: center;
`;

const SkeletonBar = styled.span`
  display: block;
  width: 60%;
  height: 12px;
  border-radius: ${({ theme }) => theme.radii.sm};
  background: ${({ theme }) => theme.colors.skeleton};

  &[data-numeric='true'] {
    margin-left: auto;
  }
`;

interface SortHeaderProps {
  column: OrgTableSortColumn;
  direction: AriaSort;
  onToggle: (column: OrgTableSortColumn) => void;
}

/** Заголовок колонки: направление — в aria-sort, в aria-label кнопки и глифом. */
const SortHeader = memo(function SortHeader({ column, direction, onToggle }: SortHeaderProps) {
  const label = COLUMN_LABELS[column];
  return (
    <HeaderCell scope="col" data-column={column} aria-sort={direction}>
      <SortButton
        type="button"
        data-numeric={column !== 'name'}
        aria-label={`${label}, ${SORT_LABELS[direction]}`}
        onClick={() => onToggle(column)}
      >
        <HeaderLabel>{label}</HeaderLabel>
        <SortGlyph aria-hidden="true" data-active={direction !== 'none'}>
          {SORT_GLYPHS[direction]}
        </SortGlyph>
      </SortButton>
    </HeaderCell>
  );
});

function SkeletonRows({ count }: { count: number }) {
  return Array.from({ length: count }, (_, row) => (
    <tr key={row}>
      {ORG_TABLE_COLUMNS.map((column) => (
        <Cell key={column}>
          <SkeletonBar data-numeric={column !== 'name'} />
        </Cell>
      ))}
    </tr>
  ));
}

export interface OrgTableProps {
  model: TableModel;
  selectedId: string | null;
  onSelect: (id: string) => void;
  /**
   * Прокрутить к строке узла (`block: 'nearest'`), если она есть: выбор пришёл не из таблицы.
   * Строки нет (не совпала с фильтром) — ничего не происходит.
   */
  revealRequest?: RevealRequest | null;
}

/**
 * Аналитическая таблица подразделений. Логики сортировки и фильтрации нет: строки, порядок и
 * состояние запроса приходят моделью (`useTableModel`), действия уходят в неё же. Строки
 * сгруппированы по иерархии, глубина — отступом; по уровню таблица не сортирует.
 */
export function OrgTable({ model, selectedId, onSelect, revealRequest = null }: OrgTableProps) {
  const { table } = useTheme();
  const inputRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLTableSectionElement>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const { clearQuery, setDraftQuery, filterDisabled } = model;
  const keyboard = useTableKeyboard({
    rows: model.isLoading ? NO_ROWS : model.rows,
    onSelect,
    bodyRef,
    scrollerRef,
  });

  const handleClear = useCallback(() => {
    clearQuery();
    // Кнопка становится disabled — фокус не теряется, а возвращается в поле.
    inputRef.current?.focus();
  }, [clearQuery]);

  // Один делегированный слушатель на все строки: клик мышью по любой ячейке или по кнопке названия.
  const handleBodyClick = useCallback(
    (event: MouseEvent<HTMLTableSectionElement>) => {
      const id = (event.target as Element).closest<HTMLElement>('tr[data-id]')?.dataset.id;
      if (id) {
        onSelect(id);
      }
    },
    [onSelect],
  );

  // Эффект на запрос, а не на selectedId: выбор строкой таблицы её не прокручивает.
  useEffect(() => {
    if (!revealRequest) {
      return;
    }
    for (const row of bodyRef.current?.rows ?? []) {
      if (row.dataset.id === revealRequest.id) {
        row.scrollIntoView({ block: 'nearest' });
        return;
      }
    }
  }, [revealRequest]);

  let body: ReactNode;
  if (model.isLoading) {
    body = <SkeletonRows count={table.skeletonRows} />;
  } else if (model.rows.length > 0) {
    body = model.rows.map((row) => {
      const updates = model.updates[row.id];
      return (
        <OrgTableRow
          key={row.id}
          id={row.id}
          name={row.name}
          level={row.level}
          totalHeadcount={row.totalHeadcount}
          totalBudget={row.totalBudget}
          totalPerformance={row.totalPerformance}
          matches={row.matches}
          selected={row.id === selectedId}
          focusable={row.id === keyboard.focusableId}
          totalHeadcountUpdate={updates?.totalHeadcount}
          totalBudgetUpdate={updates?.totalBudget}
          totalPerformanceUpdate={updates?.totalPerformance}
        />
      );
    });
  } else {
    const message = !model.hasData
      ? 'Данные не загружены'
      : model.isEmpty
        ? 'В оргструктуре пока нет подразделений'
        : 'Ничего не найдено';
    body = (
      <tr>
        <MessageCell colSpan={ORG_TABLE_COLUMNS.length}>{message}</MessageCell>
      </tr>
    );
  }

  const showError = model.error !== undefined && !model.isLoading;

  return (
    <Root>
      <Toolbar>
        <SearchInput
          ref={inputRef}
          type="search"
          aria-label="Поиск подразделения по названию"
          placeholder="Поиск по названию"
          autoComplete="off"
          spellCheck={false}
          maxLength={ORG_TREE_MAX_QUERY_LENGTH}
          value={model.draftQuery}
          onChange={(event) => setDraftQuery(event.currentTarget.value)}
          disabled={filterDisabled}
        />
        <Button
          type="button"
          onClick={handleClear}
          disabled={filterDisabled || model.draftQuery === ''}
        >
          Очистить
        </Button>
        <Status>
          {showError && (
            <ErrorStatus role="alert">
              <ErrorText title={model.error?.message}>
                {model.hasData ? 'Не удалось обновить данные' : 'Не удалось загрузить данные'}
              </ErrorText>
              <Button type="button" onClick={model.retry} disabled={model.isValidating}>
                Повторить
              </Button>
            </ErrorStatus>
          )}
          <ValidatingText role="status" data-active={model.isValidating}>
            Обновление…
          </ValidatingText>
        </Status>
      </Toolbar>
      <Scroller ref={scrollerRef}>
        <Table
          data-placeholder={model.isPlaceholder}
          aria-busy={model.isLoading || model.isPlaceholder}
        >
          <Caption>
            Подразделения с итогами по всем вложенным: численность, бюджет и эффективность,
            взвешенная по сотрудникам. Сортировка — кнопками в заголовках столбцов. По строкам —
            стрелками вверх и вниз, Home и End, выбор строки — Enter или кнопкой с названием.
          </Caption>
          <thead>
            <tr>
              {ORG_TABLE_COLUMNS.map((column) =>
                column === 'level' ? (
                  <HeaderCell key={column} scope="col" data-column={column}>
                    <StaticHeader>
                      <HeaderLabel>{COLUMN_LABELS[column]}</HeaderLabel>
                    </StaticHeader>
                  </HeaderCell>
                ) : (
                  <SortHeader
                    key={column}
                    column={column}
                    direction={
                      column !== model.sort
                        ? 'none'
                        : model.dir === 'asc'
                          ? 'ascending'
                          : 'descending'
                    }
                    onToggle={model.toggleSort}
                  />
                ),
              )}
            </tr>
          </thead>
          <tbody
            ref={bodyRef}
            onClick={handleBodyClick}
            onKeyDown={keyboard.handleKeyDown}
            onFocus={keyboard.handleFocus}
            onBlur={keyboard.handleBlur}
          >
            {body}
          </tbody>
        </Table>
      </Scroller>
    </Root>
  );
}
