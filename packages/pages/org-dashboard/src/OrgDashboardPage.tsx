import type {} from '@shared/theme'; // подключает аугментацию DefaultTheme
import { OrgTreeView } from '@entities/org-tree';
import styled from 'styled-components';

const Title = styled.h1`
  margin: 0 0 ${({ theme }) => theme.space.md};
  font-size: ${({ theme }) => theme.fontSizes.xl};
`;

export function OrgDashboardPage() {
  return (
    <>
      <Title>Оргструктура</Title>
      <OrgTreeView />
    </>
  );
}
