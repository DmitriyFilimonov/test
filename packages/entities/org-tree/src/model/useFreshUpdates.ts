import { useState } from 'react';

/**
 * Номера обновлений, пришедших после монтирования элемента: подсвечиваются только они. Значение,
 * обновлённое раньше (строка появилась при раскрытии, фильтре или смене вида), — undefined:
 * иначе каждое появление строки мигало бы давними обновлениями. Таймеров и состояния
 * «подсвечено» нет: номер при монтировании запоминается один раз.
 */
export function useFreshUpdates<TKey extends string>(
  seqs: Record<TKey, number | undefined>,
): Partial<Record<TKey, number>> {
  const [mounted] = useState(seqs);
  const fresh: Partial<Record<TKey, number>> = {};
  for (const key of Object.keys(seqs) as TKey[]) {
    if (seqs[key] !== mounted[key]) {
      fresh[key] = seqs[key];
    }
  }
  return fresh;
}
