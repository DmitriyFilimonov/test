import { combineSlices, configureStore } from '@reduxjs/toolkit';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useState, type ReactNode } from 'react';
import { Provider } from 'react-redux';
import createSagaMiddleware from 'redux-saga';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_ORG_TREE_PARAMS as P, type OrgTreeParams } from './params';
import type { OrgNode } from './schema';
import { orgTreeSaga, orgTreeSlice, orgTreeUpdatesSlice } from './store';
import { makeOrgNodes } from './testing/fixtures';
import { TABLE_QUERY_DEBOUNCE_MS, useTableModel } from './useTableModel';

/**
 * Модель с параметрами-пропсами. Стор без саги: подписки уходят в стор, но запросов нет —
 * единственные таймеры в тесте принадлежат хуку.
 */
function renderModel(initialParams: OrgTreeParams = P) {
  const store = configureStore({ reducer: combineSlices(orgTreeSlice, orgTreeUpdatesSlice) });
  const onParamsChange = vi.fn<(params: OrgTreeParams) => void>();
  const view = renderHook((params: OrgTreeParams) => useTableModel({ params, onParamsChange }), {
    initialProps: initialParams,
    wrapper: ({ children }: { children: ReactNode }) => (
      <Provider store={store}>{children}</Provider>
    ),
  });
  return {
    ...view,
    onParamsChange,
    type: (query: string) => act(() => view.result.current.setDraftQuery(query)),
    wait: (ms: number) => act(() => vi.advanceTimersByTime(ms)),
  };
}

describe('useTableModel: фильтр и сортировка', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('setDraftQuery: до 250 мс onParamsChange не вызван, после — один раз с последним значением', () => {
    const { type, wait, onParamsChange } = renderModel();
    expect(TABLE_QUERY_DEBOUNCE_MS).toBe(250);

    type('О');
    wait(100);
    type('От');
    wait(100);
    type('Отд');
    wait(249);
    expect(onParamsChange).not.toHaveBeenCalled();

    wait(1);
    expect(onParamsChange).toHaveBeenCalledTimes(1);
    expect(onParamsChange).toHaveBeenCalledWith({ ...P, q: 'Отд' });

    wait(1000);
    expect(onParamsChange).toHaveBeenCalledTimes(1);
  });

  it('draftQuery обновляется немедленно при любом состоянии дебаунса', () => {
    const { result, type, wait } = renderModel();

    type('a');
    expect(result.current.draftQuery).toBe('a');
    wait(200);
    type('ab');
    expect(result.current.draftQuery).toBe('ab');
    wait(TABLE_QUERY_DEBOUNCE_MS);
    // Отправлено, родитель ещё не применил: поле всё равно отвечает сразу.
    type('abc');
    expect(result.current.draftQuery).toBe('abc');
    type('');
    expect(result.current.draftQuery).toBe('');
  });

  it('размонтирование во время дебаунса: таймер снят, ни обновления состояния, ни onParamsChange', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { type, wait, unmount, onParamsChange } = renderModel();

    type('abc');
    wait(100);
    expect(vi.getTimerCount()).toBe(1);

    unmount();
    // Таймера нет — отложенному колбэку нечего вызывать: ни setState, ни onParamsChange.
    expect(vi.getTimerCount()).toBe(0);
    wait(1000);
    expect(onParamsChange).not.toHaveBeenCalled();
    expect(consoleError).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it('внешнее изменение params.q синхронизирует draftQuery и снимает отложенную отправку', () => {
    const { result, rerender, type, wait, onParamsChange } = renderModel({ ...P, q: 'Отдел' });
    expect(result.current.draftQuery).toBe('Отдел');

    type('Отдел про');
    wait(100);
    // «Назад»: q вернулся к прежнему значению до конца паузы.
    rerender({ ...P, q: 'Команда' });
    expect(result.current.draftQuery).toBe('Команда');

    wait(1000);
    expect(onParamsChange).not.toHaveBeenCalled();

    rerender({ ...P, q: '' });
    expect(result.current.draftQuery).toBe('');
  });

  it('своё q, применённое родителем с опозданием, не затирает набранное дальше', () => {
    const { result, rerender, type, wait, onParamsChange } = renderModel();

    type('ab');
    wait(TABLE_QUERY_DEBOUNCE_MS);
    expect(onParamsChange).toHaveBeenLastCalledWith({ ...P, q: 'ab' });

    type('abc');
    rerender({ ...P, q: 'ab' });
    expect(result.current.draftQuery).toBe('abc');

    wait(TABLE_QUERY_DEBOUNCE_MS);
    expect(onParamsChange).toHaveBeenCalledTimes(2);
    expect(onParamsChange).toHaveBeenLastCalledWith({ ...P, q: 'abc' });

    // Своё значение вернулось — дальше то же q снаружи снова считается внешним изменением.
    rerender({ ...P, q: 'abc' });
    rerender({ ...P, q: 'ab' });
    expect(result.current.draftQuery).toBe('ab');
  });

  it('toggleSort: та же колонка — обратное направление, другая — эта колонка по возрастанию', () => {
    const { result, rerender, onParamsChange } = renderModel({ q: 'x', sort: 'name', dir: 'asc' });
    expect([result.current.sort, result.current.dir]).toEqual(['name', 'asc']);

    act(() => result.current.toggleSort('name'));
    expect(onParamsChange).toHaveBeenLastCalledWith({ q: 'x', sort: 'name', dir: 'desc' });

    rerender({ q: 'x', sort: 'name', dir: 'desc' });
    expect([result.current.sort, result.current.dir]).toEqual(['name', 'desc']);
    act(() => result.current.toggleSort('name'));
    expect(onParamsChange).toHaveBeenLastCalledWith({ q: 'x', sort: 'name', dir: 'asc' });

    act(() => result.current.toggleSort('totalBudget'));
    expect(onParamsChange).toHaveBeenLastCalledWith({ q: 'x', sort: 'totalBudget', dir: 'asc' });
  });

  it('toggleSort не дебаунсится и не перезапускает паузу ввода', () => {
    const { result, rerender, type, wait, onParamsChange } = renderModel();

    act(() => result.current.toggleSort('totalHeadcount'));
    expect(onParamsChange).toHaveBeenCalledTimes(1);
    expect(onParamsChange).toHaveBeenLastCalledWith({ q: '', sort: 'totalHeadcount', dir: 'asc' });
    expect(vi.getTimerCount()).toBe(0);
    rerender({ q: '', sort: 'totalHeadcount', dir: 'asc' });

    // Ввод, через 100 мс — сортировка: отправка текста — через 250 мс от ввода и с новой сортировкой.
    type('abc');
    wait(100);
    act(() => result.current.toggleSort('totalBudget'));
    expect(onParamsChange).toHaveBeenCalledTimes(2);
    rerender({ q: '', sort: 'totalBudget', dir: 'asc' });
    wait(150);
    expect(onParamsChange).toHaveBeenCalledTimes(3);
    expect(onParamsChange).toHaveBeenLastCalledWith({ q: 'abc', sort: 'totalBudget', dir: 'asc' });
  });

  it('clearQuery: поле и q очищаются сразу, отложенная отправка снимается', () => {
    const { result, rerender, type, wait, onParamsChange } = renderModel({ ...P, q: 'abc' });

    type('abcd');
    act(() => result.current.clearQuery());
    expect(result.current.draftQuery).toBe('');
    expect(onParamsChange).toHaveBeenCalledTimes(1);
    expect(onParamsChange).toHaveBeenCalledWith({ ...P, q: '' });

    rerender({ ...P, q: '' });
    expect(result.current.draftQuery).toBe('');
    wait(1000);
    expect(onParamsChange).toHaveBeenCalledTimes(1);
  });
});

describe('useTableModel: данные', () => {
  interface PendingFetch {
    params: URLSearchParams;
    respond: (nodes: OrgNode[]) => void;
    fail: (status: number) => void;
  }
  let fetches: PendingFetch[];

  beforeEach(() => {
    fetches = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (input: string, init: RequestInit) =>
          new Promise<Response>((resolve, reject) => {
            fetches.push({
              params: new URL(input, 'http://localhost').searchParams,
              respond: (nodes) => resolve(Response.json(nodes)),
              fail: (status) => resolve(new Response(null, { status })),
            });
            init.signal?.addEventListener('abort', () =>
              reject(new DOMException('The operation was aborted.', 'AbortError')),
            );
          }),
      ),
    );
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  /** Родитель хранит параметры в состоянии, как страница; стор — с сагой запроса. */
  function renderWithParent() {
    const sagaMiddleware = createSagaMiddleware();
    const store = configureStore({
      reducer: combineSlices(orgTreeSlice, orgTreeUpdatesSlice),
      middleware: (getDefaultMiddleware) => getDefaultMiddleware().concat(sagaMiddleware),
    });
    sagaMiddleware.run(orgTreeSaga);
    return renderHook(
      () => {
        const [params, setParams] = useState(P);
        return useTableModel({ params, onParamsChange: setParams });
      },
      {
        wrapper: ({ children }: { children: ReactNode }) => (
          <Provider store={store}>{children}</Provider>
        ),
      },
    );
  }

  const ids = (rows: readonly { id: string }[]) => rows.map((row) => row.id);

  it('смена сортировки: до ответа — прежние строки с isPlaceholder, после — новый порядок', async () => {
    const { result } = renderWithParent();
    expect(result.current.isLoading).toBe(true);
    expect(result.current.rows).toEqual([]);

    const nodes = makeOrgNodes();
    act(() => fetches[0]!.respond(nodes));
    await waitFor(() => expect(result.current.rows).toHaveLength(8));
    const previousRows = result.current.rows;
    // Группировка: дети под родителем, соседи по order (здесь order — позиция в массиве).
    expect(ids(previousRows)).toEqual(['d-b', 'p-2', 'p-1', 't-2', 't-1', 'd-a', 'p-3', 't-3']);

    act(() => result.current.toggleSort('name'));
    expect(fetches).toHaveLength(2);
    expect(fetches[1]!.params.get('dir')).toBe('desc');
    expect(result.current.dir).toBe('desc');
    expect(result.current.isPlaceholder).toBe(true);
    expect(result.current.isValidating).toBe(true);
    expect(result.current.isLoading).toBe(false);
    expect(result.current.rows).toBe(previousRows);

    const reversed = nodes.map((node, index) => ({ ...node, order: nodes.length - 1 - index }));
    act(() => fetches[1]!.respond(reversed));
    await waitFor(() => expect(result.current.isPlaceholder).toBe(false));
    expect(ids(result.current.rows)).toEqual([
      'd-a',
      'p-3',
      't-3',
      'd-b',
      'p-1',
      't-1',
      't-2',
      'p-2',
    ]);
  });

  it('ошибка без данных: не загрузка, error есть; повтор — снова загрузка', async () => {
    const { result } = renderWithParent();

    act(() => fetches[0]!.fail(500));
    await waitFor(() => expect(result.current.error).toBeDefined());
    expect(result.current.isLoading).toBe(false);
    expect(result.current.hasData).toBe(false);

    act(() => result.current.retry());
    expect(fetches).toHaveLength(2);
    expect(result.current.isLoading).toBe(true);
    expect(result.current.isValidating).toBe(false);
  });
});
