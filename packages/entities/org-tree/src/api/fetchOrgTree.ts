import type { OrgTreeParams } from '../model/params';

export class OrgTreeHttpError extends Error {
  override name = 'OrgTreeHttpError';
}

export class OrgTreeNetworkError extends Error {
  override name = 'OrgTreeNetworkError';
}

/**
 * ETag и 304 обрабатывает HTTP-кеш браузера: при `Cache-Control: no-cache` fetch сам
 * отправляет If-None-Match и на 304 отдаёт закешированное тело со статусом 200. Кеш
 * браузера ключуется по URL, поэтому ETag у каждого набора параметров свой.
 */
export async function fetchOrgTree(params: OrgTreeParams, signal: AbortSignal): Promise<unknown> {
  const search = new URLSearchParams({ q: params.q, sort: params.sort, dir: params.dir });
  let response: Response;
  try {
    response = await fetch(`/api/org-tree?${search.toString()}`, { signal });
  } catch (error) {
    // AbortError пробрасывается как есть: слой кеширования отличает его от ошибки.
    if (error instanceof TypeError) {
      throw new OrgTreeNetworkError('Нет соединения с сервером', { cause: error });
    }
    throw error;
  }
  if (!response.ok) {
    throw new OrgTreeHttpError(`Сервер ответил ошибкой ${response.status}`);
  }
  return response.json();
}
