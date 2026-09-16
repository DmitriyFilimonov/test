import { Fragment, memo } from 'react';
import styled from 'styled-components';
import { getMetricRows, type MetricRow, type PerformanceIndicator } from '../lib/nodeMetrics';
import { useFreshUpdates } from '../model/useFreshUpdates';
import type { UpdatableMetric } from '../model/updates';
import { updateHighlight } from './updateHighlight';

/*
 * Цвета performance заданы статическими правилами по data-атрибутам: по пять диапазонов
 * (плюс «нет данных») для общей и собственной эффективности — в одном классе. Интерполяция
 * цвета от числа дала бы новый класс на каждое значение и дописывание таблицы стилей при
 * каждой ревалидации.
 */
const Card = styled.div`
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space.sm};
  width: 100%;
  height: 100%;
  padding: ${({ theme }) => `${theme.space.sm} ${theme.space.sm} ${theme.space.sm} ${theme.space.md}`};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-left: 4px solid var(--total-performance-color);
  border-radius: ${({ theme }) => theme.radii.md};
  background: ${({ theme }) => theme.colors.background};
  color: ${({ theme }) => theme.colors.text};
  font-family: ${({ theme }) => theme.fonts.body};
  font-size: ${({ theme }) => theme.fontSizes.md};
  line-height: 1.25;

  /* Выбор — не только фоном: рамка внутри карточки, и aria-current у кнопки названия. */
  &[data-selected='true'] {
    background: ${({ theme }) => theme.colors.selected};
    box-shadow: inset 0 0 0 2px ${({ theme }) => theme.colors.primary};
  }

  /* Несовпавшие с фильтром: одно статическое правило, узел остаётся интерактивным. */
  &[data-dimmed='true'] {
    opacity: 0.45;
  }

  &[data-performance='critical'] {
    --total-performance-color: ${({ theme }) => theme.colors.performance.critical};
  }
  &[data-performance='low'] {
    --total-performance-color: ${({ theme }) => theme.colors.performance.low};
  }
  &[data-performance='mid'] {
    --total-performance-color: ${({ theme }) => theme.colors.performance.mid};
  }
  &[data-performance='high'] {
    --total-performance-color: ${({ theme }) => theme.colors.performance.high};
  }
  &[data-performance='top'] {
    --total-performance-color: ${({ theme }) => theme.colors.performance.top};
  }
  &[data-performance='none'] {
    --total-performance-color: ${({ theme }) => theme.colors.performanceNone};
  }

  &[data-own-performance='critical'] {
    --own-performance-color: ${({ theme }) => theme.colors.performance.critical};
  }
  &[data-own-performance='low'] {
    --own-performance-color: ${({ theme }) => theme.colors.performance.low};
  }
  &[data-own-performance='mid'] {
    --own-performance-color: ${({ theme }) => theme.colors.performance.mid};
  }
  &[data-own-performance='high'] {
    --own-performance-color: ${({ theme }) => theme.colors.performance.high};
  }
  &[data-own-performance='top'] {
    --own-performance-color: ${({ theme }) => theme.colors.performance.top};
  }
  &[data-own-performance='none'] {
    --own-performance-color: ${({ theme }) => theme.colors.performanceNone};
  }
`;

const Header = styled.div`
  display: flex;
  align-items: flex-start;
  gap: ${({ theme }) => theme.space.xs};
`;

/** Выбор узла с клавиатуры; мышью выбирает клик по любому месту карточки. */
const SelectButton = styled.button`
  flex: 1;
  min-width: 0;
  padding: 0;
  border: 0;
  border-radius: ${({ theme }) => theme.radii.sm};
  background: none;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;

  &:focus-visible {
    outline: none;
    box-shadow: 0 0 0 2px ${({ theme }) => theme.colors.focus};
  }
`;

const Name = styled.span`
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  overflow: hidden;
  font-weight: 600;
`;

/* Два символа вместо поворота: трансформации внутри foreignObject WebKit рисует с ошибками. */
const Chevron = styled.button`
  flex: none;
  width: 24px;
  height: 24px;
  margin: -2px -2px 0 0;
  padding: 0;
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.sm};
  background: ${({ theme }) => theme.colors.surface};
  color: ${({ theme }) => theme.colors.text};
  font: inherit;
  font-size: ${({ theme }) => theme.fontSizes.lg};
  line-height: 1;
  cursor: pointer;

  &:hover {
    border-color: ${({ theme }) => theme.colors.primary};
  }

  &:focus-visible {
    outline: none;
    box-shadow: 0 0 0 2px ${({ theme }) => theme.colors.focus};
  }
`;

const Metrics = styled.dl`
  display: grid;
  grid-template-columns: 1fr auto;
  column-gap: ${({ theme }) => theme.space.sm};
  row-gap: 2px;
  margin: 0;
  color: ${({ theme }) => theme.colors.textMuted};
  font-size: ${({ theme }) => theme.fontSizes.sm};
`;

const Label = styled.dt`
  white-space: nowrap;
`;

const Value = styled.dd`
  display: inline-flex;
  align-items: center;
  justify-content: flex-end;
  gap: ${({ theme }) => theme.space.xs};
  margin: 0;
  color: ${({ theme }) => theme.colors.text};
  font-variant-numeric: tabular-nums;

  ${updateHighlight}
`;

/** Какое значение показывает строка карточки: у листа общие значения равны собственным. */
const ROW_METRICS: Record<MetricRow['key'], Exclude<UpdatableMetric, 'totalBudget'>> = {
  headcount: 'ownHeadcount',
  performance: 'totalPerformance',
  'own-headcount': 'ownHeadcount',
  'total-headcount': 'totalHeadcount',
  'own-performance': 'ownPerformance',
  'total-performance': 'totalPerformance',
};

const OwnIndicator = styled.span`
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--own-performance-color);
`;

const TotalIndicator = styled(OwnIndicator)`
  background: var(--total-performance-color);
`;

export interface OrgNodeCardProps {
  id: string;
  name: string;
  ownHeadcount: number;
  totalHeadcount: number;
  ownPerformance: number | null;
  ownPerformanceLevel: PerformanceIndicator;
  totalPerformance: number | null;
  totalPerformanceLevel: PerformanceIndicator;
  childCount: number;
  expanded: boolean;
  width: number;
  height: number;
  selected: boolean;
  /** Приглушить: узел не совпал с фильтром, а таблица на экране. */
  dimmed: boolean;
  /** Номер патча, последним изменившего значение; нет — значение патчами не менялось. */
  ownHeadcountUpdate?: number;
  totalHeadcountUpdate?: number;
  ownPerformanceUpdate?: number;
  totalPerformanceUpdate?: number;
}

/**
 * Карточка подразделения. У узла с детьми собственные значения и значения по всему подразделению
 * показаны рядом, подписанными полями; у листа — только численность и эффективность.
 * Только примитивные пропсы: при раскрытии другого узла React.memo пропускает перерисовку.
 * Координаты сюда не приходят — позицию задаёт холст.
 * Клики обрабатывает один делегированный слушатель дерева по data-id / data-chevron.
 * Значение, изменённое патчем после монтирования карточки, подсвечивается так же, как ячейка
 * таблицы (`updateHighlight`).
 */
export const OrgNodeCard = memo(function OrgNodeCard({
  id,
  name,
  ownHeadcount,
  totalHeadcount,
  ownPerformance,
  ownPerformanceLevel,
  totalPerformance,
  totalPerformanceLevel,
  childCount,
  expanded,
  width,
  height,
  selected,
  dimmed,
  ownHeadcountUpdate,
  totalHeadcountUpdate,
  ownPerformanceUpdate,
  totalPerformanceUpdate,
}: OrgNodeCardProps) {
  const fresh = useFreshUpdates({
    ownHeadcount: ownHeadcountUpdate,
    totalHeadcount: totalHeadcountUpdate,
    ownPerformance: ownPerformanceUpdate,
    totalPerformance: totalPerformanceUpdate,
  });
  const rows = getMetricRows(
    {
      ownHeadcount,
      totalHeadcount,
      ownPerformance,
      ownPerformanceLevel,
      totalPerformance,
      totalPerformanceLevel,
    },
    childCount === 0,
  );
  return (
    <foreignObject width={width} height={height}>
      <Card
        data-id={id}
        data-performance={totalPerformanceLevel}
        data-own-performance={ownPerformanceLevel}
        data-selected={selected}
        data-dimmed={dimmed}
      >
        <Header>
          <SelectButton type="button" aria-current={selected ? 'true' : undefined} title={name}>
            <Name>{name}</Name>
          </SelectButton>
          {childCount > 0 && (
            <Chevron
              type="button"
              data-chevron=""
              aria-expanded={expanded}
              aria-label={`${expanded ? 'Свернуть' : 'Развернуть'}: ${name}`}
            >
              {expanded ? '▾' : '▸'}
            </Chevron>
          )}
        </Header>
        <Metrics>
          {rows.map((row) => {
            const update = fresh[ROW_METRICS[row.key]];
            return (
              <Fragment key={row.key}>
                <Label>{row.label}</Label>
                <Value key={update} data-metric={row.key} data-updated={update}>
                  {row.indicator === 'own' && <OwnIndicator aria-hidden="true" />}
                  {row.indicator === 'total' && <TotalIndicator aria-hidden="true" />}
                  {row.value}
                </Value>
              </Fragment>
            );
          })}
        </Metrics>
      </Card>
    </foreignObject>
  );
});
