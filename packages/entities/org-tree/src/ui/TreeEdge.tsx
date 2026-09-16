import { memo } from 'react';
import styled from 'styled-components';
import type { LayoutMotion } from '../model/useLayoutTransition';

const Path = styled.path`
  fill: none;
  stroke: ${({ theme }) => theme.colors.edge};
  stroke-width: 1.5;
`;

export interface TreeEdgeProps {
  /** Низ родителя. */
  x1: number;
  y1: number;
  /** Верх ребёнка. */
  x2: number;
  y2: number;
  /** Появление или исчезновение вместе с дочерним узлом; анимацию задаёт холст. */
  motion?: LayoutMotion | null;
}

/** Ломаная от низа родителя к верху ребёнка. Кроме координат и перехода ничего не знает. */
export const TreeEdge = memo(function TreeEdge({ x1, y1, x2, y2, motion = null }: TreeEdgeProps) {
  const middle = (y1 + y2) / 2;
  return <Path d={`M ${x1} ${y1} V ${middle} H ${x2} V ${y2}`} data-motion={motion ?? undefined} />;
});
