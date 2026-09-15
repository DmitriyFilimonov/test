import { z } from 'zod';

/** Строгая схема узла: лишние поля — ошибка, а не молчаливое отбрасывание. */
export const orgNodeSchema = z.strictObject({
  id: z.string().min(1),
  name: z.string().min(1),
  parentId: z.string().min(1).nullable(),
  headcount: z.number().int().min(0),
  budget: z.number().min(0),
  performance: z.number().int().min(0).max(100),
  /** ISO 8601 в UTC; zod проверяет и календарь (30 февраля не пройдёт). */
  updatedAt: z.iso.datetime(),
  /** Совпал ли собственный name узла с q запроса. */
  matches: z.boolean(),
  /** 0-based позиция в серверной сортировке, сквозная по всем узлам. */
  order: z.number().int().min(0),
});

export type OrgNode = z.infer<typeof orgNodeSchema>;

/**
 * Массив узлов плюс целостность дерева: id уникальны, parentId указывает на
 * существующий узел, циклов нет, order — перестановка 0..n-1. Любое нарушение — ошибка
 * всего ответа.
 */
export const orgTreeResponseSchema = z.array(orgNodeSchema).superRefine((nodes, ctx) => {
  const indexById = new Map<string, number>();
  nodes.forEach((node, index) => {
    if (indexById.has(node.id)) {
      ctx.addIssue({ code: 'custom', message: `Duplicate id "${node.id}"`, path: [index, 'id'] });
    } else {
      indexById.set(node.id, index);
    }
  });

  nodes.forEach((node, index) => {
    if (node.parentId !== null && !indexById.has(node.parentId)) {
      ctx.addIssue({
        code: 'custom',
        message: `Unknown parentId "${node.parentId}"`,
        path: [index, 'parentId'],
      });
    }
  });

  // Поиск циклов за O(n): 1 — узел на текущем пути, 2 — путь от узла до корня проверен.
  const state = new Uint8Array(nodes.length);
  for (let start = 0; start < nodes.length; start++) {
    const path: number[] = [];
    let current: number | undefined = start;
    while (current !== undefined && state[current] === 0) {
      state[current] = 1;
      path.push(current);
      const parentId: string | null = nodes[current].parentId;
      current = parentId === null ? undefined : indexById.get(parentId);
    }
    if (current !== undefined && state[current] === 1) {
      ctx.addIssue({
        code: 'custom',
        message: `Cycle through "${nodes[current].id}"`,
        path: [current, 'parentId'],
      });
    }
    for (const index of path) {
      state[index] = 2;
    }
  }

  // order: n значений в диапазоне 0..n-1 без повторов — значит, покрыт весь диапазон.
  const orderSeen = new Uint8Array(nodes.length);
  nodes.forEach((node, index) => {
    if (node.order >= nodes.length) {
      ctx.addIssue({
        code: 'custom',
        message: `order ${node.order} is out of range 0..${nodes.length - 1}`,
        path: [index, 'order'],
      });
    } else if (orderSeen[node.order] === 1) {
      ctx.addIssue({
        code: 'custom',
        message: `Duplicate order ${node.order}`,
        path: [index, 'order'],
      });
    } else {
      orderSeen[node.order] = 1;
    }
  });
});

export class OrgTreeContractError extends Error {
  override name = 'OrgTreeContractError';
}

/** Разбор ответа целиком: при любой ошибке — исключение, частичного результата нет. */
export function parseOrgTree(raw: unknown): OrgNode[] {
  const result = orgTreeResponseSchema.safeParse(raw);
  if (!result.success) {
    throw new OrgTreeContractError(
      `Ответ сервера не соответствует контракту:\n${z.prettifyError(result.error)}`,
    );
  }
  return result.data;
}
