/** Экран = мир · k + (x, y) — тот же вид, что у холста. */
export interface CanvasView {
  x: number;
  y: number;
  k: number;
}

export interface CanvasBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CanvasSize {
  width: number;
  height: number;
}

/** Сдвиг по одной оси, чтобы отрезок [start, start + length] оказался в [padding, viewport − padding]. */
function shiftIntoView(start: number, length: number, viewport: number, padding: number): number {
  // Не помещается или вылез за начало — к началу, как scrollIntoView({ block: 'nearest' }).
  if (length > viewport - 2 * padding || start < padding) {
    return padding - start;
  }
  const end = start + length;
  return end > viewport - padding ? viewport - padding - end : 0;
}

/**
 * Вид, в котором прямоугольник мира виден целиком, с минимальным сдвигом панорамы и тем же
 * масштабом. Уже виден — тот же объект вида: холст не двигается.
 */
export function revealBox(
  view: CanvasView,
  box: CanvasBox,
  size: CanvasSize,
  padding: number,
): CanvasView {
  const dx = shiftIntoView(box.x * view.k + view.x, box.width * view.k, size.width, padding);
  const dy = shiftIntoView(box.y * view.k + view.y, box.height * view.k, size.height, padding);
  return dx === 0 && dy === 0 ? view : { ...view, x: view.x + dx, y: view.y + dy };
}
