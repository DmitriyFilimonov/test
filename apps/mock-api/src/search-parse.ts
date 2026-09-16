import OpenAI from 'openai';
import { z } from 'zod';

export interface Filter {
  levels?: readonly (1 | 2 | 3)[];
  minHeadcount?: number;
  maxHeadcount?: number;
  minBudget?: number;
  maxBudget?: number;
  minPerformance?: number;
  maxPerformance?: number;
  q?: string;
}

export interface ParseResult {
  mode: 'structured' | 'text';
  filter: Filter;
  explanation: string;
}

export const MAX_QUERY_LENGTH = 200;

/**
 * Ожидание ответа модели. ТЗ задавало 5 с; GLM 4.7 FlashX через прокси Timeweb отвечает за 10–15 с,
 * поэтому 30 с. Не дождались — фраза уходит в текстовый поиск.
 */
export const LLM_TIMEOUT_MS = 30_000;

const filterSchema = z.strictObject({
  levels: z.array(z.union([z.literal(1), z.literal(2), z.literal(3)])).optional(),
  minHeadcount: z.number().int().min(0).optional(),
  maxHeadcount: z.number().int().min(0).optional(),
  minBudget: z.number().int().min(0).optional(),
  maxBudget: z.number().int().min(0).optional(),
  minPerformance: z.number().int().min(0).max(100).optional(),
  maxPerformance: z.number().int().min(0).max(100).optional(),
  q: z.string().optional(),
});

function isFilterEmpty(filter: Filter): boolean {
  return (
    filter.levels == null &&
    filter.minHeadcount == null &&
    filter.maxHeadcount == null &&
    filter.minBudget == null &&
    filter.maxBudget == null &&
    filter.minPerformance == null &&
    filter.maxPerformance == null &&
    filter.q == null
  );
}

function normalize(text: string): string {
  return text.toLowerCase().replace(/\s+/g, ' ').trim();
}

function validateFilter(filter: Filter): Filter | null {
  if (filter.minHeadcount !== undefined && filter.maxHeadcount !== undefined) {
    if (filter.minHeadcount > filter.maxHeadcount) return null;
  }
  if (filter.minBudget !== undefined && filter.maxBudget !== undefined) {
    if (filter.minBudget > filter.maxBudget) return null;
  }
  if (filter.minPerformance !== undefined && filter.maxPerformance !== undefined) {
    if (filter.minPerformance > filter.maxPerformance) return null;
  }
  return filter;
}

const cache = new Map<string, Filter>();

export async function parseQuery(
  text: string,
  apiKey?: string,
  client?: OpenAI,
): Promise<Filter | null> {
  const normalized = normalize(text);

  if (cache.has(normalized)) {
    return cache.get(normalized)!;
  }

  // Нет ключа — нет модели: сразу текстовый поиск.
  if (!apiKey) {
    return null;
  }

  const result = await parseWithLLM(text, apiKey, client);
  // Неудача не кэшируется: сбой сети или таймаут не должны навсегда закрепить фразу за текстом.
  if (result !== null) {
    cache.set(normalized, result);
  }
  return result;
}

async function parseWithLLM(text: string, apiKey: string, client?: OpenAI): Promise<Filter | null> {
  const instruction = `Ты парсишь запросы на русском языке в структурированный фильтр для поиска по оргструктуре компании. Верни только JSON без markdown-ограждения.

Поля фильтра (все необязательные):
- levels: массив из чисел 1, 2, 3 (уровень в оргструктуре: 1 — дивизионы, 2 — отделы, 3 — команды)
- minHeadcount, maxHeadcount: целые числа >= 0 (численность сотрудников)
- minBudget, maxBudget: целые числа >= 0 (бюджет в рублях)
- minPerformance, maxPerformance: целые числа 0-100 (эффективность в процентах)
- q: подстрока для поиска в названии

Примеры:
"команды" -> {"levels": [3]}
"дивизионы" -> {"levels": [1]}
"отделы с бюджетом от 500 тысяч" -> {"levels": [2], "minBudget": 500000}
"подразделения с бюджетом меньше 10 млн" -> {"maxBudget": 10000000}
"бюджет больше 5 миллионов" -> {"minBudget": 5000000}
"эффективность выше 80%" -> {"minPerformance": 80}
"финансовый отдел" -> {"q": "финанс"}
"больше 20 человек" -> {"minHeadcount": 20}

Если запрос не понятен или не содержит фильтров, верни пустой объект {}.`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), LLM_TIMEOUT_MS);
  try {
    const openai = client ?? new OpenAI({ apiKey, baseURL: 'https://api.timeweb.ai/v1' });
    const response = await openai.chat.completions.create(
      {
        model: 'zai/glm-4.7-flashx',
        messages: [
          { role: 'system', content: instruction },
          { role: 'user', content: text },
        ],
        temperature: 0,
      },
      { signal: controller.signal },
    );

    const content = response.choices[0]?.message?.content;
    if (!content) return null;

    const cleaned = content.replace(/```json\n?|\n?```/g, '').trim();
    const parsed = JSON.parse(cleaned);
    const validated = filterSchema.parse(parsed);

    return validateFilter(validated as Filter);
  } catch (error) {
    // Любой сбой — сеть, лимит, таймаут, невалидный ответ — только в лог: поиск работает всегда.
    console.error('LLM parse error:', error);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function buildExplanation(filter: Filter, mode: 'structured' | 'text'): string {
  if (mode === 'text') {
    return filter.q ? `текстовый поиск: «${filter.q}»` : 'текстовый поиск';
  }

  const parts: string[] = [];

  if (filter.levels) {
    const levelNames = { 1: 'дивизионы', 2: 'отделы', 3: 'команды' };
    const names = filter.levels.map((l) => levelNames[l]).join(', ');
    parts.push(names);
  }

  if (filter.minHeadcount !== undefined && filter.maxHeadcount !== undefined) {
    parts.push(`численность ${filter.minHeadcount}–${filter.maxHeadcount}`);
  } else if (filter.minHeadcount !== undefined) {
    parts.push(`численность от ${filter.minHeadcount}`);
  } else if (filter.maxHeadcount !== undefined) {
    parts.push(`численность до ${filter.maxHeadcount}`);
  }

  if (filter.minBudget !== undefined && filter.maxBudget !== undefined) {
    parts.push(`бюджет ${filter.minBudget}–${filter.maxBudget}`);
  } else if (filter.minBudget !== undefined) {
    parts.push(`бюджет от ${filter.minBudget}`);
  } else if (filter.maxBudget !== undefined) {
    parts.push(`бюджет до ${filter.maxBudget}`);
  }

  if (filter.minPerformance !== undefined && filter.maxPerformance !== undefined) {
    parts.push(`эффективность ${filter.minPerformance}–${filter.maxPerformance}%`);
  } else if (filter.minPerformance !== undefined) {
    parts.push(`эффективность от ${filter.minPerformance}%`);
  } else if (filter.maxPerformance !== undefined) {
    parts.push(`эффективность до ${filter.maxPerformance}%`);
  }

  if (filter.q) {
    parts.push(`название содержит «${filter.q}»`);
  }

  return parts.length > 0 ? parts.join(', ') : 'все подразделения';
}

export interface SearchParseHandlerOptions {
  /** Клиент модели для тестов; по умолчанию создаётся по ключу из окружения. */
  client?: OpenAI;
}

export function createSearchParseHandler({ client }: SearchParseHandlerOptions = {}) {
  return async (
    req: { body: { query?: unknown } },
    res: {
      status: (code: number) => { json: (data: unknown) => void };
      json: (data: unknown) => void;
    },
  ) => {
    const { query } = req.body;

    if (typeof query !== 'string' || query.length > MAX_QUERY_LENGTH) {
      res.status(400).json({
        error: `query must be a string up to ${MAX_QUERY_LENGTH} characters`,
      });
      return;
    }

    const filter = await parseQuery(query, process.env.LLM_API_KEY, client);

    if (filter === null || isFilterEmpty(filter)) {
      const textFilter: Filter = { q: query };
      res.json({
        mode: 'text',
        filter: textFilter,
        explanation: buildExplanation(textFilter, 'text'),
      });
      return;
    }

    res.json({
      mode: 'structured',
      filter,
      explanation: buildExplanation(filter, 'structured'),
    });
  };
}
