import { createRandom, type Random } from './prng';

export interface OrgNode {
  id: string;
  name: string;
  parentId: string | null;
  /** Собственный штат узла, не агрегат по потомкам. */
  headcount: number;
  /** Собственный годовой бюджет узла в рублях, не агрегат по потомкам. */
  budget: number;
  /** Целое 0–100. */
  performance: number;
  /** ISO 8601. */
  updatedAt: string;
}

/** Сид зашит: при перезапуске сервера данные и updatedAt не меняются. */
const SEED = 20260915;
/** Точка отсчёта для updatedAt. Не Date.now(), иначе данные зависели бы от времени запуска. */
const UPDATED_AT_ANCHOR = Date.UTC(2026, 7, 31, 18, 0, 0);
const MINUTES_IN_90_DAYS = 90 * 24 * 60;

type Catalog = Record<string, Record<string, string[]>>;

/** Дивизион → отдел → команды. */
const CATALOG: Catalog = {
  'Дивизион коммерческих продуктов': {
    'Отдел клиентской аналитики': [
      'Команда когортного анализа',
      'Команда прогнозирования оттока',
      'Команда BI-отчётности',
    ],
    'Отдел продаж корпоративным клиентам': ['Команда крупных аккаунтов', 'Команда пресейла'],
    'Отдел маркетинга': [
      'Команда performance-маркетинга',
      'Команда контент-маркетинга',
      'Команда бренд-коммуникаций',
    ],
  },
  'Дивизион платформенных технологий': {
    'Отдел инфраструктуры': [
      'Команда облачной платформы',
      'Команда сетевой инфраструктуры',
      'Команда наблюдаемости',
    ],
    'Отдел платформы данных': ['Команда хранилища данных', 'Команда потоковой обработки'],
    'Отдел информационной безопасности': [
      'Команда защиты приложений',
      'Команда мониторинга инцидентов',
    ],
  },
  'Дивизион розничного бизнеса': {
    'Отдел мобильных приложений': [
      'Команда iOS-приложения',
      'Команда Android-приложения',
      'Команда дизайн-системы',
    ],
    'Отдел электронной коммерции': [
      'Команда каталога и поиска',
      'Команда оформления заказа',
      'Команда программы лояльности',
    ],
    'Отдел клиентского сервиса': ['Команда контакт-центра', 'Команда базы знаний'],
  },
  'Дивизион финансов и операций': {
    'Отдел финансового планирования': [
      'Команда бюджетирования',
      'Команда управленческой отчётности',
    ],
    'Отдел закупок': ['Команда стратегических закупок', 'Команда управления поставщиками'],
    'Отдел логистики': [
      'Команда складских операций',
      'Команда транспортного планирования',
      'Команда управления запасами',
    ],
  },
  'Дивизион персонала и корпоративных сервисов': {
    'Отдел подбора персонала': ['Команда IT-рекрутинга', 'Команда массового подбора'],
    'Отдел обучения и развития': [
      'Команда корпоративного университета',
      'Команда оценки компетенций',
    ],
  },
};

/**
 * Команды, которые только сформированы и ещё без сотрудников. В данных нужен узел без людей:
 * его общая эффективность null, и на нём видно, что такие узлы сортируются в конец.
 */
const TEAMS_WITHOUT_STAFF = new Set(['Команда базы знаний']);

type Level = 'division' | 'department' | 'team';

const METRIC_RANGES: Record<Level, { headcount: [number, number]; budgetMln: [number, number] }> = {
  division: { headcount: [3, 8], budgetMln: [20, 60] },
  department: { headcount: [2, 6], budgetMln: [8, 25] },
  team: { headcount: [4, 15], budgetMln: [5, 30] },
};

function createNode(
  random: Random,
  usedIds: Set<string>,
  level: Level,
  name: string,
  parentId: string | null,
): OrgNode {
  let id: string;
  do {
    id = `org-${random.int(0, 0xffffff).toString(16).padStart(6, '0')}`;
  } while (usedIds.has(id));
  usedIds.add(id);

  const range = METRIC_RANGES[level];
  const budgetRub = random.int(range.budgetMln[0] * 100, range.budgetMln[1] * 100) * 10_000;
  const updatedAt = new Date(
    UPDATED_AT_ANCHOR - random.int(0, MINUTES_IN_90_DAYS) * 60_000,
  ).toISOString();
  // Числа берутся из генератора и для команды без сотрудников: иначе сдвинулась бы
  // последовательность, и изменились бы данные всех следующих узлов.
  const headcount = random.int(range.headcount[0], range.headcount[1]);
  const performance = random.int(30, 100);

  return {
    id,
    name,
    parentId,
    headcount: level === 'team' && TEAMS_WITHOUT_STAFF.has(name) ? 0 : headcount,
    budget: budgetRub,
    performance,
    updatedAt,
  };
}

/**
 * Плоский список узлов в детерминированно перемешанном порядке: потомок может идти
 * раньше родителя, клиент не должен полагаться на порядок.
 */
export function generateOrgTree(): OrgNode[] {
  const random = createRandom(SEED);
  const usedIds = new Set<string>();
  const nodes: OrgNode[] = [];

  for (const [divisionName, departments] of Object.entries(CATALOG)) {
    const division = createNode(random, usedIds, 'division', divisionName, null);
    nodes.push(division);
    for (const [departmentName, teams] of Object.entries(departments)) {
      const department = createNode(random, usedIds, 'department', departmentName, division.id);
      nodes.push(department);
      for (const teamName of teams) {
        nodes.push(createNode(random, usedIds, 'team', teamName, department.id));
      }
    }
  }

  for (let i = nodes.length - 1; i > 0; i--) {
    const j = random.int(0, i);
    [nodes[i], nodes[j]] = [nodes[j], nodes[i]];
  }

  return nodes;
}

/** Синтаксически валидный JSON, нарушающий контракт: performance строкой и узел без id. */
export function makeContractViolatingPayload(nodes: readonly OrgNode[]): unknown[] {
  return nodes.map((node, index) => {
    if (index === 0) {
      return { ...node, performance: String(node.performance) };
    }
    if (index === 1) {
      const withoutId: Partial<OrgNode> = { ...node };
      delete withoutId.id;
      return withoutId;
    }
    return node;
  });
}
