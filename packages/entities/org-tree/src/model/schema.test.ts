/** @vitest-environment node */
import { describe, expect, it } from 'vitest';
import { OrgTreeContractError, orgTreeResponseSchema, parseOrgTree } from './schema';
import { makeOrgNodes } from './testing/fixtures';

const withNode = (patch: Record<string, unknown>, index = 0) =>
  makeOrgNodes().map((node, i) => (i === index ? { ...node, ...patch } : node));

describe('orgTreeResponseSchema', () => {
  it('валидный ответ проходит без изменений', () => {
    const nodes = makeOrgNodes();
    expect(parseOrgTree(nodes)).toEqual(nodes);
  });

  it.each([
    ['лишнее поле', { extra: true }],
    ['performance дробный', { performance: 50.5 }],
    ['performance больше 100', { performance: 101 }],
    ['performance меньше 0', { performance: -1 }],
    ['performance строкой', { performance: '50' }],
    ['headcount дробный', { headcount: 1.5 }],
    ['budget отрицательный', { budget: -10 }],
    ['пустой id', { id: '' }],
    ['parentId пустая строка', { parentId: '' }],
    ['несуществующая дата', { updatedAt: '2026-02-30T00:00:00.000Z' }],
    ['не дата', { updatedAt: 'yesterday' }],
    ['дата без времени', { updatedAt: '2026-01-01' }],
    ['matches строкой', { matches: 'true' }],
    ['matches null', { matches: null }],
    ['order дробный', { order: 0.5 }],
    ['order отрицательный', { order: -1 }],
    ['order строкой', { order: '0' }],
  ])('%s — ошибка', (_label, patch) => {
    expect(orgTreeResponseSchema.safeParse(withNode(patch)).success).toBe(false);
  });

  it.each(['id', 'matches', 'order'])('отсутствующее поле %s — ошибка', (field) => {
    const nodes: Record<string, unknown>[] = makeOrgNodes();
    delete nodes[3][field];
    expect(orgTreeResponseSchema.safeParse(nodes).success).toBe(false);
  });

  it('принимает matches и order: false у части узлов, order в любом порядке массива', () => {
    const orders = [7, 0, 3, 5, 1, 6, 2, 4];
    const nodes = makeOrgNodes().map((node, i) => ({
      ...node,
      matches: i % 2 === 0,
      order: orders[i],
    }));
    expect(parseOrgTree(nodes)).toEqual(nodes);
  });

  it('parentId: null у корня допустим', () => {
    expect(orgTreeResponseSchema.safeParse(withNode({ parentId: null }, 2)).success).toBe(true);
  });

  it('не массив — ошибка', () => {
    expect(orgTreeResponseSchema.safeParse({ nodes: [] }).success).toBe(false);
  });

  it('пустой массив валиден', () => {
    expect(parseOrgTree([])).toEqual([]);
  });

  describe('целостность дерева', () => {
    it('повторяющийся id', () => {
      expect(orgTreeResponseSchema.safeParse(withNode({ id: 'd-a' }, 0)).success).toBe(false);
    });

    it('parentId на несуществующий узел', () => {
      expect(orgTreeResponseSchema.safeParse(withNode({ parentId: 'ghost' }, 5)).success).toBe(
        false,
      );
    });

    it('цикл из двух узлов', () => {
      const nodes = makeOrgNodes().map((node) =>
        node.id === 'd-a' ? { ...node, parentId: 'p-3' } : node,
      );
      expect(orgTreeResponseSchema.safeParse(nodes).success).toBe(false);
    });

    it('узел — сам себе родитель', () => {
      expect(orgTreeResponseSchema.safeParse(withNode({ parentId: 'd-b' }, 0)).success).toBe(false);
    });

    it('order с дырой (значение вне 0..n-1) — ошибка', () => {
      const nodes = withNode({ order: 8 }, 7);
      const result = orgTreeResponseSchema.safeParse(nodes);
      expect(result.success).toBe(false);
      expect(result.error?.issues[0]).toMatchObject({ path: [7, 'order'] });
    });

    it('повторяющийся order — ошибка', () => {
      const result = orgTreeResponseSchema.safeParse(withNode({ order: 0 }, 5));
      expect(result.success).toBe(false);
      expect(result.error?.issues[0]).toMatchObject({ message: 'Duplicate order 0' });
    });
  });

  it('невалидный узел среди валидных — ошибка всего ответа, частичного результата нет', () => {
    const nodes = withNode({ performance: 'high' }, 7);
    expect(() => parseOrgTree(nodes)).toThrow(OrgTreeContractError);
  });

  it('ответ scenario=invalid мок-сервера: performance строкой и узел без id', () => {
    const nodes: Record<string, unknown>[] = makeOrgNodes();
    nodes[0] = { ...nodes[0], performance: String(nodes[0].performance) };
    delete nodes[1].id;

    let message = '';
    try {
      parseOrgTree(nodes);
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toContain('[0].performance');
    expect(message).toContain('[1].id');
  });
});
