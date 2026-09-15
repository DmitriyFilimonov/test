import { memo } from 'react';
import styled from 'styled-components';
import { formatBudget, formatPerformance } from '../model/format';
import { Cell } from './tableCells';

/** Цифры одной ширины: колонка не «дышит», когда строки меняются местами. */
const NumberCell = styled(Cell)`
  text-align: right;
  font-variant-numeric: tabular-nums;
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
 * по data-атрибутам.
 */
const Row = styled.tr`
  cursor: pointer;

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
}

/**
 * Строка таблицы. Только примитивные пропсы и никаких позиционных (индекс, чётность):
 * при смене порядка React.memo пропускает строки с теми же данными. Клики обрабатывает
 * один делегированный слушатель таблицы по data-id. С клавиатуры строка выбирается
 * кнопкой с названием — Enter и Space у неё встроенные.
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
}: OrgTableRowProps) {
  return (
    <Row data-id={id} data-selected={selected} data-matches={matches}>
      <NameCell data-level={level}>
        <NameButton type="button" aria-current={selected ? 'true' : undefined} title={name}>
          {name}
        </NameButton>
      </NameCell>
      <NumberCell>{level}</NumberCell>
      <NumberCell>{totalHeadcount}</NumberCell>
      <NumberCell>{formatBudget(totalBudget)}</NumberCell>
      <NumberCell>{formatPerformance(totalPerformance)}</NumberCell>
    </Row>
  );
});
