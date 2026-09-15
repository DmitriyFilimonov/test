/**
 * Разделитель групп разрядов в бюджете — неразрывный пробел, заданный явно. Разделитель из
 * Intl.NumberFormat не используется: для ru разные версии ICU отдают U+00A0 или U+202F.
 */
export const BUDGET_GROUP_SEPARATOR = '\u00A0';

/** Суффикс валюты; перед «руб.» тоже неразрывный пробел — число и единица не разрываются. */
export const BUDGET_SUFFIX = '\u00A0руб.';

/** Значение отсутствует: эффективность подразделения без сотрудников. */
export const EMPTY_VALUE = '—';

// Один форматтер на модуль: создание Intl.NumberFormat в разы дороже самого форматирования,
// а первое ещё и загружает данные локали. Берётся только разбиение на части — разделитель
// групп подставляется свой.
const budgetFormatter = new Intl.NumberFormat('ru', { maximumFractionDigits: 0 });

/** «12 345 678 руб.»: целые рубли, группы разрядов через BUDGET_GROUP_SEPARATOR. */
export function formatBudget(value: number): string {
  let result = '';
  for (const part of budgetFormatter.formatToParts(value)) {
    result += part.type === 'group' ? BUDGET_GROUP_SEPARATOR : part.value;
  }
  return result + BUDGET_SUFFIX;
}

/** Эффективность, округлённая до целого, как на карточке дерева; null — «—». */
export function formatPerformance(value: number | null): string {
  return value === null ? EMPTY_VALUE : String(Math.round(value));
}
