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
});

export type OrgNode = z.infer<typeof orgNodeSchema>;

/**
 * Массив узлов плюс целостность дерева: id уникальны, parentId указывает на
 * существующий узел, циклов нет. Любое нарушение — ошибка всего ответа.
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
