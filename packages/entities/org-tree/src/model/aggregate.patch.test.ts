/** @vitest-environment node */
import { describe, expect, it } from 'vitest';
import { aggregateSubtrees, applyAggregatePatch } from './aggregate';
import type { OrgNode } from './schema';
import { makeOrgNodes } from './testing/fixtures';

function makeTree(
  structure: Array<
    [id: string, parentId: string | null, headcount: number, budget: number, performance: number]
  >,
): OrgNode[] {
  return structure.map(([id, parentId, headcount, budget, performance], index) => ({
    id,
    name: `Node ${id}`,
    parentId,
    headcount,
    budget,
    performance,
    updatedAt: new Date(Date.UTC(2026, 0, 1 + index)).toISOString(),
    matches: true,
    order: index,
  }));
}

function updateNode(nodes: OrgNode[], id: string, patch: Partial<OrgNode>): OrgNode[] {
  return nodes.map((n) =>
    n.id === id ? { ...n, ...patch, updatedAt: new Date().toISOString() } : n,
  );
}

/** mulberry32: случайные деревья и патчи, но прогон воспроизводим — упавший run повторяем. */
function makeRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** headcount, budget, performance — целые, как в схеме узла; ноль в headcount даёт performance null. */
function randomMetrics(random: () => number): [number, number, number] {
  return [Math.floor(random() * 21), Math.floor(random() * 1_000_000), Math.floor(random() * 101)];
}

function randomTree(random: () => number, run: number): OrgNode[] {
  const size = 5 + Math.floor(random() * 20);
  const structure: Array<[string, string | null, number, number, number]> = [];
  for (let i = 0; i < size; i++) {
    // Первый узел — корень; дальше родитель случайный из уже созданных, иногда ещё один корень.
    const parentId = i === 0 || random() < 0.1 ? null : structure[Math.floor(random() * i)][0];
    structure.push([`n${run}-${i}`, parentId, ...randomMetrics(random)]);
  }
  return makeTree(structure);
}

describe('applyAggregatePatch', () => {
  describe('эквивалентность с aggregateSubtrees', () => {
    it('патч одного листа: результат совпадает с полным расчётом', () => {
      const nodes = makeOrgNodes();
      const index = aggregateSubtrees(nodes);
      const updated = updateNode(nodes, 't-1', { headcount: 10 });
      const changes = { updated: ['t-1'], added: [], removed: [] };
      const patched = applyAggregatePatch(index, nodes, updated, changes);
      const expected = aggregateSubtrees(updated);
      expect(patched.size).toBe(expected.size);
      for (const [id, exp] of expected) {
        expect(patched.get(id)).toMatchObject(exp);
      }
    });

    it('патч нескольких узлов: результат совпадает', () => {
      const nodes = makeOrgNodes();
      const index = aggregateSubtrees(nodes);
      const updated1 = updateNode(nodes, 't-1', { headcount: 8 });
      const updated2 = updateNode(updated1, 'p-2', { budget: 50 });
      const changes = { updated: ['t-1', 'p-2'], added: [], removed: [] };
      const patched = applyAggregatePatch(index, nodes, updated2, changes);
      const expected = aggregateSubtrees(updated2);
      for (const [id, exp] of expected) {
        expect(patched.get(id)).toMatchObject(exp);
      }
    });

    it('прогон на 200 случайных деревьях с случайными патчами', () => {
      for (let run = 0; run < 200; run++) {
        const random = makeRandom(run + 1);
        let nodes = randomTree(random, run);
        let index = aggregateSubtrees(nodes);

        // Серия патчей: несколько раундов, в каждом меняется от одного до трёх узлов.
        const rounds = 1 + Math.floor(random() * 5);
        for (let round = 0; round < rounds; round++) {
          const updated: string[] = [];
          let next = nodes;
          for (let i = 1 + Math.floor(random() * 3); i > 0; i--) {
            const { id } = nodes[Math.floor(random() * nodes.length)];
            if (updated.includes(id)) continue;
            updated.push(id);
            const [headcount, budget, performance] = randomMetrics(random);
            next = updateNode(next, id, { headcount, budget, performance });
          }
          index = applyAggregatePatch(index, nodes, next, { updated, added: [], removed: [] });
          nodes = next;
        }

        const expected = aggregateSubtrees(nodes);
        expect(index.size).toBe(expected.size);
        for (const [id, exp] of expected) {
          expect(index.get(id)).toMatchObject(exp);
        }
      }
    });
  });

  describe('локальность', () => {
    it('патч листа меняет только его и предков; прочие узлы — те же ссылки', () => {
      const nodes = makeOrgNodes();
      const index = aggregateSubtrees(nodes);
      const updated = updateNode(nodes, 't-1', { headcount: 10 });
      const changes = { updated: ['t-1'], added: [], removed: [] };
      const patched = applyAggregatePatch(index, nodes, updated, changes);

      const expectedChanged = new Set(['t-1', 'p-1', 'd-b']);
      for (const id of nodes.map((n) => n.id)) {
        if (expectedChanged.has(id)) {
          expect(patched.get(id)).not.toBe(index.get(id));
        } else {
          expect(patched.get(id)).toBe(index.get(id));
        }
      }
    });

    it('счётчик: патч листа на глубине 3 трогает ровно 3 записи', () => {
      const nodes = makeOrgNodes();
      const index = aggregateSubtrees(nodes);
      const updated = updateNode(nodes, 't-1', { headcount: 10 });
      const changes = { updated: ['t-1'], added: [], removed: [] };
      const patched = applyAggregatePatch(index, nodes, updated, changes);

      let changedCount = 0;
      for (const id of nodes.map((n) => n.id)) {
        if (patched.get(id) !== index.get(id)) {
          changedCount++;
        }
      }
      expect(changedCount).toBe(3);
    });
  });

  describe('серия патчей одного узла', () => {
    it('100 патчей: результат совпадает с полным расчётом (нет накопления ошибки)', () => {
      const nodes = makeOrgNodes();
      let index = aggregateSubtrees(nodes);
      let current = nodes;

      for (let i = 0; i < 100; i++) {
        const updated = updateNode(current, 't-1', {
          headcount: current.find((n) => n.id === 't-1')!.headcount + 1,
        });
        const changes = { updated: ['t-1'], added: [], removed: [] };
        index = applyAggregatePatch(index, current, updated, changes);
        current = updated;
      }

      const expected = aggregateSubtrees(current);
      for (const [id, exp] of expected) {
        expect(index.get(id)).toMatchObject(exp);
      }
    });
  });

  describe('структурные изменения', () => {
    it('удаление узла с детьми: полный пересчёт', () => {
      const nodes = makeOrgNodes();
      const index = aggregateSubtrees(nodes);
      const updated = nodes.filter((n) => n.id !== 'p-1' && n.parentId !== 'p-1');
      const changes = { updated: [], added: [], removed: ['p-1'] };
      const patched = applyAggregatePatch(index, nodes, updated, changes);
      const expected = aggregateSubtrees(updated);
      for (const [id, exp] of expected) {
        expect(patched.get(id)).toMatchObject(exp);
      }
    });

    it('добавление узла: полный пересчёт', () => {
      const nodes = makeOrgNodes();
      const index = aggregateSubtrees(nodes);
      const newNode: OrgNode = {
        id: 'new',
        name: 'Новый',
        parentId: 'd-b',
        headcount: 5,
        budget: 100,
        performance: 70,
        updatedAt: new Date().toISOString(),
        matches: true,
        order: nodes.length,
      };
      const updated = [...nodes, newNode];
      const changes = { updated: [], added: [newNode], removed: [] };
      const patched = applyAggregatePatch(index, nodes, updated, changes);
      const expected = aggregateSubtrees(updated);
      for (const [id, exp] of expected) {
        expect(patched.get(id)).toMatchObject(exp);
      }
    });

    it('патч корня: пересчитывается только корень', () => {
      const nodes = makeOrgNodes();
      const index = aggregateSubtrees(nodes);
      const updated = updateNode(nodes, 'd-b', { headcount: 10 });
      const changes = { updated: ['d-b'], added: [], removed: [] };
      const patched = applyAggregatePatch(index, nodes, updated, changes);
      const expected = aggregateSubtrees(updated);
      for (const [id, exp] of expected) {
        expect(patched.get(id)).toMatchObject(exp);
      }
      expect(patched.get('d-b')).not.toBe(index.get('d-b'));
      expect(patched.get('d-a')).toBe(index.get('d-a'));
    });
  });

  describe('граничные случаи', () => {
    it('патч несуществующего узла: индекс не меняется', () => {
      const nodes = makeOrgNodes();
      const index = aggregateSubtrees(nodes);
      const changes = { updated: ['nonexistent'], added: [], removed: [] };
      const patched = applyAggregatePatch(index, nodes, nodes, changes);
      expect(patched).toBe(index);
    });

    it('пустой патч: индекс не меняется', () => {
      const nodes = makeOrgNodes();
      const index = aggregateSubtrees(nodes);
      const changes = { updated: [], added: [], removed: [] };
      const patched = applyAggregatePatch(index, nodes, nodes, changes);
      expect(patched).toBe(index);
    });

    it('патч без реальных изменений (diff === 0): индекс не меняется', () => {
      const nodes = makeOrgNodes();
      const index = aggregateSubtrees(nodes);
      const updated = nodes.map((n) =>
        n.id === 't-1' ? { ...n, updatedAt: new Date().toISOString() } : n,
      );
      const changes = { updated: ['t-1'], added: [], removed: [] };
      const patched = applyAggregatePatch(index, nodes, updated, changes);
      expect(patched).toBe(index);
    });
  });
});
