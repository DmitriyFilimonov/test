import type { OrgNode } from './schema';

/**
 * Данные не изменились, если совпадает набор id и у каждого узла тот же updatedAt.
 * O(n). Ловит изменение узла, удаление, добавление и «удалили один, добавили другой».
 * Опирается на контракт API: любое изменение узла меняет его updatedAt.
 * Только максимум updatedAt пропускал бы удаление узла.
 */
export function isSameOrgTree(current: readonly OrgNode[], next: readonly OrgNode[]): boolean {
  if (current.length !== next.length) {
    return false;
  }
  const updatedAtById = new Map<string, string>();
  for (const node of current) {
    updatedAtById.set(node.id, node.updatedAt);
  }
  return next.every((node) => updatedAtById.get(node.id) === node.updatedAt);
}
