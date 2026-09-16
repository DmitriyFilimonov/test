import type { LayoutEdge, LayoutNode, LayoutResult } from '@shared/tidy-tree';
import { useCallback, useState } from 'react';

/** Узел или ребро появляется либо исчезает; null — стоит без анимации. */
export type LayoutMotion = 'enter' | 'exit';

export interface TransitionNode<T> {
  node: LayoutNode<T>;
  /** Где узел стоит: у видимого — позиция в раскладке, у исчезающего — прежнее место у якоря. */
  x: number;
  y: number;
  /** Угол якоря: отсюда узел выезжает при появлении и сюда уезжает при исчезновении. */
  originX: number;
  originY: number;
  motion: LayoutMotion | null;
  /** Ближайший предок на экране, из которого узел появился или в который уходит. */
  anchorId: string | null;
}

export interface TransitionEdge extends LayoutEdge {
  /** Низ родителя и верх ребёнка — по местам узлов в переходе. */
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  motion: LayoutMotion | null;
}

export interface LayoutTransition<T> {
  /** Раскладка, из которой получен переход. */
  layout: LayoutResult<T>;
  /** Узлы раскладки и ещё не исчезнувшие прежние. */
  nodes: readonly TransitionNode<T>[];
  edges: readonly TransitionEdge[];
}

/**
 * Порядок элементов после смены раскладки: новый порядок, исчезающие — на прежних местах
 * среди соседей. Оставшиеся элементы не переставляются в DOM: перемещённый элемент
 * перезапустил бы свою CSS-анимацию.
 */
function mergeOrder(previousIds: readonly string[], nextIds: readonly string[]): string[] {
  const next = new Set(nextIds);
  const leavingBefore = new Map<string, string[]>();
  let leaving: string[] = [];
  for (const id of previousIds) {
    if (!next.has(id)) {
      leaving.push(id);
    } else if (leaving.length > 0) {
      leavingBefore.set(id, leaving);
      leaving = [];
    }
  }
  return [...nextIds.flatMap((id) => [...(leavingBefore.get(id) ?? []), id]), ...leaving];
}

/** Ближайший предок, подходящий под условие. */
function closestAncestor(
  parentId: string | null,
  parentOf: (id: string) => string | null,
  matches: (id: string) => boolean,
): string | null {
  let id = parentId;
  while (id !== null && !matches(id)) {
    id = parentOf(id);
  }
  return id;
}

function connect<T>(
  edges: readonly LayoutEdge[],
  nodes: ReadonlyMap<string, TransitionNode<T>>,
): TransitionEdge[] {
  const result: TransitionEdge[] = [];
  for (const { id, parentId, childId } of edges) {
    const parent = nodes.get(parentId);
    const child = nodes.get(childId);
    if (parent && child) {
      result.push({
        id,
        parentId,
        childId,
        x1: parent.x + parent.node.width / 2,
        y1: parent.y + parent.node.height,
        x2: child.x + child.node.width / 2,
        y2: child.y,
        motion: child.motion,
      });
    }
  }
  return result;
}

/** Раскладка без анимации: первые данные на холсте появляются сразу. */
export function stillLayout<T>(layout: LayoutResult<T>): LayoutTransition<T> {
  const nodes = new Map<string, TransitionNode<T>>(
    layout.nodes.map((node) => [
      node.id,
      {
        node,
        x: node.x,
        y: node.y,
        originX: node.x,
        originY: node.y,
        motion: null,
        anchorId: null,
      },
    ]),
  );
  return { layout, nodes: [...nodes.values()], edges: connect(layout.edges, nodes) };
}

/**
 * Переход к новой раскладке. Раскладка уже посчитана: узлы стоят на новых местах сразу,
 * анимируется только появление и исчезновение.
 *
 * - Новый узел появляется из ближайшего предка, который уже был на экране.
 * - Пропавший узел уходит в ближайшего предка, который остаётся, и держится у него на прежнем
 *   расстоянии, даже если предок сдвинулся.
 * - Узел, вернувшийся до конца исчезновения, — тот же элемент, он снова появляется: анимации
 *   не копятся.
 */
export function transitionLayout<T>(
  previous: LayoutTransition<T>,
  layout: LayoutResult<T>,
): LayoutTransition<T> {
  if (previous.nodes.length === 0 || layout.nodes.length === 0) {
    return stillLayout(layout);
  }
  const before = new Map(previous.nodes.map((item) => [item.node.id, item]));
  const after = new Map(layout.nodes.map((node) => [node.id, node]));
  const items = new Map<string, TransitionNode<T>>();

  for (const node of layout.nodes) {
    const was = before.get(node.id);
    const staying = was !== undefined && was.motion !== 'exit';
    const anchorId = staying
      ? was.anchorId
      : closestAncestor(
          node.parentId,
          (id) => after.get(id)?.parentId ?? null,
          (id) => before.has(id) && before.get(id)!.motion !== 'exit',
        );
    const anchor = anchorId === null ? undefined : after.get(anchorId);
    items.set(node.id, {
      node,
      x: node.x,
      y: node.y,
      originX: anchor?.x ?? node.x,
      originY: anchor?.y ?? node.y,
      motion: staying ? was.motion : 'enter',
      anchorId,
    });
  }

  for (const was of previous.nodes) {
    if (after.has(was.node.id)) {
      continue;
    }
    const anchorId = closestAncestor(
      was.node.parentId,
      (id) => (before.get(id)?.node ?? after.get(id))?.parentId ?? null,
      (id) => after.has(id),
    );
    const anchor = anchorId === null ? undefined : after.get(anchorId);
    if (!anchor) {
      // Предков на экране не осталось: узел гаснет на месте.
      const originX = was.motion === 'exit' ? was.originX : was.x;
      const originY = was.motion === 'exit' ? was.originY : was.y;
      items.set(was.node.id, { ...was, originX, originY, motion: 'exit', anchorId: null });
      continue;
    }
    const anchorBefore = before.get(anchor.id) ?? anchor;
    items.set(was.node.id, {
      node: was.node,
      x: anchor.x + was.x - anchorBefore.x,
      y: anchor.y + was.y - anchorBefore.y,
      originX: anchor.x,
      originY: anchor.y,
      motion: 'exit',
      anchorId,
    });
  }

  const nodeOrder = mergeOrder(
    previous.nodes.map((item) => item.node.id),
    layout.nodes.map((node) => node.id),
  );
  const nextEdgeIds = new Set(layout.edges.map((edge) => edge.id));
  const edgesById = new Map<string, LayoutEdge>(layout.edges.map((edge) => [edge.id, edge]));
  for (const edge of previous.edges) {
    if (!nextEdgeIds.has(edge.id) && items.get(edge.childId)?.motion === 'exit') {
      edgesById.set(edge.id, edge);
    }
  }
  const edgeOrder = mergeOrder(
    previous.edges.map((edge) => edge.id),
    layout.edges.map((edge) => edge.id),
  );

  return {
    layout,
    nodes: nodeOrder.map((id) => items.get(id)!),
    edges: connect(
      edgeOrder.flatMap((id) => edgesById.get(id) ?? []),
      items,
    ),
  };
}

/** Исчезновение узла закончилось: узел и его рёбра уходят из перехода. */
export function completeExit<T>(transition: LayoutTransition<T>, id: string): LayoutTransition<T> {
  if (!transition.nodes.some((item) => item.node.id === id && item.motion === 'exit')) {
    return transition;
  }
  return {
    ...transition,
    nodes: transition.nodes.filter((item) => item.node.id !== id),
    edges: transition.edges.filter((edge) => edge.childId !== id && edge.parentId !== id),
  };
}

/**
 * Модель переходов холста: какие узлы и рёбра рисовать и с какой анимацией. Переход
 * пересчитывается в том же рендере, что и раскладка: исчезающие узлы и компенсация панорамы
 * попадают в один кадр. Анимации — CSS по `data-motion`; исчезнувший узел удаляется по
 * `animationend` своей группы.
 */
export function useLayoutTransition<T>(layout: LayoutResult<T>) {
  const [transition, setTransition] = useState(() => stillLayout(layout));
  let current = transition;
  if (transition.layout !== layout) {
    current = transitionLayout(transition, layout);
    setTransition(current);
  }

  // Всплывающие animationend вложенных элементов (подсветка обновлений в карточке) не подходят:
  // нужна сама группа исчезающего узла.
  const handleAnimationEnd = useCallback((event: AnimationEvent) => {
    const target = event.target;
    if (!(target instanceof SVGElement) || target.dataset.motion !== 'exit') {
      return;
    }
    const id = target.closest<SVGGElement>('[data-exiting-id]')?.dataset.exitingId;
    if (id !== undefined) {
      setTransition((state) => completeExit(state, id));
    }
  }, []);

  return { nodes: current.nodes, edges: current.edges, handleAnimationEnd };
}
