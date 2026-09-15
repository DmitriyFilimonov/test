import styled from 'styled-components';
import { Button } from './primitives';

const Centered = styled.div`
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: ${({ theme }) => theme.space.md};
  height: 100%;
  padding: ${({ theme }) => theme.space.lg};
  text-align: center;
`;

const Message = styled.p`
  max-width: 560px;
  max-height: 40%;
  margin: 0;
  overflow: auto;
  color: ${({ theme }) => theme.colors.textMuted};
  white-space: pre-wrap;
`;

const Title = styled.p`
  margin: 0;
  font-size: ${({ theme }) => theme.fontSizes.lg};
  font-weight: 600;
`;

const SkeletonRow = styled.div`
  display: flex;
  justify-content: center;
  gap: ${({ theme }) => theme.space.lg};
`;

const SkeletonBlock = styled.div`
  width: ${({ theme }) => theme.tree.nodeSize.width * 0.6}px;
  height: ${({ theme }) => theme.tree.nodeSize.height * 0.6}px;
  border-radius: ${({ theme }) => theme.radii.md};
  background: ${({ theme }) => theme.colors.skeleton};
`;

const SkeletonLayout = styled(Centered)`
  gap: ${({ theme }) => theme.tree.levelGap}px;
`;

const TOP_LEVEL = [0, 1, 2, 3];
const SECOND_LEVEL = [0, 1, 2, 3, 4, 5];

export function TreeSkeleton() {
  return (
    <SkeletonLayout aria-busy="true" aria-label="Загрузка оргструктуры">
      <SkeletonRow>
        {TOP_LEVEL.map((i) => (
          <SkeletonBlock key={i} />
        ))}
      </SkeletonRow>
      <SkeletonRow>
        {SECOND_LEVEL.map((i) => (
          <SkeletonBlock key={i} />
        ))}
      </SkeletonRow>
    </SkeletonLayout>
  );
}

export function ErrorState({
  message,
  onRetry,
  retrying,
}: {
  message: string | undefined;
  onRetry: () => void;
  retrying: boolean;
}) {
  return (
    <Centered role="alert">
      <Title>Не удалось загрузить оргструктуру</Title>
      {message && <Message>{message}</Message>}
      <Button type="button" onClick={onRetry} disabled={retrying}>
        {retrying ? 'Загрузка…' : 'Повторить'}
      </Button>
    </Centered>
  );
}

export function EmptyState() {
  return (
    <Centered>
      <Title>В оргструктуре пока нет подразделений</Title>
      <Message>
        Сервер вернул пустой список. Данные запросятся снова при следующем открытии страницы.
      </Message>
    </Centered>
  );
}
