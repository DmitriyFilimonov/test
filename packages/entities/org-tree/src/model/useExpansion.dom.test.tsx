import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { ExpansionStructure } from './expansion';
import { DEFAULT_ORG_TREE_PARAMS as P } from './params';
import { selectChildrenIndex, selectExpandableIds, selectParentIndex } from './selectors';
import { makeOrgNodes, stateWith } from './testing/fixtures';
import { useExpansion } from './useExpansion';

const state = stateWith(makeOrgNodes());
const structure: ExpansionStructure = {
  expandableIds: selectExpandableIds(state, P),
  childrenIndex: selectChildrenIndex(state, P),
  parentIndex: selectParentIndex(state, P),
};

function renderExpansion(initial: ReadonlySet<string>) {
  let renders = 0;
  const view = renderHook(
    ({ initialExpandedIds }: { initialExpandedIds: ReadonlySet<string> }) => {
      renders += 1;
      return useExpansion({ initialExpandedIds, structure });
    },
    { initialProps: { initialExpandedIds: initial } },
  );
  return {
    ...view,
    renders: () => renders,
    ids: () => [...view.result.current.expandedIds].sort(),
  };
}

describe('useExpansion', () => {
  it('до первого действия раскрытие следует за initialExpandedIds, после — нет', () => {
    const { rerender, result, ids } = renderExpansion(new Set());
    expect(ids()).toEqual([]);
    const defaults = new Set(['d-a', 'd-b']);
    rerender({ initialExpandedIds: defaults });
    expect(result.current.expandedIds).toBe(defaults);

    act(() => result.current.toggle('p-1'));
    expect(ids()).toEqual(['d-a', 'd-b', 'p-1']);
    rerender({ initialExpandedIds: new Set(['d-a']) });
    expect(ids()).toEqual(['d-a', 'd-b', 'p-1']);
  });

  it('методы — операции над раскрытием на экране', () => {
    const { result, ids } = renderExpansion(new Set(['d-a', 'd-b']));
    act(() => result.current.toggleRecursive('d-b'));
    expect(ids()).toEqual(['d-a']);
    act(() => result.current.expandAll());
    expect(ids()).toEqual(['d-a', 'd-b', 'p-1', 'p-3']);
    act(() => result.current.collapseAll());
    expect(ids()).toEqual([]);
    act(() => result.current.expandAncestors('t-1'));
    expect(ids()).toEqual(['d-b', 'p-1']);
  });

  it('expandAncestors — один рендер на всю цепочку; нечего раскрывать — набор тот же', () => {
    const { result, renders, ids } = renderExpansion(new Set());
    const before = renders();
    act(() => result.current.expandAncestors('t-3'));
    expect(ids()).toEqual(['d-a', 'p-3']);
    expect(renders() - before).toBe(1);

    const expanded = result.current.expandedIds;
    act(() => result.current.expandAncestors('t-3'));
    expect(result.current.expandedIds).toBe(expanded);
  });
});
