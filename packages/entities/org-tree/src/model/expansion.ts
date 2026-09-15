import { collectExpandableSubtreeIds, type ChildrenIndex } from './selectors';

/**
 * Состояние раскрытия живёт только в состоянии React (useExpansion), в Redux не попадает.
 * `null` — пользователь ещё ничего не менял: действуют раскрытия по умолчанию.
 */
export type ExpansionState = ReadonlySet<string> | null;

/** id узла → id родителя (у корней — null). */
export type ParentIndex = ReadonlyMap<string, string | null>;

/** Структура данных, по которой считаются групповые операции раскрытия. */
export interface ExpansionStructure {
  /** Все узлы, у которых есть дети: для «Развернуть всё». */
  expandableIds: readonly string[];
  childrenIndex: ChildrenIndex;
  parentIndex: ParentIndex;
}

export type ExpansionAction =
  | { type: 'toggle'; id: string; current: ReadonlySet<string> }
  | { type: 'expand'; ids: readonly string[]; current: ReadonlySet<string> }
  | { type: 'collapse'; ids: readonly string[]; current: ReadonlySet<string> }
  | { type: 'replace'; ids: readonly string[] };

/**
 * Предки узла от родителя к корню. Узел первого уровня и неизвестный id — пустой список.
 * Цикл в parentId (данные не гарантируют дерево) обрывается на первом повторе.
 */
export function ancestorIds(parentIndex: ParentIndex, id: string): string[] {
  const result: string[] = [];
  const seen = new Set([id]);
  let parentId = parentIndex.get(id) ?? null;
  while (parentId !== null && !seen.has(parentId)) {
    seen.add(parentId);
    result.push(parentId);
    parentId = parentIndex.get(parentId) ?? null;
  }
  return result;
}

/** Набор с добавленными id. Если все уже раскрыты — тот же набор: состояние не меняется. */
export function expandIds(
  current: ReadonlySet<string>,
  ids: readonly string[],
): ReadonlySet<string> {
  if (ids.every((id) => current.has(id))) {
    return current;
  }
  const next = new Set(current);
  for (const id of ids) {
    next.add(id);
  }
  return next;
}

/**
 * Действия операций useExpansion. `current` — раскрытие на экране (состояние или умолчания):
 * операции считаются от того, что видит пользователь.
 */
export const expansionActions = {
  toggle: (current: ReadonlySet<string>, id: string): ExpansionAction => ({
    type: 'toggle',
    id,
    current,
  }),
  toggleRecursive: (
    current: ReadonlySet<string>,
    structure: ExpansionStructure,
    id: string,
  ): ExpansionAction => ({
    type: current.has(id) ? 'collapse' : 'expand',
    ids: collectExpandableSubtreeIds(structure.childrenIndex, id),
    current,
  }),
  expandAll: (structure: ExpansionStructure): ExpansionAction => ({
    type: 'replace',
    ids: structure.expandableIds,
  }),
  collapseAll: (): ExpansionAction => ({ type: 'replace', ids: [] }),
  expandAncestors: (
    current: ReadonlySet<string>,
    structure: ExpansionStructure,
    id: string,
  ): ExpansionAction => ({
    type: 'expand',
    ids: ancestorIds(structure.parentIndex, id),
    current,
  }),
};

export function expansionReducer(state: ExpansionState, action: ExpansionAction): ExpansionState {
  switch (action.type) {
    case 'toggle': {
      // Меняется только сам узел: раскрытия потомков сохраняются и вернутся при повторном раскрытии.
      const next = new Set(action.current);
      if (next.has(action.id)) {
        next.delete(action.id);
      } else {
        next.add(action.id);
      }
      return next;
    }
    case 'expand': {
      const next = expandIds(action.current, action.ids);
      // Нечего добавить — прежнее состояние, в том числе null: умолчания продолжают действовать.
      return next === action.current ? state : next;
    }
    case 'collapse': {
      const next = new Set(action.current);
      for (const id of action.ids) {
        next.delete(id);
      }
      return next;
    }
    case 'replace':
      return new Set(action.ids);
    default:
      return state;
  }
}
