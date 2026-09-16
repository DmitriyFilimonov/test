import { useOrgTreeLiveStatus } from '@entities/org-tree';

export type LiveIndicatorState = 'connecting' | 'open' | 'reconnecting' | 'failed';

/**
 * Состояние индикатора соединения. idle бывает только до эффекта подписки (первый рендер) —
 * показывается как подключение, чтобы индикатор не мигал лишним состоянием.
 */
export function useLiveIndicatorModel() {
  const { status, attempt, retryAt, reconnect } = useOrgTreeLiveStatus();
  const state: LiveIndicatorState = status === 'idle' ? 'connecting' : status;
  return { state, attempt, retryAt, reconnect };
}
