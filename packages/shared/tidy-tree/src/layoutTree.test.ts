/** @vitest-environment node */
import { describe, expect, it } from 'vitest';
import { layoutTree } from './layoutTree';
import {
  findIsomorphismViolations,
  findMirrorViolations,
  findViolations,
} from './testing/invariants';
import {
  countNodes,
  leaf,
  leveledTree,
  mirrorInput,
  node,
  randomTree,
  type TestInput,
} from './testing/trees';
import type { LayoutOptions, LayoutResult } from './types';

const VERTICAL: LayoutOptions = {
  orientation: 'vertical',
  siblingGap: 10,
  subtreeGap: 30,
  levelGap: 20,
};
const HORIZONTAL: LayoutOptions = { ...VERTICAL, orientation: 'horizontal' };

function expectAllInvariants(input: TestInput, options: LayoutOptions) {
  const result = layoutTree(input, options);
  expect(findViolations(result, input, options)).toEqual([]);
  expect(findIsomorphismViolations(result, input).violations).toEqual([]);
  expect(findMirrorViolations(result, layoutTree(mirrorInput(input), options), options)).toEqual(
    [],
  );
  expect(layoutTree(input, options)).toEqual(result);
  return result;
}

function byId(result: LayoutResult<string>) {
  return new Map(result.nodes.map((n) => [n.id, n]));
}

const centerX = (n: { x: number; width: number }) => n.x + n.width / 2;

describe('layoutTree: вырожденные случаи', () => {
  it('один узел — в начале координат, bounds равен размеру узла', () => {
    const result = expectAllInvariants(leaf('only', { width: 50, height: 30 }), VERTICAL);

    expect(result.nodes).toEqual([
      { id: 'only', x: 0, y: 0, width: 50, height: 30, depth: 0, parentId: null, data: 'only' },
    ]);
    expect(result.edges).toEqual([]);
    expect(result.bounds).toEqual({ width: 50, height: 30 });
  });

  it('цепочка — узлы друг под другом, шаг уровня = высота + levelGap', () => {
    let chain = leaf('c9');
    for (let i = 8; i >= 0; i--) {
      chain = node(`c${i}`, [chain]);
    }
    const result = expectAllInvariants(chain, VERTICAL);

    expect(new Set(result.nodes.map((n) => n.x))).toEqual(new Set([0]));
    expect(result.nodes.map((n) => n.y)).toEqual(Array.from({ length: 10 }, (_, i) => i * 40));
    expect(result.bounds).toEqual({ width: 40, height: 9 * 40 + 20 });
  });

  it('звезда — дети вплотную через siblingGap, корень по центру', () => {
    const star = node(
      'hub',
      Array.from({ length: 20 }, (_, i) => leaf(`s${i}`)),
    );
    const result = expectAllInvariants(star, VERTICAL);
    const nodes = byId(result);

    const children = result.nodes.filter((n) => n.depth === 1);
    children.slice(1).forEach((child, i) => {
      expect(child.x - (children[i].x + children[i].width)).toBeCloseTo(VERTICAL.siblingGap);
    });
    expect(result.bounds.width).toBe(20 * 40 + 19 * VERTICAL.siblingGap);
    expect(centerX(nodes.get('hub')!)).toBeCloseTo(result.bounds.width / 2);
  });
});

describe('layoutTree: контрпример к наивному алгоритму', () => {
  // A и C узкие наверху и широкие в глубине; B — лист между ними. Сравнение только
  // соседних детей (A–B, B–C) не видит конфликта A и C на третьем уровне, а сдвиг
  // одного C прижал бы B к A. Tidy tree раздвигает A и C по глубокому контуру
  // и распределяет сдвиг: B оказывается ровно посередине.
  const deep = (prefix: string) =>
    node(prefix, [
      node(`${prefix}1`, [
        node(`${prefix}2`, [
          leaf(`${prefix}3`),
          leaf(`${prefix}4`),
          leaf(`${prefix}5`),
          leaf(`${prefix}6`),
        ]),
      ]),
    ]);
  const input = node('root', [deep('A'), leaf('B'), deep('C')]);

  it('глубокие поддеревья не пересекаются, зазор на глубоком уровне ровно subtreeGap', () => {
    const result = expectAllInvariants(input, VERTICAL);
    const nodes = byId(result);

    const rightmostOfA = nodes.get('A6')!;
    const leftmostOfC = nodes.get('C3')!;
    expect(leftmostOfC.x - (rightmostOfA.x + rightmostOfA.width)).toBeCloseTo(VERTICAL.subtreeGap);
  });

  it('третье поддерево «протискивается» посередине, а не прилипает к левому', () => {
    const result = layoutTree(input, VERTICAL);
    const nodes = byId(result);

    const a = centerX(nodes.get('A')!);
    const b = centerX(nodes.get('B')!);
    const c = centerX(nodes.get('C')!);
    expect(b).toBeCloseTo((a + c) / 2);
    expect(b - a).toBeGreaterThan(40 + VERTICAL.siblingGap);
  });

  it('несколько промежуточных поддеревьев получают сдвиг поровну', () => {
    const wide = node('root', [deep('A'), leaf('x'), leaf('y'), leaf('z'), deep('C')]);
    const nodes = byId(layoutTree(wide, VERTICAL));
    const centers = ['A', 'x', 'y', 'z', 'C'].map((id) => centerX(nodes.get(id)!));
    const steps = centers.slice(1).map((value, i) => value - centers[i]);

    steps.forEach((step) => expect(step).toBeCloseTo(steps[0]));
  });
});

describe('layoutTree: размеры узлов', () => {
  it('зазор считается от фактических ширин соседей', () => {
    const input = node('p', [
      leaf('wide', { width: 100, height: 20 }),
      leaf('narrow', { width: 40, height: 20 }),
    ]);
    const nodes = byId(expectAllInvariants(input, VERTICAL));

    expect(centerX(nodes.get('narrow')!) - centerX(nodes.get('wide')!)).toBeCloseTo(50 + 20 + 10);
  });

  it('уровень занимает высоту самого высокого узла', () => {
    const input = node('p', [leaf('tall', { width: 40, height: 90 }), node('short', [leaf('g')])]);
    const nodes = byId(expectAllInvariants(input, VERTICAL));

    expect(nodes.get('g')!.y).toBe(20 + VERTICAL.levelGap + 90 + VERTICAL.levelGap);
  });
});

describe('layoutTree: инварианты на деревьях', () => {
  it('дерево из ТЗ: 3 уровня, ~45 узлов', () => {
    const input = leveledTree(7, 5, [
      [2, 3],
      [2, 3],
    ]);
    const total = countNodes(input) - 1; // без общего корня
    expect(total).toBeGreaterThanOrEqual(40);
    expect(total).toBeLessThanOrEqual(60);

    const result = expectAllInvariants(input, VERTICAL);
    expect(findIsomorphismViolations(result, input).comparedGroups).toBeGreaterThan(0);
    expect(Math.max(...result.nodes.map((n) => n.depth))).toBe(3);
  });

  it('300 случайных деревьев (одинаковые и разные размеры) — все инварианты', () => {
    let comparedGroups = 0;
    for (let seed = 1; seed <= 300; seed++) {
      const input = randomTree(seed, 2 + (seed % 90), {
        maxChildren: 1 + (seed % 6),
        variableSize: seed % 2 === 0,
      });
      const options = seed % 3 === 0 ? HORIZONTAL : VERTICAL;
      const result = layoutTree(input, options);

      expect(findViolations(result, input, options), `seed ${seed}`).toEqual([]);
      const isomorphism = findIsomorphismViolations(result, input);
      expect(isomorphism.violations, `seed ${seed}`).toEqual([]);
      comparedGroups += isomorphism.comparedGroups;
      expect(
        findMirrorViolations(result, layoutTree(mirrorInput(input), options), options),
        `seed ${seed}`,
      ).toEqual([]);
    }
    // Иначе проверка изоморфизма ничего бы не доказывала.
    expect(comparedGroups).toBeGreaterThan(100);
  });

  it('горизонтальная ориентация — уровни слева направо', () => {
    const input = node('p', [
      leaf('a', { width: 70, height: 20 }),
      leaf('b', { width: 30, height: 20 }),
    ]);
    const nodes = byId(expectAllInvariants(input, HORIZONTAL));

    expect(nodes.get('a')!.x).toBe(40 + HORIZONTAL.levelGap);
    expect(nodes.get('b')!.y - (nodes.get('a')!.y + 20)).toBeCloseTo(HORIZONTAL.siblingGap);
  });

  it('данные узлов передаются без изменений, рёбра соответствуют parentId', () => {
    const input = node('p', [leaf('a'), leaf('b')]);
    const result = layoutTree(input, VERTICAL);

    expect(result.nodes.map((n) => n.data)).toEqual(['p', 'a', 'b']);
    expect(result.edges).toEqual([
      { id: 'p->a', parentId: 'p', childId: 'a' },
      { id: 'p->b', parentId: 'p', childId: 'b' },
    ]);
  });
});

describe('layoutTree: некорректный вход', () => {
  it('повторяющийся id', () => {
    expect(() => layoutTree(node('p', [leaf('x'), leaf('x')]), VERTICAL)).toThrow(/duplicate/);
  });

  it('отрицательный или нечисловой размер', () => {
    expect(() => layoutTree(leaf('x', { width: -1, height: 10 }), VERTICAL)).toThrow(/size/);
    expect(() => layoutTree(leaf('x', { width: Number.NaN, height: 10 }), VERTICAL)).toThrow(
      /size/,
    );
  });

  it('отрицательный зазор', () => {
    expect(() => layoutTree(leaf('x'), { ...VERTICAL, siblingGap: -5 })).toThrow(/siblingGap/);
  });
});

describe('layoutTree: производительность', () => {
  it('1000 узлов быстрее 50 мс', () => {
    const input = randomTree(2026, 1000, { maxChildren: 5 });
    layoutTree(input, VERTICAL); // прогрев JIT

    const timings = Array.from({ length: 5 }, () => {
      const startedAt = performance.now();
      layoutTree(input, VERTICAL);
      return performance.now() - startedAt;
    }).sort((a, b) => a - b);
    const median = timings[2];

    expect(median).toBeLessThan(50);
  });

  it('глубокая цепочка из 50 000 узлов не переполняет стек', () => {
    let chain = leaf('d49999');
    for (let i = 49998; i >= 0; i--) {
      chain = node(`d${i}`, [chain]);
    }
    expect(layoutTree(chain, VERTICAL).nodes).toHaveLength(50_000);
  });
});
