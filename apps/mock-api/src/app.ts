import express from 'express';
import { sendJsonWithEtag } from './http-cache';
import {
  addLeaf,
  deleteRandomLeaf,
  touchRandomNode,
  updateRandomLeaf,
  type ChangeResult,
} from './org-tree-changes';
import { generateOrgTree, makeContractViolatingPayload, type OrgNode } from './org-tree-data';
import { buildOrgTreeResponse, parseOrgTreeParams } from './org-tree-query';
import { createStreamHub } from './org-tree-stream';

const MAX_DELAY_MS = 60_000;
const SCENARIOS = ['empty', 'error', 'invalid'] as const;
type Scenario = (typeof SCENARIOS)[number];

const TOUCH_MODES = ['update', 'delete'] as const;
type TouchMode = (typeof TOUCH_MODES)[number];

const EMIT_MODES = ['update', 'add', 'delete'] as const;
type EmitMode = (typeof EMIT_MODES)[number];

const DEFAULT_STREAM_INTERVAL_MS = 5000;
const MIN_STREAM_INTERVAL_MS = 10;
const MAX_STREAM_INTERVAL_MS = 3_600_000;

export interface AppOptions {
  /** Начальные данные. По умолчанию — детерминированный генератор. */
  nodes?: readonly OrgNode[];
  /** Писать каждый запрос в консоль. */
  log?: boolean;
  /** Интервал heartbeat потока, мс. По умолчанию 20 с. */
  heartbeatMs?: number;
  /** Интервал генерации, если POST /api/dev/stream/start пришёл без intervalMs. По умолчанию 5 с. */
  streamIntervalMs?: number;
}

/**
 * Дев-ручки берутся из query запроса, а если там их нет — из query страницы, с которой
 * пришёл запрос (заголовок Referer). Так состояния UI проверяются адресом страницы
 * (`http://localhost:5173/?scenario=error`), а клиент про ручки ничего не знает.
 */
function devParams(req: express.Request): { scenario: unknown; delay: unknown } {
  const { scenario, delay } = req.query;
  if (scenario !== undefined || delay !== undefined) {
    return { scenario, delay };
  }
  const referer = req.get('Referer');
  if (!referer) {
    return { scenario: undefined, delay: undefined };
  }
  try {
    const params = new URL(referer).searchParams;
    return {
      scenario: params.get('scenario') ?? undefined,
      delay: params.get('delay') ?? undefined,
    };
  } catch {
    return { scenario: undefined, delay: undefined };
  }
}

export function createApp({
  nodes: initialNodes,
  log = false,
  heartbeatMs,
  streamIntervalMs = DEFAULT_STREAM_INTERVAL_MS,
}: AppOptions = {}) {
  /**
   * Состояние в памяти. Перезапуск возвращает данные к сиду; меняют их только дев-ручки
   * (touch, stream/emit и генерация после stream/start).
   */
  let nodes: readonly OrgNode[] = initialNodes ?? generateOrgTree();
  const hub = createStreamHub({ heartbeatMs });
  /** Генерация изменений. Выключена по умолчанию: данные детерминированы, пока её не включат. */
  let generator: NodeJS.Timeout | undefined;

  /** Применяет изменение к данным и рассылает патч подписчикам. */
  const commit = (result: NonNullable<ChangeResult>) => {
    nodes = result.nodes;
    return hub.publish(result.change);
  };

  const stopGenerator = () => {
    clearInterval(generator);
    generator = undefined;
  };

  const app = express();
  app.disable('x-powered-by');
  // Встроенный ETag Express отключён: ETag и 304 обрабатываются явно в sendJsonWithEtag.
  app.set('etag', false);

  if (log) {
    app.use((req, res, next) => {
      const startedAt = performance.now();
      // close, а не finish: поток событий не завершается штатно, его закрывает клиент или kill.
      res.on('close', () => {
        const ms = Math.round(performance.now() - startedAt);
        console.log(`${req.method} ${req.originalUrl} -> ${res.statusCode} (${ms} ms)`);
      });
      next();
    });
  }

  /**
   * GET /api/org-tree?q=&sort=&dir= — всегда все узлы, независимо от q: клиенту нужна
   * полная структура. q и sort влияют только на matches и order; ETag считается от тела,
   * поэтому зависит от параметров.
   */
  app.get('/api/org-tree', async (req, res) => {
    const parsed = parseOrgTreeParams(req.query);
    if (!parsed.ok) {
      res.status(400).json({ error: 'Invalid query parameters', issues: parsed.issues });
      return;
    }

    const { scenario, delay } = devParams(req);
    if (scenario !== undefined && !SCENARIOS.includes(scenario as Scenario)) {
      res.status(400).json({ error: `Unknown scenario. Expected one of: ${SCENARIOS.join(', ')}` });
      return;
    }
    if (
      delay !== undefined &&
      (typeof delay !== 'string' || !/^\d+$/.test(delay) || Number(delay) > MAX_DELAY_MS)
    ) {
      res.status(400).json({ error: `delay must be an integer from 0 to ${MAX_DELAY_MS} (ms)` });
      return;
    }

    if (delay !== undefined) {
      await new Promise((resolve) => setTimeout(resolve, Number(delay)));
    }

    res.set('Cache-Control', 'no-cache');

    switch (scenario as Scenario | undefined) {
      case 'error':
        res.status(500).json({ error: 'Mock server error (scenario=error)' });
        return;
      case 'empty':
        sendJsonWithEtag(req, res, []);
        return;
      case 'invalid':
        sendJsonWithEtag(
          req,
          res,
          makeContractViolatingPayload(buildOrgTreeResponse(nodes, parsed.params)),
        );
        return;
      default:
        sendJsonWithEtag(req, res, buildOrgTreeResponse(nodes, parsed.params));
    }
  });

  /**
   * mode=update (по умолчанию) — меняет headcount и updatedAt ровно одного случайного узла.
   * mode=delete — удаляет один случайный лист, остальные узлы не трогает. Удаляется только
   * лист: иначе у детей остался бы parentId на несуществующий узел, а это уже нарушение
   * контракта (для него есть scenario=invalid). Изменение рассылается патчем подписчикам потока.
   */
  app.post('/api/dev/touch', (req, res) => {
    const { mode = 'update' } = req.query;
    if (!TOUCH_MODES.includes(mode as TouchMode)) {
      res.status(400).json({ error: `Unknown mode. Expected one of: ${TOUCH_MODES.join(', ')}` });
      return;
    }

    const previous = nodes;
    const result = mode === 'delete' ? deleteRandomLeaf(nodes) : touchRandomNode(nodes);
    if (!result) {
      res.status(409).json({ error: 'No nodes left to change' });
      return;
    }
    commit(result);

    if (mode === 'delete') {
      const deleted = previous.find((node) => node.id === result.change.removed[0]);
      res.json({ mode, deleted });
      return;
    }
    const id = result.change.nodes[0].id;
    res.json({
      mode,
      before: previous.find((node) => node.id === id),
      after: nodes.find((node) => node.id === id),
    });
  });

  /**
   * GET /api/org-tree/stream — Server-Sent Events. Сразу `hello` с текущим seq, затем
   * `patch` на каждое изменение данных и комментарий-heartbeat раз в 20 с.
   */
  app.get('/api/org-tree/stream', (req, res) => {
    hub.connect(req, res);
  });

  /** Один патч немедленно. mode=update (по умолчанию) — структура дерева та же. */
  app.post('/api/dev/stream/emit', (req, res) => {
    const { mode = 'update' } = req.query;
    if (!EMIT_MODES.includes(mode as EmitMode)) {
      res.status(400).json({ error: `Unknown mode. Expected one of: ${EMIT_MODES.join(', ')}` });
      return;
    }
    const change = { update: updateRandomLeaf, add: addLeaf, delete: deleteRandomLeaf }[
      mode as EmitMode
    ];
    const result = change(nodes);
    if (!result) {
      res.status(409).json({ error: 'No nodes left to change' });
      return;
    }
    res.json(commit(result));
  });

  /**
   * Генерация: headcount и performance случайного листа раз в intervalMs (по умолчанию 5 с).
   * Повторный start меняет интервал.
   */
  app.post('/api/dev/stream/start', (req, res) => {
    const { intervalMs } = req.query;
    if (
      intervalMs !== undefined &&
      (typeof intervalMs !== 'string' ||
        !/^\d+$/.test(intervalMs) ||
        Number(intervalMs) < MIN_STREAM_INTERVAL_MS ||
        Number(intervalMs) > MAX_STREAM_INTERVAL_MS)
    ) {
      res.status(400).json({
        error: `intervalMs must be an integer from ${MIN_STREAM_INTERVAL_MS} to ${MAX_STREAM_INTERVAL_MS}`,
      });
      return;
    }
    const interval = intervalMs === undefined ? streamIntervalMs : Number(intervalMs);
    stopGenerator();
    generator = setInterval(() => {
      const result = updateRandomLeaf(nodes);
      if (result) {
        commit(result);
      }
    }, interval);
    res.json({ running: true, intervalMs: interval });
  });

  app.post('/api/dev/stream/stop', (_req, res) => {
    stopGenerator();
    res.json({ running: false });
  });

  /** Закрывает все открытые потоки без прощального события: клиент видит обрыв. */
  app.post('/api/dev/stream/kill', (_req, res) => {
    res.json({ closed: hub.kill() });
  });

  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'Not found' });
  });

  return {
    app,
    getNodes: () => nodes,
    /** Останавливает генерацию и закрывает потоки: иначе server.close() ждал бы их вечно. */
    dispose: () => {
      stopGenerator();
      hub.kill();
    },
  };
}
