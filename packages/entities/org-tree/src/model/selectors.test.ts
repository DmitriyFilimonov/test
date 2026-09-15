/** @vitest-environment node */
import { describe, expect, it } from 'vitest';
import {
  collectExpandableSubtreeIds,
  selectChildrenIndex,
  selectExpandableIds,
  selectFirstLevelIds,
  selectIsEmpty,
  selectRootNodes,
  selectSubtreeAggregates,
  selectVisibleTree,
  type VisibleOrgTreeNode,
} from './selectors';
import { makeOrgNodes, stateWith } from './testing/fixtures';

const ids = (tree: VisibleOrgTreeNode[]): unknown =>
  tree.map((node) => (node.children.length ? { [node.id]: ids(node.children) } : node.id));

describe('селекторы оргдерева', () => {
  const state = stateWith(makeOrgNodes());

  it('индекс parentId → дети, отсортированные по имени', () => {
    const index = selectChildrenIndex(state);
    expect(index.get(null)!.map((n) => n.id)).toEqual(['d-a', 'd-b']);
    expect(index.get('d-b')!.map((n) => n.id)).toEqual(['p-1', 'p-2']);
    expect(index.get('p-1')!.map((n) => n.id)).toEqual(['t-1', 't-2']);
    expect(index.has('t-1')).toBe(false);
  });

  it('корни и идентификаторы первого уровня', () => {
    expect(selectRootNodes(state).map((n) => n.name)).toEqual(['Дивизион А', 'Дивизион Б']);
    expect(selectFirstLevelIds(state)).toEqual(['d-a', 'd-b']);
  });

  it('раскрываемые узлы — только те, у кого есть дети', () => {
    expect([...selectExpandableIds(state)].sort()).toEqual(['d-a', 'd-b', 'p-1', 'p-3']);
  });

  it('ничего не раскрыто — видны только корни', () => {
    expect(ids(selectVisibleTree(state, new Set()))).toEqual(['d-a', 'd-b']);
  });

  it('раскрыт корень — видны его дети, внуки скрыты', () => {
    expect(ids(selectVisibleTree(state, new Set(['d-b'])))).toEqual([
      'd-a',
      { 'd-b': ['p-1', 'p-2'] },
    ]);
  });

  it('ребёнок раскрытого узла скрыт, если свёрнут его предок', () => {
    const tree = selectVisibleTree(state, new Set(['p-1']));
    expect(ids(tree)).toEqual(['d-a', 'd-b']);
  });

  it('childCount — число детей в данных, а не среди видимых', () => {
    const [, divisionB] = selectVisibleTree(state, new Set());
    expect(divisionB.children).toEqual([]);
    expect(divisionB.data.childCount).toBe(2);
    expect(divisionB.data.node).toBe(state.orgTree.data!.find((n) => n.id === 'd-b'));
  });

  it('у каждого видимого узла — итоги по всему подразделению, включая скрытых потомков', () => {
    const [, divisionB] = selectVisibleTree(state, new Set());
    // d-b (4) + p-2 (3) + p-1 (1) + t-2 (10) + t-1 (6), дети свёрнуты
    expect(divisionB.data.subtree).toEqual(selectSubtreeAggregates(state).get('d-b'));
    expect(divisionB.data.subtree.headcount).toBe(24);
    expect(divisionB.data.node.headcount).toBe(4);
  });

  it('агрегаты пересчитываются только при изменении данных', () => {
    expect(selectSubtreeAggregates(stateWith(state.orgTree.data))).toBe(
      selectSubtreeAggregates(state),
    );
  });

  it('мемоизация: тот же стейт и тот же Set — та же ссылка', () => {
    const expanded = new Set(['d-a']);
    expect(selectVisibleTree(state, expanded)).toBe(selectVisibleTree(state, expanded));
    expect(selectChildrenIndex(stateWith(state.orgTree.data))).toBe(selectChildrenIndex(state));
  });

  it('пустой ответ', () => {
    const empty = stateWith([]);
    expect(selectIsEmpty(empty)).toBe(true);
    expect(selectVisibleTree(empty, new Set())).toEqual([]);
    expect(selectIsEmpty(stateWith(undefined))).toBe(false);
  });

  it('collectExpandableSubtreeIds — узел и потомки с детьми', () => {
    const index = selectChildrenIndex(state);
    expect(collectExpandableSubtreeIds(index, 'd-b').sort()).toEqual(['d-b', 'p-1']);
    expect(collectExpandableSubtreeIds(index, 't-1')).toEqual([]);
  });
});
