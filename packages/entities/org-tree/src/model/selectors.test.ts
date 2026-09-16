/** @vitest-environment node */
import { describe, expect, it } from 'vitest';
import {
  collectExpandableSubtreeIds,
  selectChildrenIndex,
  selectExpandableIds,
  selectFirstLevelIds,
  selectIsEmpty,
  selectIsPlaceholder,
  selectOrgNodes,
  selectParentIndex,
  selectRootNodes,
  selectStatus,
  selectSubtreeAggregates,
  selectVisibleTree,
  type VisibleOrgTreeNode,
} from './selectors';
import { DEFAULT_ORG_TREE_PARAMS as P } from './params';
import { makeOrgNodes, stateWith } from './testing/fixtures';

const ids = (tree: VisibleOrgTreeNode[]): unknown =>
  tree.map((node) => (node.children.length ? { [node.id]: ids(node.children) } : node.id));

describe('селекторы оргдерева', () => {
  const nodes = makeOrgNodes();
  const state = stateWith(nodes);

  it('индекс parentId → дети, отсортированные по имени', () => {
    const index = selectChildrenIndex(state, P);
    expect(index.get(null)!.map((n) => n.id)).toEqual(['d-a', 'd-b']);
    expect(index.get('d-b')!.map((n) => n.id)).toEqual(['p-1', 'p-2']);
    expect(index.get('p-1')!.map((n) => n.id)).toEqual(['t-1', 't-2']);
    expect(index.has('t-1')).toBe(false);
  });

  it('корни и идентификаторы первого уровня', () => {
    expect(selectRootNodes(state, P).map((n) => n.name)).toEqual(['Дивизион А', 'Дивизион Б']);
    expect(selectFirstLevelIds(state, P)).toEqual(['d-a', 'd-b']);
  });

  it('раскрываемые узлы — только те, у кого есть дети', () => {
    expect([...selectExpandableIds(state, P)].sort()).toEqual(['d-a', 'd-b', 'p-1', 'p-3']);
  });

  it('ничего не раскрыто — видны только корни', () => {
    expect(ids(selectVisibleTree(state, P, new Set()))).toEqual(['d-a', 'd-b']);
  });

  it('раскрыт корень — видны его дети, внуки скрыты', () => {
    expect(ids(selectVisibleTree(state, P, new Set(['d-b'])))).toEqual([
      'd-a',
      { 'd-b': ['p-1', 'p-2'] },
    ]);
  });

  it('ребёнок раскрытого узла скрыт, если свёрнут его предок', () => {
    const tree = selectVisibleTree(state, P, new Set(['p-1']));
    expect(ids(tree)).toEqual(['d-a', 'd-b']);
  });

  it('childCount — число детей в данных, а не среди видимых', () => {
    const [, divisionB] = selectVisibleTree(state, P, new Set());
    expect(divisionB.children).toEqual([]);
    expect(divisionB.data.childCount).toBe(2);
    expect(divisionB.data.node).toBe(nodes.find((n) => n.id === 'd-b'));
  });

  it('у каждого видимого узла — итоги по всему подразделению, включая скрытых потомков', () => {
    const [, divisionB] = selectVisibleTree(state, P, new Set());
    // d-b (4) + p-2 (3) + p-1 (1) + t-2 (10) + t-1 (6), дети свёрнуты
    expect(divisionB.data.subtree).toEqual(selectSubtreeAggregates(state, P).get('d-b'));
    expect(divisionB.data.subtree.headcount).toBe(24);
    expect(divisionB.data.node.headcount).toBe(4);
  });

  it('агрегаты пересчитываются только при изменении данных', () => {
    expect(selectSubtreeAggregates(stateWith(nodes), P)).toBe(selectSubtreeAggregates(state, P));
  });

  it('мемоизация: тот же стейт и тот же Set — та же ссылка', () => {
    const expanded = new Set(['d-a']);
    expect(selectVisibleTree(state, P, expanded)).toBe(selectVisibleTree(state, P, expanded));
    expect(selectChildrenIndex(stateWith(nodes), P)).toBe(selectChildrenIndex(state, P));
  });

  it('параметры выбирают запись своего ключа; по новому ключу данных нет — данные прежнего с isPlaceholder', () => {
    const other = { ...P, q: 'отдел' };
    expect(selectOrgNodes(state, P)).toBe(nodes);
    expect(selectIsPlaceholder(state, P)).toBe(false);

    expect(selectOrgNodes(state, other)).toBe(nodes);
    expect(selectIsPlaceholder(state, other)).toBe(true);
    expect(selectStatus(state, other)).toBe('idle');
    // Производные селекторы работают поверх заглушки так же, как поверх своих данных.
    expect(selectFirstLevelIds(state, other)).toEqual(['d-a', 'd-b']);

    // Последнего успешного ключа нет (например, его запись вытеснена) — заглушки нет.
    const withoutLastKey = { orgTree: { ...stateWith(nodes, other).orgTree, lastKey: undefined } };
    expect(selectOrgNodes(withoutLastKey, P)).toEqual([]);
    expect(selectIsPlaceholder(withoutLastKey, P)).toBe(false);
  });

  it('у двух ключей свои данные — каждый набор параметров видит свою запись', () => {
    const other = { ...P, sort: 'totalBudget' as const };
    const otherNodes = makeOrgNodes().filter((node) => node.parentId === null);
    const twoKeys = {
      orgTree: {
        entries: {
          ...stateWith(nodes).orgTree.entries,
          ...stateWith(otherNodes, other).orgTree.entries,
        },
        lastKey: undefined,
      },
    };
    expect(selectOrgNodes(twoKeys, P)).toBe(nodes);
    expect(selectOrgNodes(twoKeys, other)).toBe(otherNodes);
    expect(selectExpandableIds(twoKeys, other)).toEqual([]);
  });

  it('новые данные той же структуры: индексы структуры прежние, дерево — с новыми значениями и matches', () => {
    const structureOf = (state: ReturnType<typeof stateWith>) => ({
      children: selectChildrenIndex(state, P),
      parents: selectParentIndex(state, P),
      firstLevel: selectFirstLevelIds(state, P),
      expandable: selectExpandableIds(state, P),
    });
    const base = makeOrgNodes();
    const before = structureOf(stateWith(base));

    // Патч метрик: те же id, parentId и name на тех же местах.
    const patched = base.map((node) =>
      node.id === 'p-1' ? { ...node, headcount: 30, matches: false } : node,
    );
    const after = stateWith(patched);
    expect(structureOf(after)).toStrictEqual(before);
    for (const [key, value] of Object.entries(structureOf(after))) {
      expect(value, key).toBe(before[key as keyof typeof before]);
    }
    const tree = selectVisibleTree(after, P, new Set(['d-b']));
    const departmentOne = tree[1]!.children.find((node) => node.id === 'p-1')!;
    expect(departmentOne.data.node.headcount).toBe(30);
    expect(departmentOne.data.matches).toBe(false);

    // Структура изменилась — индексы новые: перенос узла при тех же id и именах на местах…
    const moved = patched.map((node) => (node.id === 't-3' ? { ...node, parentId: 'p-1' } : node));
    expect(
      selectChildrenIndex(stateWith(moved), P)
        .get('p-1')!
        .map((node) => node.id),
    ).toEqual(['t-1', 't-2', 't-3']);
    expect(selectParentIndex(stateWith(moved), P).get('t-3')).toBe('p-1');

    // …и новый узел.
    const grown = [...patched, { ...base[7]!, id: 't-4', parentId: 'p-2', order: base.length }];
    expect(selectChildrenIndex(stateWith(grown), P)).not.toBe(before.children);
    expect(
      selectChildrenIndex(stateWith(grown), P)
        .get('p-2')!
        .map((node) => node.id),
    ).toEqual(['t-4']);
  });

  it('пустой ответ', () => {
    const empty = stateWith([]);
    expect(selectIsEmpty(empty, P)).toBe(true);
    expect(selectVisibleTree(empty, P, new Set())).toEqual([]);
    expect(selectIsEmpty(stateWith(undefined), P)).toBe(false);
  });

  it('collectExpandableSubtreeIds — узел и потомки с детьми', () => {
    const index = selectChildrenIndex(state, P);
    expect(collectExpandableSubtreeIds(index, 'd-b').sort()).toEqual(['d-b', 'p-1']);
    expect(collectExpandableSubtreeIds(index, 't-1')).toEqual([]);
  });
});
