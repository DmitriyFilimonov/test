import { memo } from 'react';
import styled from 'styled-components';

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
}

/** Ломаная от низа родителя к верху ребёнка. Кроме координат ничего не знает. */
export const TreeEdge = memo(function TreeEdge({ x1, y1, x2, y2 }: TreeEdgeProps) {
  const middle = (y1 + y2) / 2;
  return <Path d={`M ${x1} ${y1} V ${middle} H ${x2} V ${y2}`} />;
});
