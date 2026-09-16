import { NavLink, Outlet } from 'react-router';
import styled, { createGlobalStyle } from 'styled-components';

const GlobalStyle = createGlobalStyle`
  body {
    margin: 0;
    background: ${({ theme }) => theme.colors.background};
    color: ${({ theme }) => theme.colors.text};
    font-family: ${({ theme }) => theme.fonts.body};
    font-size: ${({ theme }) => theme.fontSizes.md};
  }
`;

const Header = styled.header`
  display: flex;
  flex: none;
  gap: ${({ theme }) => theme.space.md};
  padding: ${({ theme }) => `${theme.space.sm} ${theme.space.lg}`};
  border-bottom: 1px solid ${({ theme }) => theme.colors.border};
`;

const Link = styled(NavLink)`
  color: ${({ theme }) => theme.colors.textMuted};
  text-decoration: none;

  /* Без смены font-weight: жирная активная ссылка шире и сдвигает соседние (layout shift). */
  &.active {
    color: ${({ theme }) => theme.colors.text};
    text-decoration: underline;
    text-underline-offset: 4px;
  }
`;

const Main = styled.main`
  flex: 1;
  min-height: 0;
`;

const Root = styled.div`
  display: flex;
  flex-direction: column;
  height: 100vh;
`;

export function AppLayout() {
  return (
    <Root>
      <GlobalStyle />
      <Header>
        <Link to="/" end>
          Оргструктура
        </Link>
        <Link to="/about">О проекте</Link>
      </Header>
      <Main>
        <Outlet />
      </Main>
    </Root>
  );
}
