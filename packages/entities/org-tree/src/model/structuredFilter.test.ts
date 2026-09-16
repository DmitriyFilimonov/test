/** @vitest-environment node */
import { describe, expect, it } from 'vitest';
import type { TableRow } from './table';
import { applyStructuredFilter, isEmptyFilter } from './structuredFilter';

const makeRows = (): TableRow[] => [
  {
    id: 'd-1',
    parentId: null,
    name: 'Дивизион A',
    level: 1,
    totalHeadcount: 50,
    totalBudget: 2000000,
    totalPerformance: 65,
    matches: true,
  },
  {
    id: 'p-1',
    parentId: 'd-1',
    name: 'Отдел 1',
    level: 2,
    totalHeadcount: 20,
    totalBudget: 800000,
    totalPerformance: 70,
    matches: true,
  },
  {
    id: 't-1',
    parentId: 'p-1',
    name: 'Команда 1',
    level: 3,
    totalHeadcount: 5,
    totalBudget: 200000,
    totalPerformance: 60,
    matches: true,
  },
  {
    id: 't-2',
    parentId: 'p-1',
    name: 'Команда 2',
    level: 3,
    totalHeadcount: 15,
    totalBudget: 600000,
    totalPerformance: 80,
    matches: true,
  },
  {
    id: 'p-2',
    parentId: 'd-1',
    name: 'Отдел 2',
    level: 2,
    totalHeadcount: 30,
    totalBudget: 1200000,
    totalPerformance: null,
    matches: true,
  },
  {
    id: 'd-2',
    parentId: null,
    name: 'Дивизион B',
    level: 1,
    totalHeadcount: 10,
    totalBudget: 400000,
    totalPerformance: 50,
    matches: true,
  },
];

describe('isEmptyFilter', () => {
  it('пустой объект — пустой фильтр', () => {
    expect(isEmptyFilter({})).toBe(true);
  });

  it('любое заданное поле — не пустой', () => {
    expect(isEmptyFilter({ levels: [1] })).toBe(false);
    expect(isEmptyFilter({ minHeadcount: 10 })).toBe(false);
    expect(isEmptyFilter({ maxPerformance: 80 })).toBe(false);
  });
});

describe('applyStructuredFilter', () => {
  it('пустой фильтр — та же ссылка', () => {
    const rows = makeRows();
    const result = applyStructuredFilter(rows, {});
    expect(result).toBe(rows);
  });

  it('levels: только команды (3)', () => {
    const rows = makeRows();
    const result = applyStructuredFilter(rows, { levels: [3] });
    const ids = result.map((r) => r.id);
    expect(ids).toContain('t-1');
    expect(ids).toContain('t-2');
    // Предки для контекста
    expect(ids).toContain('p-1');
    expect(ids).toContain('d-1');
    // Некоманды без предков
    expect(ids).not.toContain('p-2');
    expect(ids).not.toContain('d-2');
  });

  it('minHeadcount: >= 15', () => {
    const rows = makeRows();
    const result = applyStructuredFilter(rows, { minHeadcount: 15 });
    const ids = result.map((r) => r.id);
    expect(ids).toContain('t-2'); // 15
    expect(ids).toContain('p-2'); // 30
    expect(ids).toContain('d-1'); // 50
    expect(ids).not.toContain('t-1'); // 5
  });

  it('maxHeadcount: <= 10', () => {
    const rows = makeRows();
    const result = applyStructuredFilter(rows, { maxHeadcount: 10 });
    const ids = result.map((r) => r.id);
    expect(ids).toContain('t-1'); // 5
    expect(ids).toContain('d-2'); // 10
    expect(ids).not.toContain('t-2'); // 15
  });

  it('minBudget: >= 500000', () => {
    const rows = makeRows();
    const result = applyStructuredFilter(rows, { minBudget: 500000 });
    const ids = result.map((r) => r.id);
    expect(ids).toContain('t-2'); // 600000
    expect(ids).toContain('p-1'); // 800000
    expect(ids).toContain('p-2'); // 1200000
    expect(ids).toContain('d-1'); // 2000000
    expect(ids).not.toContain('t-1'); // 200000
  });

  it('maxBudget: <= 500000', () => {
    const rows = makeRows();
    const result = applyStructuredFilter(rows, { maxBudget: 500000 });
    const ids = result.map((r) => r.id);
    expect(ids).toContain('t-1'); // 200000
    expect(ids).toContain('d-2'); // 400000
    expect(ids).not.toContain('t-2'); // 600000
  });

  it('minPerformance: >= 65 — null-performance не проходит', () => {
    const rows = makeRows();
    const result = applyStructuredFilter(rows, { minPerformance: 65 });
    const ids = result.map((r) => r.id);
    expect(ids).toContain('p-1'); // 70
    expect(ids).toContain('t-2'); // 80
    expect(ids).toContain('d-1'); // 65
    expect(ids).not.toContain('p-2'); // null
    expect(ids).not.toContain('t-1'); // 60
  });

  it('maxPerformance: <= 60 — null-performance не проходит', () => {
    const rows = makeRows();
    const result = applyStructuredFilter(rows, { maxPerformance: 60 });
    const ids = result.map((r) => r.id);
    expect(ids).toContain('t-1'); // 60
    expect(ids).toContain('d-2'); // 50
    expect(ids).not.toContain('p-2'); // null
    // d-1 — предок t-1, добавлен для контекста
    expect(ids).toContain('d-1');
  });

  it('комбинация по И: levels=[3] и minHeadcount >= 10', () => {
    const rows = makeRows();
    const result = applyStructuredFilter(rows, { levels: [3], minHeadcount: 10 });
    const ids = result.map((r) => r.id);
    expect(ids).toContain('t-2'); // level 3, headcount 15
    expect(ids).not.toContain('t-1'); // level 3, headcount 5
    expect(ids).toContain('p-1'); // предок
    expect(ids).toContain('d-1'); // предок
  });

  it('предки проходящих строк помечены matches: false', () => {
    const rows = makeRows();
    const result = applyStructuredFilter(rows, { levels: [3] });
    const byId = new Map(result.map((r) => [r.id, r]));
    // Проходящие — matches: true
    expect(byId.get('t-1')!.matches).toBe(true);
    expect(byId.get('t-2')!.matches).toBe(true);
    // Предки — matches: false
    expect(byId.get('p-1')!.matches).toBe(false);
    expect(byId.get('d-1')!.matches).toBe(false);
  });

  it('порядок строк сохраняется', () => {
    const rows = makeRows();
    const result = applyStructuredFilter(rows, { levels: [3] });
    const ids = result.map((r) => r.id);
    // Предки идут перед потомками, порядок оригинальных строк сохраняется
    expect(ids.indexOf('d-1')).toBeLessThan(ids.indexOf('p-1'));
    expect(ids.indexOf('p-1')).toBeLessThan(ids.indexOf('t-1'));
    expect(ids.indexOf('p-1')).toBeLessThan(ids.indexOf('t-2'));
  });
});
