import { memo } from 'react';
import styled from 'styled-components';
import { formatBudget, formatPerformance } from '../model/format';
import { useFreshUpdates } from '../model/useFreshUpdates';
import { Cell } from './tableCells';
import { updateHighlight } from './updateHighlight';

/** Цифры одной ширины: колонка не «дышит», когда строки меняются местами. */
const NumberCell = styled(Cell)`
  text-align: right;
  font-variant-numeric: tabular-nums;

  ${updateHighlight}
`;

/** Шаг отступа названия на уровень. */
const INDENT_STEP_PX = 20;

/** Уровни со своим отступом; глубже — отступ последнего из них. */
const INDENTED_LEVELS = 8;

/*
 * Правила отступа статические, по data-level: строятся один раз при загрузке модуля, а не
 * из пропсов в рендере (инлайн-стили и стили из пропсов запрещены ради критического пути).
 */
const INDENT_RULES = Array.from(
  { length: INDENTED_LEVELS },
  (_, index) => `&[data-level='${index + 1}'] { --indent: ${index * INDENT_STEP_PX}px; }`,
).join('\n');

/* Глубина — отступом названия. */
const NameCell = styled(Cell)`
  ${INDENT_RULES}
  padding-left: calc(
    ${({ theme }) => theme.space.sm} + var(--indent, ${(INDENTED_LEVELS - 1) * INDENT_STEP_PX}px)
  );
`;

/*
 * Выбор показан и фоном, и маркером слева: inset-тень не занимает места, строка не
 * сдвигается. Строка контекста (предок совпавшего узла) приглушена. Правила статические,
 * по data-атрибутам. Фокус с клавиатуры — рамкой внутри строки, не только фоном; прокрутка к
 * строке оставляет над ней место под липкий заголовок.
 */
const Row = styled.tr`
  cursor: pointer;
  scroll-margin-top: ${({ theme }) => theme.table.rowHeight};

  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.colors.focus};
    outline-offset: -2px;
  }

  &[data-matches='false'] {
    color: ${({ theme }) => theme.colors.textMuted};
  }

  &:hover {
    background: ${({ theme }) => theme.colors.surface};
  }

  &[data-selected='true'] {
    background: ${({ theme }) => theme.colors.selected};
  }

  &[data-selected='true'] > ${Cell}:first-child {
    box-shadow: inset 4px 0 0 ${({ theme }) => theme.colors.primary};
  }
`;

const NameButton = styled.button`
  display: block;
  width: 100%;
  padding: 0;
  border: 0;
  background: none;
  color: inherit;
  font: inherit;
  text-align: left;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  cursor: pointer;

  /* Ячейка обрезает содержимое: рамка фокуса рисуется внутрь кнопки. */
  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.colors.focus};
    outline-offset: -2px;
  }
`;

export interface OrgTableRowProps {
  id: string;
  name: string;
  level: number;
  totalHeadcount: number;
  totalBudget: number;
  totalPerformance: number | null;
  /** false — строка контекста: сам узел не совпал с фильтром, совпал потомок. */
  matches: boolean;
  selected: boolean;
  /** Строка в порядке Tab (roving tabindex): у одной строки таблицы 0, у остальных -1. */
  focusable: boolean;
  /** Номер патча, последним изменившего итог; нет — итог патчами не менялся. */
  totalHeadcountUpdate?: number;
  totalBudgetUpdate?: number;
  totalPerformanceUpdate?: number;
}

/**
 * Строка таблицы. Только примитивные пропсы и никаких позиционных (индекс, чётность):
 * при смене порядка React.memo пропускает строки с теми же данными. Клики и клавиши обрабатывают
 * делегированные слушатели таблицы по data-id. Фокус получает сама строка; кнопка с названием
 * вне порядка Tab: для скринридера она остаётся кнопкой в режиме чтения.
 *
 * Итог, изменённый патчем после монтирования строки, подсвечивается (`updateHighlight`): у ячейки
 * data-updated и key с номером патча, повторное обновление — новая ячейка и анимация с начала.
 */
export const OrgTableRow = memo(function OrgTableRow({
  id,
  name,
  level,
  totalHeadcount,
  totalBudget,
  totalPerformance,
  matches,
  selected,
  focusable,
  totalHeadcountUpdate,
  totalBudgetUpdate,
  totalPerformanceUpdate,
}: OrgTableRowProps) {
  const fresh = useFreshUpdates({
    headcount: totalHeadcountUpdate,
    budget: totalBudgetUpdate,
    performance: totalPerformanceUpdate,
  });
  return (
    <Row
      data-id={id}
      data-selected={selected}
      data-matches={matches}
      aria-current={selected ? 'true' : undefined}
      tabIndex={focusable ? 0 : -1}
    >
      <NameCell data-level={level}>
        <NameButton type="button" tabIndex={-1} title={name}>
          {name}
        </NameButton>
      </NameCell>
      <NumberCell>{level}</NumberCell>
      <NumberCell key={`headcount-${fresh.headcount}`} data-updated={fresh.headcount}>
        {totalHeadcount}
      </NumberCell>
      <NumberCell key={`budget-${fresh.budget}`} data-updated={fresh.budget}>
        {formatBudget(totalBudget)}
      </NumberCell>
      <NumberCell key={`performance-${fresh.performance}`} data-updated={fresh.performance}>
        {formatPerformance(totalPerformance)}
      </NumberCell>
    </Row>
  );
});
