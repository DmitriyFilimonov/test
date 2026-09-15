import type { OrgNode } from '../schema';

type Seed = [
  id: string,
  name: string,
  parentId: string | null,
  headcount: number,
  budget: number,
  performance: number,
];

const SEEDS: Seed[] = [
  ['d-b', 'Дивизион Б', null, 4, 100, 50],
  ['d-a', 'Дивизион А', null, 2, 50, 90],
  ['p-2', 'Отдел 2', 'd-b', 3, 30, 70],
  ['p-1', 'Отдел 1', 'd-b', 1, 20, 10],
  ['p-3', 'Отдел 3', 'd-a', 5, 40, 60],
  ['t-2', 'Команда 2', 'p-1', 10, 200, 80],
  ['t-1', 'Команда 1', 'p-1', 6, 120, 40],
  ['t-3', 'Команда 3', 'p-3', 0, 10, 100],
];

/** Небольшое дерево: 2 дивизиона → 3 отдела → 3 команды; порядок намеренно не по имени. */
export function makeOrgNodes(): OrgNode[] {
  return SEEDS.map(([id, name, parentId, headcount, budget, performance], index) => ({
    id,
    name,
    parentId,
    headcount,
    budget,
    performance,
    updatedAt: new Date(Date.UTC(2026, 0, 1 + index)).toISOString(),
  }));
}

export function stateWith(data: OrgNode[] | undefined) {
  return {
    orgTree: {
      data,
      error: undefined,
      fetchedAt: data ? 1 : undefined,
      status: data ? ('success' as const) : ('idle' as const),
    },
  };
}
