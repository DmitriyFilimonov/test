/** @vitest-environment node */
import { describe, expect, it } from 'vitest';
import {
  ancestorIds,
  expandIds,
  expansionActions,
  expansionReducer,
  type ExpansionAction,
  type ExpansionState,
  type ExpansionStructure,
} from './expansion';
import { DEFAULT_ORG_TREE_PARAMS } from './params';
import { selectChildrenIndex, selectExpandableIds, selectParentIndex } from './selectors';
import { makeOrgNodes, stateWith } from './testing/fixtures';

describe('expansionReducer', () => {
  it('toggle меняет только сам узел, раскрытия потомков сохраняются', () => {
    const current = new Set(['A', 'A2']);
    const collapsed = expansionReducer(current, { type: 'toggle', id: 'A', current })!;
    expect([...collapsed]).toEqual(['A2']);
    const reopened = expansionReducer(collapsed, { type: 'toggle', id: 'A', current: collapsed })!;
    expect([...reopened].sort()).toEqual(['A', 'A2']);
  });

  it('expand добавляет узлы ветки, не трогая остальные', () => {
    const current = new Set(['B']);
    const next = expansionReducer(current, { type: 'expand', ids: ['A', 'A2'], current })!;
    expect([...next].sort()).toEqual(['A', 'A2', 'B']);
  });

  it('replace задаёт набор целиком', () => {
    expect([...expansionReducer(null, { type: 'replace', ids: ['X'] })!]).toEqual(['X']);
  });

  it('не мутирует текущий набор', () => {
    const current = new Set(['A']);
    expansionReducer(current, { type: 'toggle', id: 'A', current });
    expect([...current]).toEqual(['A']);
  });
});

describe('ancestorIds и слияние в expandedIds', () => {
  const nodes = makeOrgNodes();
  const state = stateWith(nodes);
  const parentIndex = selectParentIndex(state, DEFAULT_ORG_TREE_PARAMS);

  it('цепочка предков — от родителя к корню', () => {
    expect(ancestorIds(parentIndex, 't-1')).toEqual(['p-1', 'd-b']);
    expect(ancestorIds(parentIndex, 'p-3')).toEqual(['d-a']);
  });

  it('узел первого уровня — предков нет', () => {
    expect(ancestorIds(parentIndex, 'd-b')).toEqual([]);
  });

  it('несуществующий id — предков нет, без ошибки', () => {
    expect(ancestorIds(parentIndex, 'missing')).toEqual([]);
  });

  it('цикл в parentId обрывается', () => {
    const cyclic = new Map<string, string | null>([
      ['a', 'b'],
      ['b', 'c'],
      ['c', 'a'],
    ]);
    expect(ancestorIds(cyclic, 'a')).toEqual(['b', 'c']);
  });

  it('expandIds добавляет предков к раскрытым, не трогая остальные', () => {
    const current = new Set(['d-a']);
    const next = expandIds(current, ancestorIds(parentIndex, 't-1'));
    expect([...next].sort()).toEqual(['d-a', 'd-b', 'p-1']);
    expect([...current]).toEqual(['d-a']);
  });

  it('expandIds: все уже раскрыты — тот же набор', () => {
    const current = new Set(['d-b', 'p-1', 'x']);
    expect(expandIds(current, ['p-1', 'd-b'])).toBe(current);
  });
});

describe('операции useExpansion (действия expansionReducer)', () => {
  const nodes = makeOrgNodes();
  const state = stateWith(nodes);
  const structure: ExpansionStructure = {
    expandableIds: selectExpandableIds(state, DEFAULT_ORG_TREE_PARAMS),
    childrenIndex: selectChildrenIndex(state, DEFAULT_ORG_TREE_PARAMS),
    parentIndex: selectParentIndex(state, DEFAULT_ORG_TREE_PARAMS),
  };
  const defaults = new Set(['d-a', 'd-b']);
  /** Как хук: действие считается от раскрытия на экране, состояние null — умолчания. */
  const run = (
    expansion: ExpansionState,
    action: (current: ReadonlySet<string>) => ExpansionAction,
  ) => expansionReducer(expansion, action(expansion ?? defaults));
  const sorted = (set: ExpansionState) => [...(set ?? defaults)].sort();

  it('toggle не сбрасывает потомков: свернуть и раскрыть родителя — ветка как была', () => {
    let expansion = run(null, (c) => expansionActions.toggle(c, 'p-1'));
    expect(sorted(expansion)).toEqual(['d-a', 'd-b', 'p-1']);
    expansion = run(expansion, (c) => expansionActions.toggle(c, 'd-b'));
    expect(sorted(expansion)).toEqual(['d-a', 'p-1']);
    expansion = run(expansion, (c) => expansionActions.toggle(c, 'd-b'));
    expect(sorted(expansion)).toEqual(['d-a', 'd-b', 'p-1']);
  });

  it('toggleRecursive: свёрнутый — раскрыть поддерево, раскрытый — свернуть поддерево', () => {
    let expansion = run(null, (c) => expansionActions.toggleRecursive(c, structure, 'p-1'));
    expect(sorted(expansion)).toEqual(['d-a', 'd-b', 'p-1']);
    expansion = run(expansion, (c) => expansionActions.toggleRecursive(c, structure, 'd-b'));
    expect(sorted(expansion)).toEqual(['d-a']);
    expansion = run(expansion, (c) => expansionActions.toggleRecursive(c, structure, 'd-b'));
    // p-2 без детей: в раскрытые не попадает.
    expect(sorted(expansion)).toEqual(['d-a', 'd-b', 'p-1']);
  });

  it('expandAll раскрывает все узлы с детьми, collapseAll сворачивает всё', () => {
    const all = run(null, () => expansionActions.expandAll(structure));
    expect(sorted(all)).toEqual(['d-a', 'd-b', 'p-1', 'p-3']);
    expect(sorted(run(all, () => expansionActions.collapseAll()))).toEqual([]);
  });

  it('expandAncestors раскрывает всю цепочку одним действием, прочие раскрытия на месте', () => {
    const collapsed = run(null, () => expansionActions.collapseAll());
    const withP3 = run(collapsed, (c) => expansionActions.toggle(c, 'p-3'));
    const next = run(withP3, (c) => expansionActions.expandAncestors(c, structure, 't-1'));
    expect(sorted(next)).toEqual(['d-b', 'p-1', 'p-3']);
  });

  it('expandAncestors: предки уже раскрыты — состояние прежнее, умолчания продолжают действовать', () => {
    expect(run(null, (c) => expansionActions.expandAncestors(c, structure, 'p-1'))).toBeNull();
    expect(run(null, (c) => expansionActions.expandAncestors(c, structure, 'missing'))).toBeNull();
  });
});
