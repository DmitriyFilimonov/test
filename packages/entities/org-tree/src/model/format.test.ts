/** @vitest-environment node */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { aggregateSubtrees } from './aggregate';
import {
  BUDGET_GROUP_SEPARATOR,
  BUDGET_SUFFIX,
  EMPTY_VALUE,
  formatBudget,
  formatPerformance,
} from './format';
import { getMetricRows, getNodeMetrics } from '../lib/nodeMetrics';
import { makeOrgNodes } from './testing/fixtures';

const S = BUDGET_GROUP_SEPARATOR;

afterEach(() => {
  vi.restoreAllMocks();
});

describe('formatBudget', () => {
  it('разделитель групп — неразрывный пробел U+00A0, суффикс — «руб.» через неразрывный пробел', () => {
    expect(BUDGET_GROUP_SEPARATOR).toBe('\u00A0');
    expect(BUDGET_SUFFIX).toBe('\u00A0руб.');
  });

  it.each([
    [0, '0'],
    [1, '1'],
    [999, '999'],
    [1000, `1${S}000`],
    [12345678, `12${S}345${S}678`],
  ])('%d → «%s руб.»', (value, digits) => {
    expect(formatBudget(value)).toBe(`${digits}${BUDGET_SUFFIX}`);
  });

  it('пример из ТЗ посимвольно: «12 345 678 руб.», пробелы неразрывные, знака ₽ нет', () => {
    expect(formatBudget(12345678)).toBe('12\u00A0345\u00A0678\u00A0руб.');
    expect(formatBudget(12345678)).not.toContain('₽');
  });

  it('разделитель не зависит от ICU: группа U+202F из Intl заменяется константой', () => {
    // Так форматирует ru в версиях ICU, где разделитель групп — узкий неразрывный пробел.
    vi.spyOn(Intl.NumberFormat.prototype, 'formatToParts').mockReturnValue([
      { type: 'integer', value: '12' },
      { type: 'group', value: '\u202F' },
      { type: 'integer', value: '345' },
      { type: 'group', value: '\u202F' },
      { type: 'integer', value: '678' },
    ]);
    expect(formatBudget(12345678)).toBe(`12${S}345${S}678${BUDGET_SUFFIX}`);
  });

  it('целые рубли: дробная часть округляется', () => {
    expect(formatBudget(1234.5)).toBe(`1${S}235${BUDGET_SUFFIX}`);
  });

  it('форматтер создаётся один раз на модуль, а не на каждый вызов', () => {
    const constructor = vi.spyOn(Intl, 'NumberFormat');
    formatBudget(1);
    formatBudget(1000);
    formatBudget(12345678);
    expect(constructor).not.toHaveBeenCalled();
  });
});

describe('formatPerformance', () => {
  it('null → «—»', () => {
    expect(EMPTY_VALUE).toBe('—');
    expect(formatPerformance(null)).toBe('—');
  });

  it('0 — значение, а не отсутствие; дробное округляется до целого', () => {
    expect(formatPerformance(0)).toBe('0');
    expect(formatPerformance(100)).toBe('100');
    expect(formatPerformance(61.5)).toBe('62');
    expect(formatPerformance(61.49)).toBe('61');
  });

  it('совпадает с тем, что карточка дерева показывает для общей эффективности', () => {
    const nodes = makeOrgNodes();
    const aggregates = aggregateSubtrees(nodes);
    for (const node of nodes) {
      const childCount = nodes.filter((other) => other.parentId === node.id).length;
      const subtree = aggregates.get(node.id)!;
      const metrics = getNodeMetrics({ node, childCount, subtree, matches: node.matches });
      const card = getMetricRows(metrics, childCount === 0).find(
        (row) => row.key === 'total-performance' || row.key === 'performance',
      )!;
      expect(formatPerformance(subtree.performance)).toBe(card.value);
    }
  });
});
