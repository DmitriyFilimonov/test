/** @vitest-environment node */
import { describe, expect, it } from 'vitest';
import { aggregateSubtrees } from './aggregate';
import type { OrgNode } from './schema';
import { makeOrgNodes } from './testing/fixtures';

describe('aggregateSubtrees', () => {
  const aggregates = aggregateSubtrees(makeOrgNodes());

  it('пример из обсуждения: дети по 2 человека (80 и 60), у родителя свои 2 (40) → 6 человек, 60', () => {
    const base = makeOrgNodes()[0];
    const nodes: OrgNode[] = [
      { ...base, id: 'parent', parentId: null, headcount: 2, performance: 40 },
      { ...base, id: 'a', parentId: 'parent', headcount: 2, performance: 80 },
      { ...base, id: 'b', parentId: 'parent', headcount: 2, performance: 60 },
    ];
    // (2·80 + 2·60 + 2·40) / 6 = 60: каждый человек учтён ровно один раз.
    expect(aggregateSubtrees(nodes).get('parent')).toMatchObject({ headcount: 6, performance: 60 });
  });

  it('лист — собственные значения', () => {
    expect(aggregates.get('t-1')).toEqual({ headcount: 6, budget: 120, performance: 40 });
  });

  it('суммы по поддереву', () => {
    // p-1 (1) + t-2 (10) + t-1 (6)
    expect(aggregates.get('p-1')).toMatchObject({ headcount: 17, budget: 340 });
    // d-b (4) + p-2 (3) + p-1 (1) + t-2 (10) + t-1 (6)
    expect(aggregates.get('d-b')).toMatchObject({ headcount: 24, budget: 470 });
  });

  it('performance — средневзвешенный по headcount', () => {
    // (1·10 + 10·80 + 6·40) / 17
    expect(aggregates.get('p-1')!.performance).toBeCloseTo((10 + 800 + 240) / 17);
    // (4·50 + 3·70 + 1·10 + 10·80 + 6·40) / 24
    expect(aggregates.get('d-b')!.performance).toBeCloseTo((200 + 210 + 10 + 800 + 240) / 24);
  });

  it('узел с нулевым headcount не влияет на среднее', () => {
    // p-3 (5·60) + t-3 (0·100)
    expect(aggregates.get('p-3')!.performance).toBe(60);
  });

  it('поддерево с нулевым суммарным headcount — performance null', () => {
    expect(aggregates.get('t-3')).toEqual({ headcount: 0, budget: 10, performance: null });
  });

  it('результат не зависит от порядка узлов', () => {
    expect(aggregateSubtrees(makeOrgNodes().reverse())).toEqual(aggregates);
  });

  it('узлы вне дерева (цикл) пропускаются, обход завершается', () => {
    const cycle: OrgNode[] = [
      ...makeOrgNodes(),
      { ...makeOrgNodes()[0], id: 'x', parentId: 'y' },
      { ...makeOrgNodes()[0], id: 'y', parentId: 'x' },
    ];
    const result = aggregateSubtrees(cycle);
    expect(result.has('x')).toBe(false);
    expect(result.get('d-b')).toEqual(aggregates.get('d-b'));
  });
});
