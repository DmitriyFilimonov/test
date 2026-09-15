/** @vitest-environment node */
import { describe, expect, it } from 'vitest';
import { isSameOrgTree } from './isEqual';
import { makeOrgNodes } from './testing/fixtures';

const maxUpdatedAt = (nodes: { updatedAt: string }[]) =>
  nodes
    .map((node) => node.updatedAt)
    .sort()
    .at(-1);

describe('isSameOrgTree', () => {
  it('те же данные в новых объектах — равны', () => {
    expect(isSameOrgTree(makeOrgNodes(), structuredClone(makeOrgNodes()))).toBe(true);
  });

  it('порядок узлов не важен', () => {
    expect(isSameOrgTree(makeOrgNodes(), makeOrgNodes().reverse())).toBe(true);
  });

  it('изменён узел (как POST /api/dev/touch) — не равны', () => {
    const next = makeOrgNodes();
    next[3] = { ...next[3], headcount: 99, updatedAt: '2026-09-15T00:00:00.000Z' };
    expect(isSameOrgTree(makeOrgNodes(), next)).toBe(false);
  });

  it('удалён лист, максимум updatedAt не изменился (как touch?mode=delete) — не равны', () => {
    const current = makeOrgNodes();
    const next = current.filter((node) => node.id !== 't-2');
    expect(maxUpdatedAt(next)).toBe(maxUpdatedAt(current));
    expect(isSameOrgTree(current, next)).toBe(false);
  });

  it('удалён один и добавлен другой, длина и максимум прежние — не равны', () => {
    const current = makeOrgNodes();
    const next = current.map((node) =>
      node.id === 't-2' ? { ...node, id: 't-new', updatedAt: current[0].updatedAt } : node,
    );
    expect(next).toHaveLength(current.length);
    expect(maxUpdatedAt(next)).toBe(maxUpdatedAt(current));
    expect(isSameOrgTree(current, next)).toBe(false);
  });
});
