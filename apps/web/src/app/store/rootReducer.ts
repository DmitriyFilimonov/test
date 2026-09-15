import { combineSlices } from '@reduxjs/toolkit';
import { orgTreeSlice } from '@entities/org-tree';

/**
 * Статическая сборка корневого редьюсера из того, что экспортируют пакеты: каждый
 * аргумент — слайс или объект `{ reducerPath, reducer }`. `combineSlices` без `.inject()`
 * — обычная статическая сборка. В сторе только серверные данные: раскрытие, панорама и
 * зум живут в виджете.
 */
export const rootReducer = combineSlices(orgTreeSlice);
