import type { LayoutInput, Size } from '../types';

export type TestInput = LayoutInput<string>;

const DEFAULT_SIZE: Size = { width: 40, height: 20 };

export function leaf(id: string, size: Size = DEFAULT_SIZE): TestInput {
  return { id, children: [], size, data: id };
}

export function node(id: string, children: TestInput[], size: Size = DEFAULT_SIZE): TestInput {
  return { id, children, size, data: id };
}

export function mirrorInput(input: TestInput): TestInput {
  return { ...input, children: input.children.map(mirrorInput).reverse() };
}

export function countNodes(input: TestInput): number {
  return 1 + input.children.reduce((sum, child) => sum + countNodes(child), 0);
}

/** Детерминированный PRNG (mulberry32). */
export function createRandom(seed: number) {
  let state = seed >>> 0;
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const int = (min: number, max: number) => min + Math.floor(next() * (max - min + 1));
  return { next, int };
}

/**
 * Случайное дерево из `nodeCount` узлов: каждый новый узел цепляется к случайному
 * из уже созданных, у которого меньше `maxChildren` детей. Ширины и высоты разные.
 */
export function randomTree(
  seed: number,
  nodeCount: number,
  { maxChildren = 4, variableSize = true }: { maxChildren?: number; variableSize?: boolean } = {},
): TestInput {
  const random = createRandom(seed);
  const size = (): Size =>
    variableSize ? { width: random.int(10, 80), height: random.int(10, 40) } : DEFAULT_SIZE;
  const all: { id: string; children: TestInput[]; size: Size; data: string }[] = [];
  const root = { id: 'n0', children: [] as TestInput[], size: size(), data: 'n0' };
  all.push(root);
  for (let i = 1; i < nodeCount; i++) {
    let parent = all[random.int(0, all.length - 1)];
    while (parent.children.length >= maxChildren) {
      parent = all[random.int(0, all.length - 1)];
    }
    const child = { id: `n${i}`, children: [] as TestInput[], size: size(), data: `n${i}` };
    parent.children.push(child);
    all.push(child);
  }
  return root;
}

/**
 * Дерево с общим корнем: у корня `top` детей, дальше на каждом уровне — случайное число детей
 * из диапазона `childRanges[уровень]`.
 */
export function leveledTree(
  seed: number,
  top: number,
  childRanges: [number, number][],
  size: Size = { width: 120, height: 48 },
): TestInput {
  const random = createRandom(seed);
  let counter = 0;
  const build = (level: number): TestInput => {
    const id = `l${level}-${counter++}`;
    if (level === childRanges.length) {
      return leaf(id, size);
    }
    const [min, max] = childRanges[level];
    const count = random.int(min, max);
    return node(
      id,
      Array.from({ length: count }, () => build(level + 1)),
      size,
    );
  };
  return node(
    'root',
    Array.from({ length: top }, () => build(0)),
    size,
  );
}
