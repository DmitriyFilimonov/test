/**
 * Состояние раскрытия живёт только в виджете (useReducer), в Redux не попадает.
 * `null` — пользователь ещё ничего не менял: действуют раскрытия по умолчанию.
 */
export type ExpansionState = ReadonlySet<string> | null;

export type ExpansionAction =
  | { type: 'toggle'; id: string; current: ReadonlySet<string> }
  | { type: 'expand'; ids: readonly string[]; current: ReadonlySet<string> }
  | { type: 'replace'; ids: readonly string[] };

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
      const next = new Set(action.current);
      for (const id of action.ids) {
        next.add(id);
      }
      return next;
    }
    case 'replace':
      return new Set(action.ids);
    default:
      return state;
  }
}
