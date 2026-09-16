import { createAction, type UnknownAction } from '@reduxjs/toolkit';

/** Значения узла, которые показывают таблица и карточка и которые может изменить патч. */
export const UPDATABLE_METRICS = [
  'ownHeadcount',
  'ownPerformance',
  'totalHeadcount',
  'totalBudget',
  'totalPerformance',
] as const;

export type UpdatableMetric = (typeof UPDATABLE_METRICS)[number];

/** seq патча, последним изменившего значение. Нет ключа — значение патчами не менялось. */
export type OrgNodeUpdates = Partial<Record<UpdatableMetric, number>>;

/** id узла → его обновления. Состояния «подсвечено» здесь нет: только номер патча. */
export type OrgTreeUpdatesState = Readonly<Record<string, OrgNodeUpdates>>;

export const orgTreeUpdatesRecorded = createAction<{
  updates: Record<string, OrgNodeUpdates>;
  /** Удалённые узлы: их записи больше не нужны. */
  removed: readonly string[];
}>('orgTreeUpdates/recorded');

const initialState: OrgTreeUpdatesState = {};

export function orgTreeUpdatesReducer(
  state: OrgTreeUpdatesState = initialState,
  action: UnknownAction,
): OrgTreeUpdatesState {
  if (!orgTreeUpdatesRecorded.match(action)) {
    return state;
  }
  const { updates, removed } = action.payload;
  const next = { ...state };
  for (const [id, metrics] of Object.entries(updates)) {
    next[id] = { ...next[id], ...metrics };
  }
  for (const id of removed) {
    delete next[id];
  }
  return next;
}

export const ORG_TREE_UPDATES_PATH = 'orgTreeUpdates';

export interface OrgTreeUpdatesRootState {
  [ORG_TREE_UPDATES_PATH]: OrgTreeUpdatesState;
}

export const selectOrgTreeUpdates = (root: OrgTreeUpdatesRootState): OrgTreeUpdatesState =>
  root[ORG_TREE_UPDATES_PATH];
