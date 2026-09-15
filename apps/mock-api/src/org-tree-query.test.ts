import { describe, expect, it } from 'vitest';
import { generateOrgTree, type OrgNode } from './org-tree-data';
import {
  buildOrgTreeResponse,
  MAX_QUERY_LENGTH,
  parseOrgTreeParams,
  SORT_COLUMNS,
  SORT_DIRECTIONS,
  type OrgTreeParams,
  type OrgTreeResponseNode,
  type SortColumn,
} from './org-tree-query';

const node = (
  id: string,
  name: string,
  parentId: string | null,
  headcount = 1,
  budget = 100,
  performance = 50,
): OrgNode => ({
  id,
  name,
  parentId,
  headcount,
  budget,
  performance,
  updatedAt: '2026-01-01T00:00:00.000Z',
});

const params = (patch: Partial<OrgTreeParams> = {}): OrgTreeParams => ({
  q: '',
  sort: 'name',
  dir: 'asc',
  ...patch,
});

const byOrder = (response: OrgTreeResponseNode[]) => response.toSorted((a, b) => a.order - b.order);

const namesByOrder = (response: OrgTreeResponseNode[]) => byOrder(response).map((n) => n.name);

/** Независимый от сервера расчёт значений сортировки: рекурсия по parentId. */
function expectedSortValues(nodes: readonly OrgNode[]) {
  const children = (id: string) => nodes.filter((n) => n.parentId === id);
  const subtree = (n: OrgNode): OrgNode[] => [n, ...children(n.id).flatMap(subtree)];
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const level = (n: OrgNode): number =>
    n.parentId === null ? 1 : 1 + level(byId.get(n.parentId)!);

  return new Map(
    nodes.map((n) => {
      const all = subtree(n);
      const headcount = all.reduce((sum, m) => sum + m.headcount, 0);
      const weighted = all.reduce((sum, m) => sum + m.performance * m.headcount, 0);
      const values: Record<Exclude<SortColumn, 'name'>, number | null> = {
        level: level(n),
        totalHeadcount: headcount,
        totalBudget: all.reduce((sum, m) => sum + m.budget, 0),
        totalPerformance: headcount > 0 ? weighted / headcount : null,
      };
      return [n.id, values];
    }),
  );
}

describe('buildOrgTreeResponse: состав и matches', () => {
  const nodes = [
    node('d', 'Отдел аналитики', null),
    node('t1', 'Команда отчётов', 'd'),
    node('t2', 'Команда Ёлки', 'd'),
  ];

  it('все узлы возвращаются при любом q, поля узла не меняются', () => {
    for (const q of ['', 'аналит', 'нет такого', 'Ё']) {
      const response = buildOrgTreeResponse(nodes, params({ q }));
      expect(response.map((n) => n.id)).toEqual(['d', 't1', 't2']);
      response.forEach((n, i) => expect(n).toMatchObject(nodes[i]));
    }
  });

  it('пустой q — matches у всех', () => {
    expect(buildOrgTreeResponse(nodes, params()).every((n) => n.matches)).toBe(true);
  });

  it('подстрока в собственном имени, без учёта регистра', () => {
    const matched = (q: string) =>
      buildOrgTreeResponse(nodes, params({ q }))
        .filter((n) => n.matches)
        .map((n) => n.id);
    expect(matched('команда')).toEqual(['t1', 't2']);
    expect(matched('ОТДЕЛ')).toEqual(['d']);
    expect(matched('да отч')).toEqual(['t1']);
  });

  it('«ё»: регистр Ё/ё нормализуется по локали ru, а «е» с «ё» не совпадает', () => {
    const matched = (q: string) =>
      buildOrgTreeResponse(nodes, params({ q }))
        .filter((n) => n.matches)
        .map((n) => n.id);
    expect(matched('ЁЛК')).toEqual(['t2']);
    expect(matched('ОТЧЁТ')).toEqual(['t1']);
    expect(matched('отчет')).toEqual([]);
  });

  it('совпадение предка не делает потомка совпавшим', () => {
    const response = buildOrgTreeResponse(nodes, params({ q: 'аналитики' }));
    expect(response.find((n) => n.id === 'd')!.matches).toBe(true);
    expect(response.find((n) => n.id === 't1')!.matches).toBe(false);
    expect(response.find((n) => n.id === 't2')!.matches).toBe(false);
  });
});

describe('buildOrgTreeResponse: order и сортировка', () => {
  const generated = generateOrgTree();
  const expected = expectedSortValues(generated);

  it('order уникален и покрывает 0..n-1 при каждой сортировке', () => {
    for (const sort of SORT_COLUMNS) {
      for (const dir of SORT_DIRECTIONS) {
        const orders = buildOrgTreeResponse(generated, params({ sort, dir })).map((n) => n.order);
        expect(orders.toSorted((a, b) => a - b)).toEqual(generated.map((_, i) => i));
      }
    }
  });

  it.each(
    SORT_COLUMNS.filter((c) => c !== 'name').flatMap((sort) =>
      SORT_DIRECTIONS.map((dir) => [sort, dir] as const),
    ),
  )('sort=%s dir=%s — order соответствует итогам поддерева', (sort, dir) => {
    const values = byOrder(buildOrgTreeResponse(generated, params({ sort, dir }))).map(
      (n) => expected.get(n.id)![sort as Exclude<SortColumn, 'name'>],
    );
    const present = values.filter((v): v is number => v !== null);
    expect(present).toEqual(present.toSorted((a, b) => (dir === 'asc' ? a - b : b - a)));
    // Пропуски (null) только в хвосте.
    expect(values.slice(present.length).every((v) => v === null)).toBe(true);
  });

  it('в сгенерированных данных есть узел без людей: null-эффективность в конце при обоих dir', () => {
    const nullIds = generated.filter((n) => expected.get(n.id)!.totalPerformance === null);
    expect(nullIds.length).toBeGreaterThan(0);
    for (const dir of SORT_DIRECTIONS) {
      const tail = byOrder(
        buildOrgTreeResponse(generated, params({ sort: 'totalPerformance', dir })),
      )
        .slice(-nullIds.length)
        .map((n) => n.id);
      expect(tail.toSorted()).toEqual(nullIds.map((n) => n.id).toSorted());
    }
  });

  it('итоги, а не собственные значения узла', () => {
    // Родитель с 1 собственным сотрудником и детьми на 10 — выше листа с 5 при desc.
    const nodes = [
      node('p', 'Родитель', null, 1, 10, 90),
      node('c', 'Ребёнок', 'p', 10, 10, 10),
      node('l', 'Лист', null, 5, 50, 50),
    ];
    const desc = (sort: SortColumn) =>
      namesByOrder(buildOrgTreeResponse(nodes, params({ sort, dir: 'desc' })));
    expect(desc('totalHeadcount')).toEqual(['Родитель', 'Ребёнок', 'Лист']);
    expect(desc('totalBudget')).toEqual(['Лист', 'Родитель', 'Ребёнок']);
    // Родитель: (1·90 + 10·10) / 11 ≈ 17.3 — ниже листа с 50, хотя собственный performance 90.
    expect(desc('totalPerformance')).toEqual(['Лист', 'Родитель', 'Ребёнок']);
    expect(desc('level')).toEqual(['Ребёнок', 'Родитель', 'Лист']);
  });

  it('name — сравнение по локали ru: «ё» между «е» и «ж»; desc — обратный порядок', () => {
    const names = ['Яблоко', 'Жёлудь', 'Ежевика', 'Ёлка', 'Акула'];
    const nodes = names.map((name, i) => node(`n${i}`, name, null));
    expect(namesByOrder(buildOrgTreeResponse(nodes, params()))).toEqual([
      'Акула',
      'Ежевика',
      'Ёлка',
      'Жёлудь',
      'Яблоко',
    ]);
    expect(namesByOrder(buildOrgTreeResponse(nodes, params({ dir: 'desc' })))).toEqual([
      'Яблоко',
      'Жёлудь',
      'Ёлка',
      'Ежевика',
      'Акула',
    ]);
  });

  it('null-эффективность в конце при обоих направлениях', () => {
    const nodes = [
      node('empty-1', 'Пустая 1', null, 0, 10, 70),
      node('low', 'Низкая', null, 2, 10, 20),
      node('empty-2', 'Пустая 2', null, 0, 10, 10),
      node('high', 'Высокая', null, 2, 10, 90),
    ];
    const ids = (dir: 'asc' | 'desc') =>
      byOrder(buildOrgTreeResponse(nodes, params({ sort: 'totalPerformance', dir }))).map(
        (n) => n.id,
      );
    expect(ids('asc')).toEqual(['low', 'high', 'empty-1', 'empty-2']);
    expect(ids('desc')).toEqual(['high', 'low', 'empty-1', 'empty-2']);
  });

  it('стабильность: равные узлы сохраняют исходный порядок при asc и desc', () => {
    const nodes = [
      node('c', 'Одинаковое', null, 3),
      node('a', 'Одинаковое', null, 3),
      node('b', 'Другое', null, 7),
      node('d', 'Одинаковое', null, 3),
    ];
    for (const dir of SORT_DIRECTIONS) {
      for (const sort of ['name', 'level', 'totalHeadcount'] as const) {
        const ids = byOrder(buildOrgTreeResponse(nodes, params({ sort, dir })))
          .map((n) => n.id)
          .filter((id) => id !== 'b');
        expect(ids, `${sort} ${dir}`).toEqual(['c', 'a', 'd']);
      }
    }
  });
});

describe('parseOrgTreeParams', () => {
  it('без параметров — умолчания', () => {
    expect(parseOrgTreeParams({})).toEqual({
      ok: true,
      params: { q: '', sort: 'name', dir: 'asc' },
    });
  });

  it('валидные значения', () => {
    expect(parseOrgTreeParams({ q: 'отдел', sort: 'totalBudget', dir: 'desc' })).toEqual({
      ok: true,
      params: { q: 'отдел', sort: 'totalBudget', dir: 'desc' },
    });
  });

  it.each([
    ['sort вне списка', { sort: 'bogus' }, 'sort'],
    ['dir вне списка', { dir: 'up' }, 'dir'],
    ['sort в другом регистре', { sort: 'Name' }, 'sort'],
    ['q дважды', { q: ['a', 'b'] }, 'q'],
    ['q длиннее лимита', { q: 'я'.repeat(MAX_QUERY_LENGTH + 1) }, 'q'],
  ])('%s — ошибка, а не умолчание', (_label, query, param) => {
    const result = parseOrgTreeParams(query);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.issues.map((issue) => issue.param)).toEqual([param]);
  });

  it('несколько ошибок перечисляются вместе', () => {
    const result = parseOrgTreeParams({ sort: 'x', dir: 'y' });
    expect(!result.ok && result.issues).toEqual([
      {
        param: 'sort',
        message:
          'expected one of name, level, totalHeadcount, totalBudget, totalPerformance; received "x"',
      },
      { param: 'dir', message: 'expected one of asc, desc; received "y"' },
    ]);
  });
});
