import { createHash } from 'node:crypto';
import type { Request, Response } from 'express';

/** Сильный ETag: хэш от сериализованного тела ответа. */
export function computeEtag(body: string): string {
  return `"${createHash('sha256').update(body).digest('base64url')}"`;
}

/** Слабое сравнение для If-None-Match (RFC 9110, 13.1.2): список тегов, `*`, префикс W/. */
export function matchesIfNoneMatch(header: string | undefined, etag: string): boolean {
  if (!header) {
    return false;
  }
  if (header.trim() === '*') {
    return true;
  }
  const opaque = (tag: string) => tag.trim().replace(/^W\//, '');
  return header.split(',').some((tag) => opaque(tag) === opaque(etag));
}

/** Отправляет JSON с ETag; при совпадении If-None-Match — 304 без тела. */
export function sendJsonWithEtag(req: Request, res: Response, payload: unknown): void {
  const body = JSON.stringify(payload);
  const etag = computeEtag(body);
  res.set('ETag', etag);

  if (matchesIfNoneMatch(req.get('If-None-Match'), etag)) {
    res.status(304).end();
    return;
  }

  res.type('application/json').send(body);
}
