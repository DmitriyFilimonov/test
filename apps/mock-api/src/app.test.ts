import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { createApp } from './app';
import type { OrgTreeResponseNode } from './org-tree-query';

let server: Server | undefined;

async function start() {
  const { app, getNodes } = createApp();
  server = await new Promise<Server>((resolve) => {
    const listening = app.listen(0, () => resolve(listening));
  });
  const { port } = server.address() as AddressInfo;
  const request = (path: string, init?: RequestInit) =>
    fetch(`http://127.0.0.1:${port}${path}`, init);
  const getTree = async (search = '') => {
    const response = await request(`/api/org-tree${search}`);
    expect(response.status).toBe(200);
    return {
      etag: response.headers.get('ETag'),
      text: await response.text(),
    };
  };
  return { request, getTree, getNodes };
}

afterEach(async () => {
  await new Promise((resolve) => server?.close(resolve));
  server = undefined;
});

const parse = (text: string) => JSON.parse(text) as OrgTreeResponseNode[];

describe('GET /api/org-tree', () => {
  it('без параметров — все узлы, matches у всех, order 0..n-1', async () => {
    const { getTree, getNodes } = await start();
    const nodes = parse((await getTree()).text);

    expect(nodes).toHaveLength(getNodes().length);
    expect(nodes.every((n) => n.matches)).toBe(true);
    expect(nodes.map((n) => n.order).toSorted((a, b) => a - b)).toEqual(nodes.map((_, i) => i));
  });

  it('все узлы при любом q; matches только у совпавших', async () => {
    const { getTree, getNodes } = await start();
    for (const q of ['отдел', 'КОМАНДА', 'нет такого имени']) {
      const nodes = parse((await getTree(`?q=${encodeURIComponent(q)}`)).text);
      expect(nodes.map((n) => n.id)).toEqual(getNodes().map((n) => n.id));
      for (const n of nodes) {
        expect(n.matches).toBe(n.name.toLocaleLowerCase('ru').includes(q.toLocaleLowerCase('ru')));
      }
    }
  });

  it('одинаковые запросы — идентичное тело и ETag; другие параметры — другой ETag', async () => {
    const { getTree } = await start();
    const first = await getTree('?sort=totalBudget&dir=desc');
    const second = await getTree('?sort=totalBudget&dir=desc');
    expect(second.text).toBe(first.text);
    expect(second.etag).toBe(first.etag);

    const etags = new Set(
      await Promise.all(
        ['', '?q=отдел', '?sort=level', '?sort=totalBudget&dir=desc'].map(
          async (search) => (await getTree(search)).etag,
        ),
      ),
    );
    expect(etags.size).toBe(4);
  });

  it('If-None-Match с ETag тех же параметров — 304 без тела; других — 200', async () => {
    const { getTree, request } = await start();
    const { etag } = await getTree('?q=отдел');

    const notModified = await request(`/api/org-tree?q=${encodeURIComponent('отдел')}`, {
      headers: { 'If-None-Match': etag! },
    });
    expect(notModified.status).toBe(304);
    expect(await notModified.text()).toBe('');

    const otherParams = await request('/api/org-tree?q=x', { headers: { 'If-None-Match': etag! } });
    expect(otherParams.status).toBe(200);
  });

  it.each([
    ['?sort=bogus', 'sort'],
    ['?dir=up', 'dir'],
    ['?q=a&q=b', 'q'],
    [`?q=${'a'.repeat(201)}`, 'q'],
  ])('%s — 400 с перечнем проблем', async (search, param) => {
    const { request } = await start();
    const response = await request(`/api/org-tree${search}`);
    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: string; issues: { param: string }[] };
    expect(body.error).toBe('Invalid query parameters');
    expect(body.issues.map((issue) => issue.param)).toEqual([param]);
  });

  it('дев-ручки работают вместе с параметрами', async () => {
    const { request } = await start();

    const empty = await request('/api/org-tree?sort=level&scenario=empty');
    expect(await empty.json()).toEqual([]);

    expect((await request('/api/org-tree?q=x&scenario=error')).status).toBe(500);

    const invalid = (await (await request('/api/org-tree?scenario=invalid')).json()) as Record<
      string,
      unknown
    >[];
    expect(typeof invalid[0].performance).toBe('string');
    expect(invalid[1]).not.toHaveProperty('id');

    const referer = await request('/api/org-tree?sort=name', {
      headers: { Referer: 'http://localhost:5173/?scenario=error' },
    });
    expect(referer.status).toBe(500);

    expect((await request('/api/org-tree?delay=abc')).status).toBe(400);
  });

  it('POST /api/dev/touch?mode=delete — узлов на один меньше, order по-прежнему 0..n-1', async () => {
    const { request, getTree } = await start();
    const before = parse((await getTree('?sort=totalHeadcount')).text);

    expect((await request('/api/dev/touch?mode=delete', { method: 'POST' })).status).toBe(200);

    const after = parse((await getTree('?sort=totalHeadcount')).text);
    expect(after).toHaveLength(before.length - 1);
    expect(after.map((n) => n.order).toSorted((a, b) => a - b)).toEqual(after.map((_, i) => i));
  });

  it('q и sort не меняют updatedAt и состав узлов', async () => {
    const { getTree } = await start();
    const strip = (text: string) =>
      parse(text).map((n) =>
        Object.fromEntries(
          Object.entries(n).filter(([key]) => key !== 'matches' && key !== 'order'),
        ),
      );
    const base = strip((await getTree()).text);
    expect(strip((await getTree('?q=отдел&sort=totalPerformance&dir=desc')).text)).toEqual(base);
  });
});
