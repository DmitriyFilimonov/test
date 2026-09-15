import type { LayoutOptions, LayoutResult } from '../types';
import type { TestInput } from './trees';

const EPS = 1e-6;

type Result = LayoutResult<string>;

function along(node: Result['nodes'][number], options: LayoutOptions) {
  return options.orientation === 'vertical'
    ? { start: node.x, size: node.width, across: node.y }
    : { start: node.y, size: node.height, across: node.x };
}

/** Проверяет инварианты раскладки; возвращает список нарушений (пустой — всё в порядке). */
export function findViolations(result: Result, input: TestInput, options: LayoutOptions): string[] {
  const violations: string[] = [];
  const byId = new Map(result.nodes.map((n) => [n.id, n]));

  // Структура: те же узлы, родители, глубины и рёбра, что во входе.
  const expected: { input: TestInput; parentId: string | null; depth: number }[] = [];
  const stack = [{ input, parentId: null as string | null, depth: 0 }];
  while (stack.length > 0) {
    const item = stack.pop()!;
    expected.push(item);
    for (const child of item.input.children) {
      stack.push({ input: child, parentId: item.input.id, depth: item.depth + 1 });
    }
  }
  if (expected.length !== result.nodes.length) {
    violations.push(`nodes: expected ${expected.length}, got ${result.nodes.length}`);
  }
  for (const { input: item, parentId, depth } of expected) {
    const laid = byId.get(item.id);
    if (!laid) {
      violations.push(`missing node ${item.id}`);
      continue;
    }
    if (laid.parentId !== parentId || laid.depth !== depth) {
      violations.push(`structure of ${item.id}`);
    }
    if (laid.width !== item.size.width || laid.height !== item.size.height) {
      violations.push(`size of ${item.id}`);
    }
  }
  if (result.edges.length !== result.nodes.length - 1) {
    violations.push(`edges: expected ${result.nodes.length - 1}, got ${result.edges.length}`);
  }
  for (const edge of result.edges) {
    if (byId.get(edge.childId)?.parentId !== edge.parentId) {
      violations.push(`edge ${edge.id} does not match parentId`);
    }
  }

  // Нормализация: всё в неотрицательных координатах, bounds плотно охватывает узлы.
  const minX = Math.min(...result.nodes.map((n) => n.x));
  const minY = Math.min(...result.nodes.map((n) => n.y));
  const maxX = Math.max(...result.nodes.map((n) => n.x + n.width));
  const maxY = Math.max(...result.nodes.map((n) => n.y + n.height));
  if (Math.abs(minX) > EPS || Math.abs(minY) > EPS) {
    violations.push(`not normalized: min x=${minX}, min y=${minY}`);
  }
  if (Math.abs(maxX - result.bounds.width) > EPS || Math.abs(maxY - result.bounds.height) > EPS) {
    violations.push(`bounds ${JSON.stringify(result.bounds)} vs extent ${maxX}×${maxY}`);
  }

  // Уровни: одна координата поперёк; соседи вдоль оси не ближе зазора.
  const levels = new Map<number, Result['nodes']>();
  for (const n of result.nodes) {
    levels.set(n.depth, [...(levels.get(n.depth) ?? []), n]);
  }
  for (const [depth, levelNodes] of levels) {
    const across = new Set(levelNodes.map((n) => along(n, options).across));
    if (across.size !== 1) {
      violations.push(`level ${depth} is not aligned`);
    }
    const sorted = [...levelNodes].sort(
      (a, b) => along(a, options).start - along(b, options).start,
    );
    for (let i = 1; i < sorted.length; i++) {
      const left = along(sorted[i - 1], options);
      const right = along(sorted[i], options);
      const gap = right.start - (left.start + left.size);
      const required =
        sorted[i - 1].parentId === sorted[i].parentId ? options.siblingGap : options.subtreeGap;
      if (gap < required - EPS) {
        violations.push(
          `level ${depth}: gap ${gap} < ${required} between ${sorted[i - 1].id} and ${sorted[i].id}`,
        );
      }
    }
  }

  // Родитель по центру между крайними детьми.
  const center = (id: string) => {
    const a = along(byId.get(id)!, options);
    return a.start + a.size / 2;
  };
  for (const { input: item } of expected) {
    if (item.children.length === 0) {
      continue;
    }
    const expectedCenter =
      (center(item.children[0].id) + center(item.children[item.children.length - 1].id)) / 2;
    if (Math.abs(center(item.id) - expectedCenter) > EPS) {
      violations.push(`${item.id} is not centered over its children`);
    }
  }

  return violations;
}

/** Зеркальный вход должен дать зеркальный выход. */
export function findMirrorViolations(
  result: Result,
  mirroredResult: Result,
  options: LayoutOptions,
): string[] {
  const violations: string[] = [];
  const mirroredById = new Map(mirroredResult.nodes.map((n) => [n.id, n]));
  if (
    Math.abs(result.bounds.width - mirroredResult.bounds.width) > EPS ||
    Math.abs(result.bounds.height - mirroredResult.bounds.height) > EPS
  ) {
    violations.push('bounds differ');
  }
  for (const n of result.nodes) {
    const m = mirroredById.get(n.id)!;
    const reflected =
      options.orientation === 'vertical'
        ? { x: result.bounds.width - (n.x + n.width), y: n.y }
        : { x: n.x, y: result.bounds.height - (n.y + n.height) };
    if (Math.abs(m.x - reflected.x) > EPS || Math.abs(m.y - reflected.y) > EPS) {
      violations.push(
        `${n.id}: mirrored (${m.x}, ${m.y}) != reflected (${reflected.x}, ${reflected.y})`,
      );
    }
  }
  return violations;
}

/**
 * Изоморфные поддеревья (одинаковая структура и размеры) должны иметь одинаковую форму:
 * одинаковые смещения узлов относительно корня поддерева. Возвращает нарушения и число
 * сравнённых групп, чтобы тест мог убедиться, что сравнивать было что.
 */
export function findIsomorphismViolations(
  result: Result,
  input: TestInput,
): { violations: string[]; comparedGroups: number } {
  const byId = new Map(result.nodes.map((n) => [n.id, n]));
  const signature = new Map<TestInput, string>();
  const signatureOf = (item: TestInput): string => {
    const cached = signature.get(item);
    if (cached !== undefined) {
      return cached;
    }
    const value = `${item.size.width}x${item.size.height}(${item.children.map(signatureOf).join(',')})`;
    signature.set(item, value);
    return value;
  };
  const shape = (item: TestInput): number[] => {
    const root = byId.get(item.id)!;
    const offsets: number[] = [];
    const walk = (current: TestInput) => {
      const laid = byId.get(current.id)!;
      offsets.push(laid.x - root.x, laid.y - root.y);
      current.children.forEach(walk);
    };
    walk(item);
    return offsets;
  };

  const groups = new Map<string, TestInput[]>();
  const collect = (item: TestInput) => {
    if (item.children.length > 0) {
      const key = signatureOf(item);
      groups.set(key, [...(groups.get(key) ?? []), item]);
    }
    item.children.forEach(collect);
  };
  collect(input);

  const violations: string[] = [];
  let comparedGroups = 0;
  for (const members of groups.values()) {
    if (members.length < 2) {
      continue;
    }
    comparedGroups += 1;
    const reference = shape(members[0]);
    for (const other of members.slice(1)) {
      const offsets = shape(other);
      if (offsets.some((value, i) => Math.abs(value - reference[i]) > EPS)) {
        violations.push(`${other.id} differs in shape from ${members[0].id}`);
      }
    }
  }
  return { violations, comparedGroups };
}
