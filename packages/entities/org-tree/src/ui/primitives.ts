import styled from 'styled-components';

/**
 * Рамка холста: одна и та же высота во всех состояниях, поэтому появление данных,
 * ошибка или ревалидация не сдвигают разметку.
 */
export const Frame = styled.div`
  position: relative;
  height: ${({ theme }) => theme.tree.canvasHeight};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.md};
  background: ${({ theme }) => theme.colors.surface};
  overflow: hidden;
  contain: layout paint;
`;

export const Toolbar = styled.div`
  display: flex;
  gap: ${({ theme }) => theme.space.sm};
  margin-bottom: ${({ theme }) => theme.space.sm};
`;

export const Button = styled.button`
  padding: ${({ theme }) => `${theme.space.xs} ${theme.space.md}`};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.sm};
  background: ${({ theme }) => theme.colors.background};
  color: ${({ theme }) => theme.colors.text};
  font: inherit;
  cursor: pointer;

  &:hover:not(:disabled) {
    border-color: ${({ theme }) => theme.colors.primary};
  }

  &:focus-visible {
    outline: none;
    box-shadow: 0 0 0 2px ${({ theme }) => theme.colors.focus};
  }

  &:disabled {
    cursor: default;
    color: ${({ theme }) => theme.colors.textMuted};
  }
`;

/** Поверх холста и вне потока: появление каждые staleTime не двигает макет. */
export const ValidatingBadge = styled.div`
  position: absolute;
  top: ${({ theme }) => theme.space.sm};
  right: ${({ theme }) => theme.space.sm};
  padding: ${({ theme }) => `${theme.space.xs} ${theme.space.sm}`};
  border-radius: ${({ theme }) => theme.radii.sm};
  background: ${({ theme }) => theme.colors.background};
  color: ${({ theme }) => theme.colors.textMuted};
  font-size: ${({ theme }) => theme.fontSizes.sm};
  pointer-events: none;

  &[data-active='false'] {
    visibility: hidden;
  }
`;

/** Баннер поверх дерева, если ревалидация упала, а прежние данные есть. */
export const ErrorBanner = styled.div`
  position: absolute;
  left: ${({ theme }) => theme.space.sm};
  bottom: ${({ theme }) => theme.space.sm};
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.space.sm};
  padding: ${({ theme }) => `${theme.space.xs} ${theme.space.sm}`};
  border: 1px solid ${({ theme }) => theme.colors.danger};
  border-radius: ${({ theme }) => theme.radii.sm};
  background: ${({ theme }) => theme.colors.background};
  color: ${({ theme }) => theme.colors.danger};
  font-size: ${({ theme }) => theme.fontSizes.sm};
`;
