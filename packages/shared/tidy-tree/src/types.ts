export interface Size {
  width: number;
  height: number;
}

export interface LayoutInput<T> {
  id: string;
  children: readonly LayoutInput<T>[];
  /** Габариты узла задаёт вызывающий: раскладка их не измеряет. */
  size: Size;
  data: T;
}

export interface LayoutNode<T> {
  id: string;
  /** Левый верхний угол узла. */
  x: number;
  y: number;
  width: number;
  height: number;
  /** 0 у корня. */
  depth: number;
  parentId: string | null;
  data: T;
}

export interface LayoutEdge {
  id: string;
  parentId: string;
  childId: string;
}

export interface LayoutResult<T> {
  /** В порядке прямого обхода: родитель раньше детей, дети слева направо. */
  nodes: LayoutNode<T>[];
  edges: LayoutEdge[];
  bounds: Size;
}

export interface LayoutOptions {
  /** vertical — уровни сверху вниз, horizontal — слева направо. */
  orientation: 'vertical' | 'horizontal';
  /** Зазор между соседними детьми одного родителя. */
  siblingGap: number;
  /** Зазор между соседними узлами разных родителей. */
  subtreeGap: number;
  /** Зазор между уровнями. */
  levelGap: number;
}
