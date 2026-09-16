import { combineSlices } from '@reduxjs/toolkit';
import { orgTreeLiveSlice, orgTreeSlice, orgTreeUpdatesSlice } from '@entities/org-tree';

/**
 * Статическая сборка корневого редьюсера из того, что экспортируют пакеты: каждый
 * аргумент — слайс или объект `{ reducerPath, reducer }`. `combineSlices` без `.inject()`
 * — обычная статическая сборка. В сторе только серверные данные и состояние связи с сервером
 * (запросы, поток изменений, номера патчей, изменивших значения): раскрытие, панорама и зум
 * живут в компонентах.
 */
export const rootReducer = combineSlices(orgTreeSlice, orgTreeLiveSlice, orgTreeUpdatesSlice);
