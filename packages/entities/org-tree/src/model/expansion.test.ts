/** @vitest-environment node */
import { describe, expect, it } from 'vitest';
import { expansionReducer } from './expansion';

describe('expansionReducer', () => {
  it('toggle меняет только сам узел, раскрытия потомков сохраняются', () => {
    const current = new Set(['A', 'A2']);
    const collapsed = expansionReducer(current, { type: 'toggle', id: 'A', current })!;
    expect([...collapsed]).toEqual(['A2']);
    const reopened = expansionReducer(collapsed, { type: 'toggle', id: 'A', current: collapsed })!;
    expect([...reopened].sort()).toEqual(['A', 'A2']);
  });

  it('expand добавляет узлы ветки, не трогая остальные', () => {
    const current = new Set(['B']);
    const next = expansionReducer(current, { type: 'expand', ids: ['A', 'A2'], current })!;
    expect([...next].sort()).toEqual(['A', 'A2', 'B']);
  });

  it('replace задаёт набор целиком', () => {
    expect([...expansionReducer(null, { type: 'replace', ids: ['X'] })!]).toEqual(['X']);
  });

  it('не мутирует текущий набор', () => {
    const current = new Set(['A']);
    expansionReducer(current, { type: 'toggle', id: 'A', current });
    expect([...current]).toEqual(['A']);
  });
});
