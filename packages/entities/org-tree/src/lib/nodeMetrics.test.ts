/** @vitest-environment node */
import { aggregateSubtrees } from '../model/aggregate';
import type { OrgNode } from '../model/schema';
import type { OrgTreeItem } from '../model/selectors';
import { describe, expect, it } from 'vitest';
import { getMetricRows, getNodeMetrics } from './nodeMetrics';

const node = (
  id: string,
  parentId: string | null,
  headcount: number,
  performance: number,
): OrgNode => ({
  id,
  name: id,
  parentId,
  headcount,
  budget: 0,
  performance,
  updatedAt: '2026-01-01T00:00:00.000Z',
  matches: true,
  order: 0,
});

function itemsOf(nodes: OrgNode[]): Map<string, OrgTreeItem> {
  const aggregates = aggregateSubtrees(nodes);
  return new Map(
    nodes.map((n) => [
      n.id,
      {
        node: n,
        childCount: nodes.filter((c) => c.parentId === n.id).length,
        subtree: aggregates.get(n.id)!,
        matches: n.matches,
      },
    ]),
  );
}

describe('getNodeMetrics', () => {
  it('родитель со своими 2 сотрудниками (40) и детьми по 2 (80 и 60): собственные 2 и 40, общие 6 и 60', () => {
    const items = itemsOf([
      node('parent', null, 2, 40),
      node('a', 'parent', 2, 80),
      node('b', 'parent', 2, 60),
    ]);

    expect(getNodeMetrics(items.get('parent')!)).toEqual({
      ownHeadcount: 2,
      totalHeadcount: 6,
      ownPerformance: 40,
      ownPerformanceLevel: 'low',
      totalPerformance: 60,
      totalPerformanceLevel: 'mid',
    });
  });

  it('лист: общие значения равны собственным', () => {
    const items = itemsOf([node('parent', null, 2, 40), node('a', 'parent', 3, 91)]);
    expect(getNodeMetrics(items.get('a')!)).toEqual({
      ownHeadcount: 3,
      totalHeadcount: 3,
      ownPerformance: 91,
      ownPerformanceLevel: 'top',
      totalPerformance: 91,
      totalPerformanceLevel: 'top',
    });
  });

  it('общая эффективность округляется, диапазон — по округлённому значению', () => {
    // (1·89 + 1·90) / 2 = 89.5 → 90 → top
    const items = itemsOf([node('parent', null, 1, 89), node('a', 'parent', 1, 90)]);
    expect(getNodeMetrics(items.get('parent')!)).toMatchObject({
      totalPerformance: 90,
      totalPerformanceLevel: 'top',
    });
  });

  it('нет собственных сотрудников — собственная эффективность не определена, общая есть', () => {
    const items = itemsOf([node('parent', null, 0, 70), node('a', 'parent', 4, 50)]);
    expect(getNodeMetrics(items.get('parent')!)).toMatchObject({
      ownHeadcount: 0,
      ownPerformance: null,
      ownPerformanceLevel: 'none',
      totalHeadcount: 4,
      totalPerformance: 50,
    });
  });

  it('в подразделении никого нет — обе эффективности не определены', () => {
    const items = itemsOf([node('parent', null, 0, 70), node('a', 'parent', 0, 50)]);
    expect(getNodeMetrics(items.get('parent')!)).toMatchObject({
      totalHeadcount: 0,
      ownPerformance: null,
      totalPerformance: null,
      totalPerformanceLevel: 'none',
    });
  });
});

describe('getMetricRows', () => {
  const items = itemsOf([
    node('parent', null, 2, 40),
    node('a', 'parent', 2, 80),
    node('b', 'parent', 2, 60),
    node('empty', 'parent', 0, 70),
  ]);
  const rows = (id: string) => {
    const item = items.get(id)!;
    return getMetricRows(getNodeMetrics(item), item.childCount === 0).map(
      ({ label, value, indicator }) => [label, value, indicator ?? null].join(' | '),
    );
  };

  it('узел с детьми — пары «собственные / общие»', () => {
    expect(rows('parent')).toEqual([
      'Собственных сотрудников | 2 | ',
      'Общая численность | 6 | ',
      'Собственная эффективность | 40 | own',
      'Общая эффективность | 60 | total',
    ]);
  });

  it('лист — только «Численность» и «Эффективность»', () => {
    expect(rows('a')).toEqual(['Численность | 2 | ', 'Эффективность | 80 | total']);
  });

  it('лист без сотрудников — эффективность «—»', () => {
    expect(rows('empty')).toEqual(['Численность | 0 | ', 'Эффективность | — | total']);
  });
});
