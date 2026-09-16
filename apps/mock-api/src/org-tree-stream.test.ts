import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp, type AppOptions } from './app';
import type { OrgNode } from './org-tree-data';
import type { OrgTreePatch } from './org-tree-stream';

interface Frame {
  event: string | undefined;
  data: unknown;
  comment: string | undefined;
}

let server: Server | undefined;
let dispose: (() => void) | undefined;
const streams: AbortController[] = [];

async function start(options: AppOptions = {}) {
  const app = createApp(options);
  dispose = app.dispose;
  server = await new Promise<Server>((resolve) => {
    const listening = app.app.listen(0, () => resolve(listening));
  });
  const { port } = server.address() as AddressInfo;
  const base = `http://127.0.0.1:${port}`;
  const post = async (path: string) => {
    const response = await fetch(`${base}${path}`, { method: 'POST' });
    return { status: response.status, body: (await response.json()) as unknown };
  };
  return { post, getNodes: app.getNodes, open: () => openStream(`${base}/api/org-tree/stream`) };
}

afterEach(async () => {
  streams.splice(0).forEach((controller) => controller.abort());
  dispose?.();
  server?.closeAllConnections();
  await new Promise((resolve) => server?.close(resolve));
  server = undefined;
  dispose = undefined;
});

/** Разбор SSE по спецификации в объёме, который шлёт сервер: event, data, комментарии. */
function parseBlock(block: string): Frame {
  const frame: Frame = { event: undefined, data: undefined, comment: undefined };
  for (const line of block.split('\n')) {
    if (line.startsWith(':')) {
      frame.comment = line.slice(1).trim();
    } else if (line.startsWith('event: ')) {
      frame.event = line.slice('event: '.length);
    } else if (line.startsWith('data: ')) {
      frame.data = JSON.parse(line.slice('data: '.length));
    }
  }
  return frame;
}

async function openStream(url: string) {
  const controller = new AbortController();
  streams.push(controller);
  const response = await fetch(url, { signal: controller.signal });
  const reader = response.body!.pipeThrough(new TextDecoderStream()).getReader();
  const frames: Frame[] = [];
  const state = { closed: false };

  void (async () => {
    let buffer = '';
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) {
          break;
        }
        buffer += value;
        let end: number;
        while ((end = buffer.indexOf('\n\n')) !== -1) {
          frames.push(parseBlock(buffer.slice(0, end)));
          buffer = buffer.slice(end + 2);
        }
      }
    } catch {
      // Обрыв сокета: fetch отклоняет чтение, а не завершает поток.
    } finally {
      state.closed = true;
    }
  })();

  return {
    response,
    frames,
    events: (name: string) => frames.filter((frame) => frame.event === name),
    patches: () =>
      frames.filter((frame) => frame.event === 'patch').map((frame) => frame.data as OrgTreePatch),
    isClosed: () => state.closed,
  };
}

const eventually = (assertion: () => void) =>
  vi.waitFor(assertion, { timeout: 2000, interval: 10 });
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('GET /api/org-tree/stream', () => {
  it('заголовки SSE; сразу hello с текущим seq', async () => {
    const { open, post } = await start();

    const first = await open();
    expect(first.response.headers.get('Content-Type')).toBe('text/event-stream; charset=utf-8');
    expect(first.response.headers.get('Cache-Control')).toContain('no-cache');
    expect(first.response.headers.get('Content-Encoding')).toBeNull();
    await eventually(() =>
      expect(first.frames[0]).toEqual({ event: 'hello', data: { seq: 0 }, comment: undefined }),
    );

    await post('/api/dev/stream/emit');
    await post('/api/dev/stream/emit');
    const second = await open();
    await eventually(() => expect(second.frames[0]?.data).toEqual({ seq: 2 }));
  });

  it('heartbeat — комментарий ": ping" без события', async () => {
    const { open } = await start({ heartbeatMs: 30 });
    const stream = await open();

    await eventually(() =>
      expect(
        stream.frames.filter((frame) => frame.comment === 'ping').length,
      ).toBeGreaterThanOrEqual(2),
    );
    const pings = stream.frames.filter((frame) => frame.comment === 'ping');
    expect(pings.every((frame) => frame.event === undefined && frame.data === undefined)).toBe(
      true,
    );
  });

  it('emit рассылает патч всем подписчикам, seq растёт; структура по умолчанию не меняется', async () => {
    const { open, post, getNodes } = await start();
    const a = await open();
    const b = await open();
    const ids = getNodes().map((node) => node.id);

    const first = await post('/api/dev/stream/emit');
    const second = await post('/api/dev/stream/emit');
    expect(first.status).toBe(200);

    for (const stream of [a, b]) {
      await eventually(() => expect(stream.patches().map((patch) => patch.seq)).toEqual([1, 2]));
      expect(stream.patches()).toEqual([first.body, second.body]);
    }

    const patch = first.body as OrgTreePatch;
    expect(patch.removed).toEqual([]);
    expect(patch.added).toEqual([]);
    expect(patch.nodes).toHaveLength(1);
    expect(Object.keys(patch.nodes[0]).toSorted()).toEqual(
      ['headcount', 'id', 'performance', 'updatedAt'].toSorted(),
    );
    const parentIds = new Set(getNodes().map((node) => node.parentId));
    expect(parentIds.has(patch.nodes[0].id)).toBe(false);
    expect(getNodes().map((node) => node.id)).toEqual(ids);
    // Последний патч по узлу совпадает с данными (оба emit могли выбрать один лист).
    const last = (second.body as OrgTreePatch).nodes[0];
    expect(getNodes().find((node) => node.id === last.id)).toMatchObject(last);
  });

  it('emit?mode=add и mode=delete меняют структуру и рассылают added/removed', async () => {
    const { open, post, getNodes } = await start();
    const stream = await open();
    const count = getNodes().length;

    const added = (await post('/api/dev/stream/emit?mode=add')).body as OrgTreePatch;
    expect(added.nodes).toEqual([]);
    expect(added.removed).toEqual([]);
    expect(added.added).toHaveLength(1);
    const node: OrgNode = added.added[0];
    expect(getNodes()).toHaveLength(count + 1);
    expect(getNodes().some((other) => other.id === node.parentId)).toBe(true);

    const deleted = (await post('/api/dev/stream/emit?mode=delete')).body as OrgTreePatch;
    expect(deleted.removed).toHaveLength(1);
    expect(getNodes()).toHaveLength(count);
    expect(getNodes().some((other) => other.id === deleted.removed[0])).toBe(false);

    await eventually(() => expect(stream.patches()).toEqual([added, deleted]));
    expect((await post('/api/dev/stream/emit?mode=bogus')).status).toBe(400);
  });

  it('POST /api/dev/touch тоже рассылает патч', async () => {
    const { open, post } = await start();
    const stream = await open();

    const update = (await post('/api/dev/touch')).body as { after: OrgNode };
    const removal = (await post('/api/dev/touch?mode=delete')).body as { deleted: OrgNode };

    await eventually(() => expect(stream.patches()).toHaveLength(2));
    const [first, second] = stream.patches();
    expect(first).toEqual({
      seq: 1,
      nodes: [
        {
          id: update.after.id,
          headcount: update.after.headcount,
          updatedAt: update.after.updatedAt,
        },
      ],
      removed: [],
      added: [],
    });
    expect(second).toEqual({ seq: 2, nodes: [], removed: [removal.deleted.id], added: [] });
  });

  it('kill закрывает все открытые потоки; новое подключение работает', async () => {
    const { open, post } = await start();
    const a = await open();
    const b = await open();
    const gone = await open();
    await eventually(() => expect(gone.frames).toHaveLength(1));
    streams.at(-1)!.abort();
    await eventually(() => expect(gone.isClosed()).toBe(true));
    // Отключившийся клиент уже снят с рассылки: kill закрывает только открытые.
    await sleep(20);

    expect((await post('/api/dev/stream/kill')).body).toEqual({ closed: 2 });
    await eventually(() => {
      expect(a.isClosed()).toBe(true);
      expect(b.isClosed()).toBe(true);
    });
    expect(a.events('patch')).toEqual([]);

    const next = await open();
    await post('/api/dev/stream/emit');
    await eventually(() => expect(next.patches().map((patch) => patch.seq)).toEqual([1]));
  });

  it('генерация выключена по умолчанию; start включает, stop выключает', async () => {
    const { open, post } = await start({ streamIntervalMs: 20 });
    const stream = await open();

    await sleep(200);
    expect(stream.patches()).toEqual([]);

    expect((await post('/api/dev/stream/start')).body).toEqual({ running: true, intervalMs: 20 });
    await eventually(() => expect(stream.patches().length).toBeGreaterThanOrEqual(3));
    const seqs = stream.patches().map((patch) => patch.seq);
    expect(seqs).toEqual(seqs.map((_, index) => index + 1));
    expect(
      stream.patches().every((patch) => patch.added.length === 0 && patch.removed.length === 0),
    ).toBe(true);

    expect((await post('/api/dev/stream/stop')).body).toEqual({ running: false });
    const stopped = stream.patches().length;
    await sleep(100);
    expect(stream.patches()).toHaveLength(stopped);

    expect((await post('/api/dev/stream/start?intervalMs=abc')).status).toBe(400);
    expect((await post('/api/dev/stream/start?intervalMs=1')).status).toBe(400);
  });
});
