import { randomInt } from 'node:crypto';
import type { OrgNode } from './org-tree-data';
import type { OrgTreeChange } from './org-tree-stream';

/** Новые данные и изменение для рассылки; null — менять нечего. */
export type ChangeResult = { nodes: readonly OrgNode[]; change: OrgTreeChange } | null;

const now = () => new Date().toISOString();

function leafIndexes(nodes: readonly OrgNode[]): number[] {
  const parentIds = new Set(nodes.map((node) => node.parentId));
  return nodes.flatMap((node, index) => (parentIds.has(node.id) ? [] : [index]));
}

/** Сдвиг на 1–3 вниз или вверх в пределах [min, max]: значение всегда меняется. */
function shift(value: number, min: number, max: number): number {
  const delta = randomInt(1, 4);
  const canDown = value - delta >= min;
  const down = canDown && (value + delta > max || randomInt(2) === 0);
  return down ? value - delta : value + delta;
}

/** headcount и updatedAt ровно одного случайного узла (POST /api/dev/touch). */
export function touchRandomNode(nodes: readonly OrgNode[]): ChangeResult {
  if (nodes.length === 0) {
    return null;
  }
  const index = randomInt(nodes.length);
  const before = nodes[index];
  const headcount = shift(before.headcount, 1, Number.MAX_SAFE_INTEGER);
  const after: OrgNode = { ...before, headcount, updatedAt: now() };
  return {
    nodes: nodes.with(index, after),
    change: {
      nodes: [{ id: after.id, headcount, updatedAt: after.updatedAt }],
      removed: [],
      added: [],
    },
  };
}

/** headcount и performance случайного листа: изменение генератора потока, структура та же. */
export function updateRandomLeaf(nodes: readonly OrgNode[]): ChangeResult {
  const leaves = leafIndexes(nodes);
  if (leaves.length === 0) {
    return null;
  }
  const index = leaves[randomInt(leaves.length)];
  const before = nodes[index];
  const after: OrgNode = {
    ...before,
    headcount: shift(before.headcount, 1, Number.MAX_SAFE_INTEGER),
    performance: shift(before.performance, 0, 100),
    updatedAt: now(),
  };
  const { id, headcount, performance, updatedAt } = after;
  return {
    nodes: nodes.with(index, after),
    change: { nodes: [{ id, headcount, performance, updatedAt }], removed: [], added: [] },
  };
}

/**
 * Удаляет случайный лист. Только лист: иначе у детей остался бы parentId на несуществующий
 * узел, а это нарушение контракта (для него есть scenario=invalid).
 */
export function deleteRandomLeaf(nodes: readonly OrgNode[]): ChangeResult {
  const leaves = leafIndexes(nodes);
  if (leaves.length === 0) {
    return null;
  }
  const index = leaves[randomInt(leaves.length)];
  return {
    nodes: nodes.toSpliced(index, 1),
    change: { nodes: [], removed: [nodes[index].id], added: [] },
  };
}

let addedCount = 0;

/** Добавляет команду к родителю случайного листа; в пустые данные — корень. */
export function addLeaf(nodes: readonly OrgNode[]): ChangeResult {
  const ids = new Set(nodes.map((node) => node.id));
  let id: string;
  do {
    id = `org-${randomInt(0x1000000).toString(16).padStart(6, '0')}`;
  } while (ids.has(id));

  const leaves = leafIndexes(nodes);
  const parentId = leaves.length === 0 ? null : nodes[leaves[randomInt(leaves.length)]].parentId;
  addedCount += 1;
  const node: OrgNode = {
    id,
    name: `Новая команда ${addedCount}`,
    parentId,
    headcount: randomInt(4, 16),
    budget: randomInt(500, 3001) * 10_000,
    performance: randomInt(30, 101),
    updatedAt: now(),
  };
  return { nodes: [...nodes, node], change: { nodes: [], removed: [], added: [node] } };
}
