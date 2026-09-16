import { css, keyframes } from 'styled-components';

/** Фон гаснет от цвета обновления к собственному фону элемента. */
const fade = keyframes`
  from {
    background-color: var(--update-highlight);
  }
`;

/**
 * Подсветка обновлённого значения: статическое правило по data-updated (номер патча), одно на
 * все значения — класса на значение нет. Анимируется только фон, геометрия не меняется.
 *
 * Смена значения атрибута анимацию не перезапускает (имя анимации то же), поэтому элемент
 * с data-updated получает key с номером патча: новый патч — новый элемент, анимация с начала.
 *
 * prefers-reduced-motion: перехода нет — фон обновления стоит то же время и снимается сразу.
 * Подсветка не убирается совсем: это единственный признак обновления.
 */
export const updateHighlight = css`
  &[data-updated] {
    --update-highlight: ${({ theme }) => theme.colors.updated};
    animation: ${fade} ${({ theme }) => theme.motion.updateHighlight} ease-out;
  }

  @media (prefers-reduced-motion: reduce) {
    &[data-updated] {
      animation-timing-function: step-end;
    }
  }
`;
