export class OrgTreeHttpError extends Error {
  override name = 'OrgTreeHttpError';
}

export class OrgTreeNetworkError extends Error {
  override name = 'OrgTreeNetworkError';
}

/**
 * ETag и 304 обрабатывает HTTP-кеш браузера: при `Cache-Control: no-cache` fetch сам
 * отправляет If-None-Match и на 304 отдаёт закешированное тело со статусом 200.
 */
export async function fetchOrgTree(signal: AbortSignal): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch('/api/org-tree', { signal });
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
