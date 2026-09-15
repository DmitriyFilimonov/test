import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { LayoutNode, LayoutResult } from '@shared/tidy-tree';
import styled, { useTheme } from 'styled-components';
import { revealBox } from '../lib/revealBox';
import type { RevealRequest } from '../model/selection';
import { TreeEdge } from './TreeEdge';

/** Экран = мир · k + (x, y). */
interface View {
  x: number;
  y: number;
  k: number;
}

interface Size {
  width: number;
  height: number;
}

const FIT_PADDING = 32;
const MIN_FIT_ZOOM = 0.75;
const DRAG_THRESHOLD_PX = 4;
const WHEEL_COMMIT_DELAY_MS = 150;
const WHEEL_ZOOM_SPEED = 0.0015;
const INITIAL_VIEW: View = { x: 0, y: 0, k: 1 };

const Svg = styled.svg`
  display: block;
  width: 100%;
  height: 100%;
  touch-action: none;
  user-select: none;
  cursor: grab;

  &[data-dragging='true'] {
    cursor: grabbing;
  }
`;

const formatTransform = ({ x, y, k }: View) => `translate(${x} ${y}) scale(${k})`;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

function fitView(bounds: Size, size: Size, minZoom: number): View {
  const k = clamp(
    Math.min(
      (size.width - 2 * FIT_PADDING) / bounds.width,
      (size.height - 2 * FIT_PADDING) / bounds.height,
    ),
    // Мельче текст не читается: широкое дерево начинается слева, остальное — панорамой.
    Math.max(minZoom, MIN_FIT_ZOOM),
    1,
  );
  const width = bounds.width * k;
  return {
    k,
    // Помещается — по центру, не помещается — от левого края с отступом.
    x: width <= size.width ? (size.width - width) / 2 : FIT_PADDING,
    y: FIT_PADDING,
  };
}

export interface TreeCanvasProps<T> {
  layout: LayoutResult<T>;
  renderNode: (node: LayoutNode<T>) => ReactNode;
  /**
   * Узел, чья экранная позиция сохраняется при смене раскладки (тот, по которому кликнули):
   * холст компенсирует сдвиг узла сдвигом панорамы и не «прыгает».
   */
  anchorId: string | null;
  /**
   * Довести узел до экрана минимальным сдвигом панорамы. Выполняется один раз на `nonce`, когда
   * узел есть в раскладке и размер холста известен: после раскрытия предков — в том же кадре.
   */
  revealRequest?: RevealRequest | null;
  'aria-label': string;
}

/**
 * SVG-холст с панорамой и зумом. Знает только про LayoutResult; как рисовать узел, решает
 * renderNode.
 *
 * Во время жеста transform пишется императивно в атрибут <g> не чаще раза за кадр
 * (requestAnimationFrame схлопывает события wheel/pointermove). В состояние React вид
 * коммитится один раз по завершении жеста.
 */
export function TreeCanvas<T>({
  layout,
  renderNode,
  anchorId,
  revealRequest = null,
  'aria-label': ariaLabel,
}: TreeCanvasProps<T>) {
  const { tree } = useTheme();
  const { minZoom, maxZoom } = tree;

  const svgRef = useRef<SVGSVGElement>(null);
  const groupRef = useRef<SVGGElement>(null);
  const [view, setView] = useState<View>(INITIAL_VIEW);
  const [size, setSize] = useState<Size | null>(null);

  const viewRef = useRef(view);
  const sizeRef = useRef(size);
  const frameRef = useRef(0);
  const fittedRef = useRef(false);

  const nodesById = useMemo(() => new Map(layout.nodes.map((node) => [node.id, node])), [layout]);
  const nodesByIdRef = useRef(nodesById);
  const previousNodesByIdRef = useRef(nodesById);

  useLayoutEffect(() => {
    nodesByIdRef.current = nodesById;
    sizeRef.current = size;
  });

  // Размер холста — из ResizeObserver: без чтения геометрии из DOM и принудительного layout.
  useEffect(() => {
    const svg = svgRef.current!;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setSize((current) =>
        current && current.width === width && current.height === height
          ? current
          : { width, height },
      );
    });
    observer.observe(svg);
    return () => observer.disconnect();
  }, []);

  const commit = (next: View) => {
    cancelAnimationFrame(frameRef.current);
    frameRef.current = 0;
    viewRef.current = next;
    setView(next);
  };

  // Первая подгонка по bounds и компенсация сдвига якоря при смене раскладки.
  // useLayoutEffect: коррекция попадает в тот же кадр, что и новая раскладка.
  useLayoutEffect(() => {
    const previous = previousNodesByIdRef.current;
    previousNodesByIdRef.current = nodesById;

    if (nodesById.size === 0) {
      fittedRef.current = false;
      return;
    }
    if (!size) {
      return;
    }
    if (!fittedRef.current) {
      fittedRef.current = true;
      commit(fitView(layout.bounds, size, minZoom));
      return;
    }
    if (previous === nodesById || anchorId === null) {
      return;
    }
    const before = previous.get(anchorId);
    const after = nodesById.get(anchorId);
    if (before && after && (before.x !== after.x || before.y !== after.y)) {
      const current = viewRef.current;
      commit({
        ...current,
        x: current.x - (after.x - before.x) * current.k,
        y: current.y - (after.y - before.y) * current.k,
      });
    }
  }, [nodesById, size, anchorId, layout.bounds, minZoom]);

  // После подгонки и компенсации якоря: читает уже скорректированный вид.
  const revealedNonceRef = useRef<number | null>(null);
  useLayoutEffect(() => {
    if (!revealRequest || revealRequest.nonce === revealedNonceRef.current || !size) {
      return;
    }
    const node = nodesById.get(revealRequest.id);
    if (!node) {
      return;
    }
    revealedNonceRef.current = revealRequest.nonce;
    const current = viewRef.current;
    const next = revealBox(current, node, size, FIT_PADDING);
    if (next !== current) {
      commit(next);
    }
  }, [revealRequest, nodesById, size]);

  // Жесты: нативные слушатели, чтобы wheel был не пассивным (нужен preventDefault),
  // а pointer-события — пассивными.
  useEffect(() => {
    const svg = svgRef.current!;
    const group = groupRef.current!;

    const scheduleWrite = () => {
      if (frameRef.current !== 0) {
        return;
      }
      frameRef.current = requestAnimationFrame(() => {
        frameRef.current = 0;
        group.setAttribute('transform', formatTransform(viewRef.current));
      });
    };
    const commitCurrent = () => {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = 0;
      setView(viewRef.current);
    };

    let wheelTimer = 0;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const currentSize = sizeRef.current;
      if (!currentSize) {
        return;
      }
      const current = viewRef.current;
      const scale = event.deltaMode === WheelEvent.DOM_DELTA_LINE ? 16 : 1;
      const k = clamp(
        current.k * Math.exp(-event.deltaY * scale * WHEEL_ZOOM_SPEED),
        minZoom,
        maxZoom,
      );
      if (k === current.k) {
        return;
      }
      // Неподвижная точка зума — центр узла под курсором (его мировые координаты известны
      // из раскладки), над пустым местом — центр холста. Координаты курсора относительно
      // холста потребовали бы чтения геометрии из DOM.
      const nodeId = (event.target as Element).closest?.<SVGGElement>('[data-node-id]')?.dataset
        .nodeId;
      const node = nodeId ? nodesByIdRef.current.get(nodeId) : undefined;
      const pivotX = node
        ? (node.x + node.width / 2) * current.k + current.x
        : currentSize.width / 2;
      const pivotY = node
        ? (node.y + node.height / 2) * current.k + current.y
        : currentSize.height / 2;
      const ratio = k / current.k;
      viewRef.current = {
        k,
        x: pivotX - (pivotX - current.x) * ratio,
        y: pivotY - (pivotY - current.y) * ratio,
      };
      scheduleWrite();
      clearTimeout(wheelTimer);
      wheelTimer = window.setTimeout(commitCurrent, WHEEL_COMMIT_DELAY_MS);
    };

    let drag: {
      pointerId: number;
      startX: number;
      startY: number;
      origin: View;
      moved: boolean;
    } | null = null;
    let suppressClick = false;

    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0) {
        return;
      }
      drag = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        origin: viewRef.current,
        moved: false,
      };
    };
    const onPointerMove = (event: PointerEvent) => {
      if (!drag || event.pointerId !== drag.pointerId) {
        return;
      }
      const dx = event.clientX - drag.startX;
      const dy = event.clientY - drag.startY;
      if (!drag.moved) {
        if (Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) {
          return;
        }
        drag.moved = true;
        svg.setPointerCapture(event.pointerId);
        svg.dataset.dragging = 'true';
      }
      viewRef.current = { ...drag.origin, x: drag.origin.x + dx, y: drag.origin.y + dy };
      scheduleWrite();
    };
    const onPointerEnd = (event: PointerEvent) => {
      if (!drag || event.pointerId !== drag.pointerId) {
        return;
      }
      if (drag.moved) {
        // Отпускание после перетаскивания не должно считаться кликом по шеврону.
        suppressClick = true;
        delete svg.dataset.dragging;
        commitCurrent();
      }
      drag = null;
    };
    const onClickCapture = (event: MouseEvent) => {
      if (suppressClick) {
        suppressClick = false;
        event.stopPropagation();
        event.preventDefault();
      }
    };

    svg.addEventListener('wheel', onWheel, { passive: false });
    svg.addEventListener('pointerdown', onPointerDown, { passive: true });
    svg.addEventListener('pointermove', onPointerMove, { passive: true });
    svg.addEventListener('pointerup', onPointerEnd, { passive: true });
    svg.addEventListener('pointercancel', onPointerEnd, { passive: true });
    svg.addEventListener('click', onClickCapture, { capture: true });
    return () => {
      svg.removeEventListener('wheel', onWheel);
      svg.removeEventListener('pointerdown', onPointerDown);
      svg.removeEventListener('pointermove', onPointerMove);
      svg.removeEventListener('pointerup', onPointerEnd);
      svg.removeEventListener('pointercancel', onPointerEnd);
      svg.removeEventListener('click', onClickCapture, { capture: true });
      clearTimeout(wheelTimer);
      cancelAnimationFrame(frameRef.current);
    };
  }, [minZoom, maxZoom]);

  return (
    <Svg ref={svgRef} aria-label={ariaLabel}>
      <g ref={groupRef} transform={formatTransform(view)}>
        <g>
          {layout.edges.map((edge) => {
            const parent = nodesById.get(edge.parentId)!;
            const child = nodesById.get(edge.childId)!;
            return (
              <TreeEdge
                key={edge.id}
                x1={parent.x + parent.width / 2}
                y1={parent.y + parent.height}
                x2={child.x + child.width / 2}
                y2={child.y}
              />
            );
          })}
        </g>
        <g>
          {layout.nodes.map((node) => (
            <g key={node.id} data-node-id={node.id} transform={`translate(${node.x} ${node.y})`}>
              {renderNode(node)}
            </g>
          ))}
        </g>
      </g>
    </Svg>
  );
}
