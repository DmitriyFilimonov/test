import styled from 'styled-components';
import { useLiveIndicatorModel } from '../model/useLiveIndicatorModel';
import { useSecondsLeft } from '../model/useSecondsLeft';

const Indicator = styled.div`
  display: inline-flex;
  align-items: center;
  gap: ${({ theme }) => theme.space.sm};
  margin-left: auto;
  color: ${({ theme }) => theme.colors.textMuted};
  white-space: nowrap;
`;

const Dot = styled.span`
  flex: none;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: ${({ theme }) => theme.colors.textMuted};

  &[data-state='open'] {
    background: ${({ theme }) => theme.colors.success};
  }

  &[data-state='reconnecting'] {
    background: ${({ theme }) => theme.colors.warning};
  }

  &[data-state='failed'] {
    background: ${({ theme }) => theme.colors.danger};
  }
`;

/*
 * Все варианты лежат в одной ячейке сетки: размер ячейки задаёт самый крупный из них, видим
 * только текущий. Смена состояния и тиканье отсчёта не сдвигают соседей (нет layout shift).
 * Цифры моноширинные: «9» и «10» в резерве и в тексте одной ширины на разряд.
 */
const Stack = styled.span`
  display: inline-grid;
  align-items: center;
  font-variant-numeric: tabular-nums;

  & > * {
    grid-area: 1 / 1;
  }
`;

const Content = styled.span`
  display: inline-flex;
  align-items: center;
  gap: ${({ theme }) => theme.space.sm};
`;

/* visibility: hidden — место занято, но резерва нет ни на экране, ни в порядке фокуса. */
const Reserve = styled(Content)`
  visibility: hidden;
`;

const ConnectButton = styled.button`
  padding: ${({ theme }) => `2px ${theme.space.sm}`};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.sm};
  background: ${({ theme }) => theme.colors.background};
  color: ${({ theme }) => theme.colors.text};
  font: inherit;
  cursor: pointer;

  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.colors.focus};
    outline-offset: 2px;
  }
`;

const LABELS = {
  connecting: 'Подключение…',
  open: 'Подключено',
  reconnecting: 'Переподключение: попытка',
  failed: 'Нет соединения',
} as const;

/** Секунды до попытки. Отдельный компонент: каждую секунду перерисовывается только он. */
function RetryCountdown({ retryAt }: { retryAt: number }) {
  const seconds = useSecondsLeft(retryAt);
  return <span data-countdown="">через {seconds} с</span>;
}

/** Индикатор соединения с потоком изменений: цвет и текст состояния. */
export function LiveIndicator() {
  const { state, attempt, retryAt, reconnect } = useLiveIndicatorModel();

  let content;
  if (state === 'reconnecting') {
    // Одна строка текста, как в резерве: пробелы, а не gap между элементами.
    content = (
      <span>
        {LABELS.reconnecting} {attempt}
        {retryAt === null ? (
          '…'
        ) : (
          <>
            {' '}
            <RetryCountdown key={retryAt} retryAt={retryAt} />
          </>
        )}
      </span>
    );
  } else if (state === 'failed') {
    content = (
      <>
        {LABELS.failed}
        <ConnectButton type="button" onClick={reconnect}>
          Подключиться
        </ConnectButton>
      </>
    );
  } else {
    content = LABELS[state];
  }

  return (
    <Indicator data-live-state={state}>
      <Dot data-state={state} />
      <Stack>
        {/* Резерв под самые длинные варианты: две цифры на номер попытки и на секунды. */}
        <Reserve aria-hidden="true">{LABELS.reconnecting} 00 через 00 с</Reserve>
        <Reserve aria-hidden="true">
          {LABELS.failed}
          <ConnectButton as="span">Подключиться</ConnectButton>
        </Reserve>
        <Content>{content}</Content>
      </Stack>
    </Indicator>
  );
}
