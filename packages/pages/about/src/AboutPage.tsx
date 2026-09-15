import type {} from '@shared/theme'; // подключает аугментацию DefaultTheme
import styled from 'styled-components';

const Title = styled.h1`
  margin: 0 0 ${({ theme }) => theme.space.md};
  font-size: ${({ theme }) => theme.fontSizes.xl};
`;

const Text = styled.p`
  max-width: 640px;
  color: ${({ theme }) => theme.colors.textMuted};
`;

/** Заглушка: вторая страница нужна, чтобы уходить с дерева и возвращаться (кеш, отмена запроса). */
export function AboutPage() {
  return (
    <>
      <Title>О проекте</Title>
      <Text>
        Страница без логики. Переход сюда отписывает дерево от данных: незавершённый запрос
        отменяется, а при возврате в пределах 5 секунд новый запрос не отправляется.
      </Text>
    </>
  );
}
