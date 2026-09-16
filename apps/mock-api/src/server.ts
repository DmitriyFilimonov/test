import dotenv from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

// Один .env на репозиторий — корневой, его же читает docker compose. В контейнере файла нет
// (.dockerignore): переменные приходят из compose, dotenv их не перезаписывает.
dotenv.config({ path: resolve(dirname(fileURLToPath(import.meta.url)), '../../../.env') });

import { createApp } from './app';

const PORT = Number(process.env.PORT ?? 3001);

/** Интервал генерации после POST /api/dev/stream/start без intervalMs. Пусто — умолчание app. */
const streamIntervalMs = process.env.STREAM_INTERVAL_MS
  ? Number(process.env.STREAM_INTERVAL_MS)
  : undefined;
if (
  streamIntervalMs !== undefined &&
  !(Number.isInteger(streamIntervalMs) && streamIntervalMs > 0)
) {
  throw new Error(`STREAM_INTERVAL_MS must be a positive integer (ms): ${streamIntervalMs}`);
}

const { app, getNodes } = createApp({ log: true, streamIntervalMs });

app.listen(PORT, (error) => {
  if (error) {
    throw error;
  }
  console.log(`mock-api: http://localhost:${PORT}/api/org-tree (${getNodes().length} nodes)`);
});
