import { useSyncExternalStore } from 'react';

/** Ширина, с которой дерево и таблица помещаются рядом. */
export const SPLIT_MEDIA_QUERY = '(min-width: 1280px)';

function subscribe(onChange: () => void) {
  const list = window.matchMedia(SPLIT_MEDIA_QUERY);
  list.addEventListener('change', onChange);
  return () => list.removeEventListener('change', onChange);
}

function getSnapshot() {
  return window.matchMedia(SPLIT_MEDIA_QUERY).matches;
}

/**
 * Доступен ли режим split. matchMedia через useSyncExternalStore: браузер сам сообщает о
 * пересечении границы, без resize-слушателя и чтения размеров из DOM; смена режима попадает в
 * тот же кадр, что и новая ширина.
 */
export function useSplitAvailable(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot);
}
