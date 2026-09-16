import { useEffect, useState } from 'react';

const SECOND = 1000;

/** Миллисекунды до ближайшей смены целого числа оставшихся секунд. */
const untilNextSecond = (deadline: number, now: number) => (deadline - now) % SECOND || SECOND;

/**
 * Целые секунды до deadline (с округлением вверх, не меньше 0). Тикает таймером на границах
 * секунд: перерисовывается только компонент, который вызвал хук. Новый deadline — новый
 * экземпляр компонента (key), иначе первый кадр показал бы секунды от прежнего «сейчас».
 */
export function useSecondsLeft(deadline: number): number {
  const [now, setNow] = useState(Date.now);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = () => {
      const current = Date.now();
      setNow(current);
      if (current < deadline) {
        timer = setTimeout(tick, untilNextSecond(deadline, current));
      }
    };
    timer = setTimeout(tick, untilNextSecond(deadline, Date.now()));
    return () => clearTimeout(timer);
  }, [deadline]);

  return Math.max(0, Math.ceil((deadline - now) / SECOND));
}
