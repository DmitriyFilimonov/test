import styled from 'styled-components';

/** Ячейка в одну строку фиксированной высоты: длинный текст обрезается, строка не растёт. */
export const Cell = styled.td`
  box-sizing: border-box;
  height: ${({ theme }) => theme.table.rowHeight};
  padding: 0 ${({ theme }) => theme.space.sm};
  border-bottom: 1px solid ${({ theme }) => theme.colors.border};
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  vertical-align: middle;
`;
