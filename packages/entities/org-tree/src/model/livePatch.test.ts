/** @vitest-environment node */
import { describe, expect, it } from 'vitest';
import { aggregateSubtrees } from './aggregate';
import type { OrgTreePatch } from './live';
import { applyOrgTreePatch } from './livePatch';
import { DEFAULT_ORG_TREE_PARAMS, type OrgTreeParams } from './params';
import { parseOrgTree, type OrgNode } from './schema';
import { selectVisibleTree, type VisibleOrgTreeNode } from './selectors';
import { selectTableRows } from './table';
import { makeOrgNodes, stateWith } from './testing/fixtures';

const UPDATED_AT = '2026-09-16T10:00:00.000Z';

const makePatch = (patch: Partial<OrgTreePatch>): OrgTreePatch => ({
  seq: 1,
  nodes: [],
  removed: [],
  added: [],
  ...patch,
});

const apply = (nodes: OrgNode[], patch: OrgTreePatch, q = '') =>
  applyOrgTreePatch(nodes, aggregateSubtrees(nodes), patch, q);

const tableIds = (nodes: readonly OrgNode[], params: OrgTreeParams = DEFAULT_ORG_TREE_PARAMS) =>
  selectTableRows(stateWith([...nodes], params), params).map((row) => row.id);

/** Дерево со всеми раскрытыми узлами: id в порядке обхода и родитель каждого. */
function treeParents(nodes: readonly OrgNode[]): Map<string, string | null> {
  const parents = new Map<string, string | null>();
  const walk = (list: VisibleOrgTreeNode[], parentId: string | null) => {
    for (const node of list) {
      parents.set(node.id, parentId);
      walk(node.children, node.id);
    }
  };
  const all = new Set(nodes.map((node) => node.id));
  walk(selectVisibleTree(stateWith([...nodes]), DEFAULT_ORG_TREE_PARAMS, all), null);
  return parents;
}

describe('applyOrgTreePatch', () => {
  it('порядок строк не меняется после патча, даже если новое значение нарушает сортировку', () => {
    // Ответ на sort=totalHeadcount&dir=desc: «Команда 2» (10) раньше «Команды 1» (6).
    const params: OrgTreeParams = {
      ...DEFAULT_ORG_TREE_PARAMS,
      sort: 'totalHeadcount',
      dir: 'desc',
    };
    const nodes = makeOrgNodes();
    const before = tableIds(nodes, params);
    expect(before.indexOf('t-2')).toBeLessThan(before.indexOf('t-1'));

    const { nodes: next } = apply(
      nodes,
      makePatch({ nodes: [{ id: 't-1', headcount: 60, updatedAt: UPDATED_AT }] }),
    );

    expect(tableIds(next, params)).toEqual(before);
    expect(next.map((node) => [node.id, node.order, node.matches])).toEqual(
      nodes.map((node) => [node.id, node.order, node.matches]),
    );
    expect(next.find((node) => node.id === 't-1')).toMatchObject({
      headcount: 60,
      updatedAt: UPDATED_AT,
    });
  });

  it('нетронутые узлы сохраняют ссылки', () => {
    const nodes = makeOrgNodes();
    const { nodes: next } = apply(
      nodes,
      makePatch({ nodes: [{ id: 't-1', performance: 41, updatedAt: UPDATED_AT }] }),
    );
    next.forEach((node, index) => {
      if (node.id === 't-1') {
        expect(node).not.toBe(nodes[index]);
      } else {
        expect(node).toBe(nodes[index]);
      }
    });
  });

  it('агрегаты после серии патчей совпадают с полным расчётом', () => {
    let nodes = makeOrgNodes();
    let index = aggregateSubtrees(nodes);
    const patches = [
      makePatch({
        seq: 1,
        nodes: [{ id: 't-1', headcount: 9, performance: 55, updatedAt: UPDATED_AT }],
      }),
      makePatch({ seq: 2, nodes: [{ id: 'p-3', budget: 75, updatedAt: UPDATED_AT }] }),
      makePatch({ seq: 3, removed: ['t-2'] }),
      makePatch({
        seq: 4,
        added: [
          {
            id: 'new',
            name: 'Новая',
            parentId: 'p-3',
            headcount: 7,
            budget: 30,
            performance: 90,
            updatedAt: UPDATED_AT,
          },
        ],
      }),
      makePatch({ seq: 5, nodes: [{ id: 'd-a', headcount: 0, updatedAt: UPDATED_AT }] }),
    ];
    for (const patch of patches) {
      const result = applyOrgTreePatch(nodes, index, patch, '');
      nodes = result.nodes;
      index = result.index;
      const expected = aggregateSubtrees(nodes);
      expect(index.size).toBe(expected.size);
      for (const [id, entry] of expected) {
        expect(index.get(id)).toEqual(entry);
      }
    }
  });

  it('удаление узла патчем убирает его из таблицы и дерева; order остаётся перестановкой', () => {
    const nodes = makeOrgNodes();
    const { nodes: next, removed } = apply(nodes, makePatch({ removed: ['p-2'] }));

    expect(removed).toEqual(['p-2']);
    expect(tableIds(next)).toEqual(tableIds(nodes).filter((id) => id !== 'p-2'));
    expect(treeParents(next).has('p-2')).toBe(false);
    expect(treeParents(next).size).toBe(nodes.length - 1);
    // Схема ответа проверяет и order: 0..n-1 без пропусков.
    expect(() => parseOrgTree(next)).not.toThrow();
  });

  it('добавление узла патчем — появляется на своём месте: под родителем, последним из соседей', () => {
    const nodes = makeOrgNodes();
    const added = {
      id: 't-new',
      name: 'Команда 0',
      parentId: 'p-1',
      headcount: 4,
      budget: 80,
      performance: 70,
      updatedAt: UPDATED_AT,
    };
    const { nodes: next, index } = apply(nodes, makePatch({ added: [added] }));

    // Строки группируются по иерархии: новая — сразу после последнего ребёнка «Отдела 1», а не в
    // конце таблицы; по имени («Команда 0») её место было бы первым — порядок не пересчитывается.
    const before = tableIds(nodes);
    const expected = before.toSpliced(before.indexOf('t-1') + 1, 0, 't-new');
    expect(tableIds(next)).toEqual(expected);
    expect(treeParents(next).get('t-new')).toBe('p-1');
    expect(next.at(-1)).toMatchObject({ ...added, matches: true, order: nodes.length });
    expect(index.get('p-1')!.headcount).toBe(1 + 10 + 6 + 4);
    expect(() => parseOrgTree(next)).not.toThrow();
  });

  it('патч, уже учтённый в данных (ответ пришёл раньше события), не дублирует узлы', () => {
    const nodes = makeOrgNodes();
    const change = makePatch({
      nodes: [{ id: 't-1', headcount: 9, updatedAt: UPDATED_AT }],
      removed: ['t-3'],
      added: [
        {
          id: 't-new',
          name: 'Команда 0',
          parentId: 'p-1',
          headcount: 4,
          budget: 80,
          performance: 70,
          updatedAt: UPDATED_AT,
        },
      ],
    });
    const once = apply(nodes, change);
    const twice = apply(once.nodes, change);

    expect(twice.nodes).toEqual(once.nodes);
    expect(() => parseOrgTree(twice.nodes)).not.toThrow();
    expect(twice.updates).toEqual({});
  });

  it('добавленный узел при непустом q не совпавший: совпадение с q клиент не вычисляет', () => {
    const nodes = makeOrgNodes();
    const { nodes: next } = apply(
      nodes,
      makePatch({
        added: [
          {
            id: 't-new',
            name: 'Команда 0',
            parentId: 'p-1',
            headcount: 1,
            budget: 1,
            performance: 1,
            updatedAt: UPDATED_AT,
          },
        ],
      }),
      'Команда',
    );
    expect(next.at(-1)!.matches).toBe(false);
  });

  describe('номера обновлений', () => {
    it('узел и предки получают seq у изменившихся видимых значений; прочие узлы и значения — нет', () => {
      const nodes = makeOrgNodes();
      const { updates } = apply(
        nodes,
        makePatch({ seq: 7, nodes: [{ id: 't-1', headcount: 10, updatedAt: UPDATED_AT }] }),
      );

      expect(updates).toEqual({
        // У листа общая эффективность равна собственной и не изменилась.
        't-1': { ownHeadcount: 7, totalHeadcount: 7 },
        'p-1': { totalHeadcount: 7, totalPerformance: 7 },
        'd-b': { totalHeadcount: 7, totalPerformance: 7 },
      });
    });

    it('видимое значение не изменилось — обновления нет', () => {
      const nodes = makeOrgNodes();
      // «Дивизион А»: (2·90 + 5·60) / 7 = 68.57 → 69; после (2·90 + 5·61) / 7 = 69.29 → 69.
      const rounded = apply(
        nodes,
        makePatch({ seq: 2, nodes: [{ id: 'p-3', performance: 61, updatedAt: UPDATED_AT }] }),
      );
      expect(rounded.updates).toEqual({ 'p-3': { ownPerformance: 2, totalPerformance: 2 } });

      // У «Команды 3» нет людей: её эффективность не входит в итоги и показывается как «—».
      const empty = apply(
        nodes,
        makePatch({ nodes: [{ id: 't-3', performance: 10, updatedAt: UPDATED_AT }] }),
      );
      expect(empty.updates).toEqual({});
    });

    it('удаление и добавление обновляют итоги предков', () => {
      const nodes = makeOrgNodes();
      const { updates } = apply(nodes, makePatch({ seq: 3, removed: ['t-2'] }));
      expect(Object.keys(updates).sort()).toEqual(['d-b', 'p-1']);
      expect(updates['p-1']).toMatchObject({ totalHeadcount: 3, totalBudget: 3 });
    });
  });
});
