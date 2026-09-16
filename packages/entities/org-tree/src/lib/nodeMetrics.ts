import type { OrgTreeItem } from '../model/selectors';
import { getPerformanceLevel, type PerformanceLevel } from '@shared/theme';

export type PerformanceIndicator = PerformanceLevel | 'none';

export interface NodeMetrics {
  /** Сотрудники, закреплённые непосредственно за подразделением (headcount из API). */
  ownHeadcount: number;
  /** Собственные сотрудники подразделения и всех вложенных. */
  totalHeadcount: number;
  /** Performance из API — оценка собственных сотрудников; null, если их нет. */
  ownPerformance: number | null;
  ownPerformanceLevel: PerformanceIndicator;
  /** Performance всех сотрудников подразделения, взвешенный по людям, округлённый; null — людей нет. */
  totalPerformance: number | null;
  totalPerformanceLevel: PerformanceIndicator;
}

const levelOf = (value: number | null): PerformanceIndicator =>
  value === null ? 'none' : getPerformanceLevel(value);

/**
 * Что показывает карточка узла: собственные значения и значения по всему подразделению —
 * парами, чтобы было видно, откуда берётся итог. Каждый человек учитывается один раз:
 * общая численность = собственные + общие у детей, общая эффективность взвешена по
 * собственным сотрудникам каждого узла.
 */
export function getNodeMetrics<TItem extends Pick<OrgTreeItem, 'node' | 'subtree'>>({
  node,
  subtree,
}: TItem): NodeMetrics {
  const ownPerformance = node.headcount > 0 ? node.performance : null;
  const totalPerformance = subtree.performance === null ? null : Math.round(subtree.performance);
  return {
    ownHeadcount: node.headcount,
    totalHeadcount: subtree.headcount,
    ownPerformance,
    ownPerformanceLevel: levelOf(ownPerformance),
    totalPerformance,
    // Диапазон по тому же округлённому числу, что видит пользователь.
    totalPerformanceLevel: levelOf(totalPerformance),
  };
}

export interface MetricRow {
  /** Стабильный ключ строки: для React и data-metric в разметке. */
  key:
    | 'headcount'
    | 'performance'
    | 'own-headcount'
    | 'total-headcount'
    | 'own-performance'
    | 'total-performance';
  label: string;
  value: string;
  /** Цветной индикатор рядом со значением: собственная или общая эффективность. */
  indicator?: 'own' | 'total';
}

const format = (value: number | null) => (value === null ? '—' : String(value));

/**
 * Строки карточки. У листа агрегатов не бывает — общие значения равны собственным, поэтому
 * две строки без уточнений. У узла с детьми — пары «собственные / общие».
 */
export function getMetricRows(metrics: NodeMetrics, isLeaf: boolean): MetricRow[] {
  if (isLeaf) {
    return [
      { key: 'headcount', label: 'Численность', value: format(metrics.ownHeadcount) },
      {
        key: 'performance',
        label: 'Эффективность',
        value: format(metrics.totalPerformance),
        indicator: 'total',
      },
    ];
  }
  return [
    { key: 'own-headcount', label: 'Собственных сотрудников', value: format(metrics.ownHeadcount) },
    { key: 'total-headcount', label: 'Общая численность', value: format(metrics.totalHeadcount) },
    {
      key: 'own-performance',
      label: 'Собственная эффективность',
      value: format(metrics.ownPerformance),
      indicator: 'own',
    },
    {
      key: 'total-performance',
      label: 'Общая эффективность',
      value: format(metrics.totalPerformance),
      indicator: 'total',
    },
  ];
}
