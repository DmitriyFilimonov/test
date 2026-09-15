import { describe, expect, it } from 'vitest';
import { revealBox } from './revealBox';

const size = { width: 800, height: 600 };
const box = { x: 0, y: 0, width: 200, height: 100 };

describe('revealBox', () => {
  it('узел уже виден — тот же вид, холст не двигается', () => {
    const view = { x: 100, y: 100, k: 1 };
    expect(revealBox(view, box, size, 32)).toBe(view);
  });

  it('узел правее и ниже экрана — минимальный сдвиг до края с отступом, масштаб прежний', () => {
    const view = { x: 0, y: 0, k: 0.5 };
    const next = revealBox(view, { x: 2000, y: 1500, width: 200, height: 100 }, size, 32);
    // Правый край узла: (2000 + 200) · 0.5 + x = 800 − 32; нижний: (1500 + 100) · 0.5 + y = 600 − 32.
    expect(next).toEqual({ x: -332, y: -232, k: 0.5 });
  });

  it('узел левее и выше экрана — к началу с отступом', () => {
    const next = revealBox(
      { x: -500, y: -400, k: 1 },
      { x: 100, y: 50, width: 200, height: 100 },
      size,
      32,
    );
    expect(next).toEqual({ x: -68, y: -18, k: 1 });
  });

  it('узел больше экрана — выравнивается по началу', () => {
    const next = revealBox(
      { x: 0, y: 0, k: 1 },
      { x: 100, y: 0, width: 2000, height: 100 },
      size,
      32,
    );
    expect(next.x).toBe(-68);
  });
});
