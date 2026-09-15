import { randomInt } from 'node:crypto';
import express from 'express';
import { sendJsonWithEtag } from './http-cache';
import { generateOrgTree, makeContractViolatingPayload, type OrgNode } from './org-tree-data';
import { buildOrgTreeResponse, parseOrgTreeParams } from './org-tree-query';

const MAX_DELAY_MS = 60_000;
const SCENARIOS = ['empty', 'error', 'invalid'] as const;
type Scenario = (typeof SCENARIOS)[number];

const TOUCH_MODES = ['update', 'delete'] as const;
type TouchMode = (typeof TOUCH_MODES)[number];

export interface AppOptions {
  /** Начальные данные. По умолчанию — детерминированный генератор. */
  nodes?: readonly OrgNode[];
  /** Писать каждый запрос в консоль. */
  log?: boolean;
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

export function createApp({ nodes: initialNodes, log = false }: AppOptions = {}) {
  /** Состояние в памяти. Перезапуск возвращает данные к сиду; меняет их только POST /api/dev/touch. */
  let nodes: readonly OrgNode[] = initialNodes ?? generateOrgTree();

  const app = express();
  app.disable('x-powered-by');
  // Встроенный ETag Express отключён: ETag и 304 обрабатываются явно в sendJsonWithEtag.
  app.set('etag', false);

  if (log) {
    app.use((req, res, next) => {
      const startedAt = performance.now();
      res.on('finish', () => {
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
   * контракта (для него есть scenario=invalid).
   */
  app.post('/api/dev/touch', (req, res) => {
    const { mode = 'update' } = req.query;
    if (!TOUCH_MODES.includes(mode as TouchMode)) {
      res.status(400).json({ error: `Unknown mode. Expected one of: ${TOUCH_MODES.join(', ')}` });
      return;
    }

    if (mode === 'delete') {
      const parentIds = new Set(nodes.map((node) => node.parentId));
      const leafIndexes = nodes.flatMap((node, index) => (parentIds.has(node.id) ? [] : [index]));
      if (leafIndexes.length === 0) {
        res.status(409).json({ error: 'No nodes left to delete' });
        return;
      }
      const index = leafIndexes[randomInt(leafIndexes.length)];
      const deleted = nodes[index];
      nodes = nodes.toSpliced(index, 1);
      res.json({ mode, deleted });
      return;
    }

    const index = randomInt(nodes.length);
    const before = nodes[index];
    const delta = randomInt(1, 4);
    const headcount =
      before.headcount - delta >= 1 && randomInt(2) === 0
        ? before.headcount - delta
        : before.headcount + delta;
    const after: OrgNode = { ...before, headcount, updatedAt: new Date().toISOString() };

    nodes = nodes.with(index, after);
    res.json({ mode, before, after });
  });

  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'Not found' });
  });

  return { app, getNodes: () => nodes };
}
