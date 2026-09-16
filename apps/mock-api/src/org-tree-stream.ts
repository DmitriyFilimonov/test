import type { Request, Response } from 'express';
import type { OrgNode } from './org-tree-data';

/** Интервал комментария-heartbeat: прокси и балансировщики рвут простаивающие соединения. */
export const HEARTBEAT_MS = 20_000;

/** Изменённые поля узла. updatedAt меняется при любом изменении. */
export interface OrgNodeChange {
  id: string;
  headcount?: number;
  budget?: number;
  performance?: number;
  updatedAt: string;
}

export interface OrgTreePatch {
  /** Номер патча от старта сервера: клиент по разрыву в нумерации видит пропуск. */
  seq: number;
  nodes: OrgNodeChange[];
  removed: string[];
  added: OrgNode[];
}

export type OrgTreeChange = Omit<OrgTreePatch, 'seq'>;

export interface StreamHubOptions {
  heartbeatMs?: number;
}

const frame = (event: string, data: unknown) =>
  `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;

/**
 * Подписчики потока и счётчик seq. seq растёт на каждое изменение данных, даже когда
 * подписчиков нет: это позиция сервера, а не номер отправленного сообщения.
 */
export function createStreamHub({ heartbeatMs = HEARTBEAT_MS }: StreamHubOptions = {}) {
  let seq = 0;
  const clients = new Set<Response>();

  function connect(req: Request, res: Response): void {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      // no-transform: промежуточный прокси не сжимает поток (сжатие буферизует события).
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      // nginx и совместимые прокси не буферизуют ответ.
      'X-Accel-Buffering': 'no',
    });
    // Каждое событие уходит отдельным пакетом сразу, без алгоритма Нейгла.
    req.socket.setNoDelay(true);
    res.write(frame('hello', { seq }));
    clients.add(res);

    const heartbeat = setInterval(() => res.write(': ping\n\n'), heartbeatMs);
    res.on('close', () => {
      clearInterval(heartbeat);
      clients.delete(res);
    });
  }

  function publish(change: OrgTreeChange): OrgTreePatch {
    seq += 1;
    const patch: OrgTreePatch = { seq, ...change };
    const text = frame('patch', patch);
    for (const res of clients) {
      res.write(text);
    }
    return patch;
  }

  /** Обрыв без прощального события: сокеты закрываются, как при сбое сети. */
  function kill(): number {
    const count = clients.size;
    for (const res of clients) {
      res.socket?.destroy();
    }
    clients.clear();
    return count;
  }

  return { connect, publish, kill, getSeq: () => seq };
}

export type StreamHub = ReturnType<typeof createStreamHub>;
