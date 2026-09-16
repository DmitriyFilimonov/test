import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
  type FocusEvent,
  type KeyboardEvent,
  type RefObject,
} from 'react';
import { useTheme } from 'styled-components';

export interface UseTableKeyboardOptions {
  /** Строки на экране в их порядке; пока строк нет (скелетон, сообщение) — пустой список. */
  rows: readonly { id: string }[];
  /** Enter на строке — то же, что клик. */
  onSelect: (id: string) => void;
  bodyRef: RefObject<HTMLTableSectionElement | null>;
  /** Прокручиваемая область таблицы: её высота задаёт шаг PageUp и PageDown. */
  scrollerRef: RefObject<HTMLElement | null>;
}

export interface TableKeyboard {
  /** Единственная строка в порядке Tab (tabIndex 0); у остальных -1. */
  focusableId: string | null;
  handleKeyDown: (event: KeyboardEvent<HTMLTableSectionElement>) => void;
  handleFocus: (event: FocusEvent<HTMLTableSectionElement>) => void;
  handleBlur: (event: FocusEvent<HTMLTableSectionElement>) => void;
}

interface RovingState {
  /** Порядок строк, для которого посчитан `rowId`. */
  ids: readonly string[];
  rowId: string | null;
  /** Фокус внутри строк: при смене строк он переезжает вместе с `rowId`. */
  hasFocus: boolean;
}

/** Ближайшая к узлу строка прежнего порядка, которая осталась: сначала следующая, затем предыдущая. */
function nearestRemaining(
  previousIds: readonly string[],
  remaining: ReadonlySet<string>,
  id: string,
): string | null {
  const index = previousIds.indexOf(id);
  for (let distance = 1; index !== -1 && distance < previousIds.length; distance++) {
    for (const candidate of [previousIds[index + distance], previousIds[index - distance]]) {
      if (candidate !== undefined && remaining.has(candidate)) {
        return candidate;
      }
    }
  }
  return null;
}

/**
 * Строка в порядке Tab после смены строк: тот же узел, где бы он теперь ни стоял; узел исчез —
 * ближайшая оставшаяся строка; иначе первая.
 */
function followRow(previousIds: readonly string[], ids: readonly string[], id: string | null) {
  const remaining = new Set(ids);
  if (id !== null && remaining.has(id)) {
    return id;
  }
  const nearest = id === null ? null : nearestRemaining(previousIds, remaining, id);
  return nearest ?? ids[0] ?? null;
}

/** Индекс строки после нажатия; null — клавиша не навигационная. */
function targetIndex(key: string, index: number, count: number, page: number): number | null {
  switch (key) {
    case 'ArrowDown':
      return Math.min(index + 1, count - 1);
    case 'ArrowUp':
      return Math.max(index - 1, 0);
    case 'Home':
      return 0;
    case 'End':
      return count - 1;
    case 'PageDown':
      return Math.min(index + page, count - 1);
    case 'PageUp':
      return Math.max(index - page, 0);
    default:
      return null;
  }
}

const rowIdOf = (target: EventTarget) =>
  (target as Element).closest<HTMLElement>('tr[data-id]')?.dataset.id;

const focusRow = (state: RovingState, id: string): RovingState =>
  state.rowId === id && state.hasFocus ? state : { ...state, rowId: id, hasFocus: true };

/**
 * Клавиатура таблицы, roving tabindex: в порядке Tab одна строка, между строками — стрелки,
 * Home/End, PageUp/PageDown; Enter выбирает. Строка в порядке Tab привязана к узлу, а не к
 * позиции: смена сортировки её не меняет. Компонент вешает обработчики на `<tbody>` и отдаёт
 * строке `tabIndex` по `focusableId`.
 */
export function useTableKeyboard({
  rows,
  onSelect,
  bodyRef,
  scrollerRef,
}: UseTableKeyboardOptions): TableKeyboard {
  const { table } = useTheme();
  const ids = useMemo(() => rows.map((row) => row.id), [rows]);
  const [state, setState] = useState<RovingState>(() => ({
    ids,
    rowId: ids[0] ?? null,
    hasFocus: false,
  }));
  let current = state;
  if (state.ids !== ids) {
    current = {
      ids,
      rowId: followRow(state.ids, ids, state.rowId),
      hasFocus: state.hasFocus && ids.length > 0,
    };
    setState(current);
  }
  const { rowId, hasFocus } = current;

  // Шаг страницы — видимые строки без липкого заголовка; высота — из ResizeObserver, без чтения
  // геометрии из DOM.
  const [pageSize, setPageSize] = useState(1);
  useEffect(() => {
    const rowHeight = parseFloat(table.rowHeight);
    const observer = new ResizeObserver(([entry]) => {
      setPageSize(Math.max(1, Math.floor(entry.contentRect.height / rowHeight) - 1));
    });
    observer.observe(scrollerRef.current!);
    return () => observer.disconnect();
  }, [scrollerRef, table.rowHeight]);

  // Фокус внутри таблицы следует за строкой: после стрелки, а также когда строку с фокусом убрал
  // фильтр. Перестановку строк при сортировке React переживает сам: элемент тот же, фокус остаётся.
  useLayoutEffect(() => {
    if (!hasFocus || rowId === null) {
      return;
    }
    for (const row of bodyRef.current?.rows ?? []) {
      if (row.dataset.id === rowId) {
        if (!row.contains(document.activeElement)) {
          row.focus({ preventScroll: true });
        }
        row.scrollIntoView({ block: 'nearest' });
        return;
      }
    }
  }, [bodyRef, hasFocus, rowId]);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLTableSectionElement>) => {
      if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) {
        return;
      }
      const id = rowIdOf(event.target);
      const index = id === undefined ? -1 : ids.indexOf(id);
      if (index === -1) {
        return;
      }
      if (event.key === 'Enter') {
        // Без preventDefault Enter на кнопке названия выбрал бы строку второй раз — кликом.
        event.preventDefault();
        onSelect(ids[index]!);
        return;
      }
      const next = targetIndex(event.key, index, ids.length, pageSize);
      if (next === null) {
        return;
      }
      event.preventDefault();
      setState((state) => focusRow(state, ids[next]!));
    },
    [ids, onSelect, pageSize],
  );

  // Фокус пришёл в строку мышью или клавиатурой — она становится строкой в порядке Tab.
  const handleFocus = useCallback((event: FocusEvent<HTMLTableSectionElement>) => {
    const id = rowIdOf(event.target);
    if (id !== undefined) {
      setState((state) => focusRow(state, id));
    }
  }, []);

  const handleBlur = useCallback((event: FocusEvent<HTMLTableSectionElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
      setState((state) => (state.hasFocus ? { ...state, hasFocus: false } : state));
    }
  }, []);

  return { focusableId: rowId, handleKeyDown, handleFocus, handleBlur };
}
