import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type OpenAI from 'openai';
import {
  LLM_TIMEOUT_MS,
  MAX_QUERY_LENGTH,
  createSearchParseHandler,
  parseQuery,
} from './search-parse';

function createMockClient(response: string | (() => string)): OpenAI {
  return {
    chat: {
      completions: {
        create: vi.fn(async () => ({
          choices: [
            {
              message: {
                content: typeof response === 'function' ? response() : response,
              },
            },
          ],
        })),
      },
    },
  } as unknown as OpenAI;
}

function createTimeoutClient(): OpenAI {
  return {
    chat: {
      completions: {
        create: vi.fn((_params: unknown, options?: { signal?: AbortSignal }) => {
          return new Promise((resolve, reject) => {
            // Модель отвечает валидным фильтром, но позже таймаута: без отмены он бы прошёл.
            const timer = setTimeout(() => {
              resolve({ choices: [{ message: { content: '{"levels": [3]}' } }] });
            }, LLM_TIMEOUT_MS + 1000);

            const onAbort = () => {
              clearTimeout(timer);
              reject(new Error('Aborted'));
            };

            if (options?.signal?.aborted) {
              onAbort();
              return;
            }

            options?.signal?.addEventListener('abort', onAbort);
          });
        }),
      },
    },
  } as unknown as OpenAI;
}

function createErrorClient(): OpenAI {
  return {
    chat: {
      completions: {
        create: vi.fn(async () => {
          throw new Error('Network error');
        }),
      },
    },
  } as unknown as OpenAI;
}

describe('parseQuery — с мок-клиентом модели', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('валидный JSON — structured', async () => {
    const client = createMockClient('{"levels": [1], "minHeadcount": 5}');
    const result = await parseQuery('test valid', 'fake-key', client);
    expect(result).toEqual({ levels: [1], minHeadcount: 5 });
  });

  it('невалидный JSON — null', async () => {
    const client = createMockClient('not json');
    const result = await parseQuery('test invalid', 'fake-key', client);
    expect(result).toBeNull();
  });

  it('markdown-ограждение — structured', async () => {
    const client = createMockClient('```json\n{"levels": [2]}\n```');
    const result = await parseQuery('test markdown', 'fake-key', client);
    expect(result).toEqual({ levels: [2] });
  });

  it('лишнее поле — null (zod strict)', async () => {
    const client = createMockClient('{"levels": [1], "extra": "field"}');
    const result = await parseQuery('test extra', 'fake-key', client);
    expect(result).toBeNull();
  });

  it('строка вместо числа — null', async () => {
    const client = createMockClient('{"minHeadcount": "10"}');
    const result = await parseQuery('test string', 'fake-key', client);
    expect(result).toBeNull();
  });

  it('levels вне 1–3 — null', async () => {
    const client = createMockClient('{"levels": [0, 4]}');
    const result = await parseQuery('test levels', 'fake-key', client);
    expect(result).toBeNull();
  });

  it('min > max — null', async () => {
    const client = createMockClient('{"minHeadcount": 50, "maxHeadcount": 10}');
    const result = await parseQuery('test minmax', 'fake-key', client);
    expect(result).toBeNull();
  });

  it('таймаут — null', async () => {
    vi.useFakeTimers();
    try {
      const client = createTimeoutClient();
      const pending = parseQuery('test timeout', 'fake-key', client);
      await vi.advanceTimersByTimeAsync(LLM_TIMEOUT_MS + 1000);
      expect(await pending).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('исключение — null', async () => {
    const client = createErrorClient();
    const result = await parseQuery('test error', 'fake-key', client);
    expect(result).toBeNull();
  });

  it('неудача не кэшируется: следующий запрос той же фразы снова идёт в модель', async () => {
    expect(await parseQuery('test retry', 'fake-key', createErrorClient())).toBeNull();
    const client = createMockClient('{"levels": [3]}');
    expect(await parseQuery('test retry', 'fake-key', client)).toEqual({ levels: [3] });
  });

  it('в аргументах вызова модели только текст запроса и константная инструкция', async () => {
    const client = createMockClient('{}');
    await parseQuery('первая фраза', 'fake-key', client);
    await parseQuery('вторая фраза', 'fake-key', client);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const calls = (client.chat.completions.create as any).mock.calls;
    expect(calls).toHaveLength(2);
    const [first, second] = calls.map(([params]: [{ messages: unknown[] }]) => params.messages);
    const instruction = first[0].content;
    expect(first).toEqual([
      { role: 'system', content: instruction },
      { role: 'user', content: 'первая фраза' },
    ]);
    expect(second).toEqual([
      { role: 'system', content: instruction },
      { role: 'user', content: 'вторая фраза' },
    ]);
  });

  it('при пустом apiKey клиент модели не вызывается', async () => {
    const client = createMockClient('{}');
    await parseQuery('команды', '', client);
    expect(client.chat.completions.create).not.toHaveBeenCalled();
  });

  it('кэш: одинаковые фразы — один вызов', async () => {
    const client = createMockClient('{"levels": [1]}');
    await parseQuery('cache test', 'fake-key', client);
    await parseQuery('cache test', 'fake-key', client);
    await parseQuery('CACHE TEST', 'fake-key', client);

    expect(client.chat.completions.create).toHaveBeenCalledTimes(1);
  });
});

/** Вызов обработчика с подставленным клиентом модели: статус и тело ответа. */
async function callHandler(query: unknown, client?: OpenAI) {
  const response: { status: number; body: unknown } = { status: 200, body: null };
  const res = {
    status: (code: number) => {
      response.status = code;
      return { json: (data: unknown) => (response.body = data) };
    },
    json: (data: unknown) => (response.body = data),
  };
  await createSearchParseHandler({ client })({ body: { query } }, res);
  return response;
}

describe('createSearchParseHandler', () => {
  beforeEach(() => {
    vi.stubEnv('LLM_API_KEY', 'fake-key');
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('query длиннее 200 — 400', async () => {
    const response = await callHandler('a'.repeat(MAX_QUERY_LENGTH + 1));

    expect(response.status).toBe(400);
    expect((response.body as { error: string }).error).toContain(`${MAX_QUERY_LENGTH}`);
  });

  it('explanation собирается из filter, а не из ответа модели', async () => {
    const client = createMockClient('{"levels": [3], "minHeadcount": 20}');
    const response = await callHandler('handler explanation phrase', client);

    expect(response.body).toEqual({
      mode: 'structured',
      filter: { levels: [3], minHeadcount: 20 },
      explanation: 'команды, численность от 20',
    });
  });

  it('без LLM_API_KEY модель не вызывается, ответ — текстовый поиск по исходной фразе', async () => {
    vi.stubEnv('LLM_API_KEY', '');
    const client = createMockClient('{"levels": [3]}');
    const response = await callHandler('Команды без ключа', client);

    expect(client.chat.completions.create).not.toHaveBeenCalled();
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ mode: 'text', filter: { q: 'Команды без ключа' } });
  });

  it('сбой модели — 200 и текстовый поиск, а не 500', async () => {
    const response = await callHandler('handler failure phrase', createErrorClient());

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ mode: 'text', filter: { q: 'handler failure phrase' } });
    expect(console.error).toHaveBeenCalled();
  });
});
