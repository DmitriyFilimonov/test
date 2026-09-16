/**
 * Бюджет размера клиента: суммарный gzip всех JS и CSS сборки.
 *
 *   npm run build -w @app/web && npm run check:size
 *
 * Порог и уровень сжатия — в `size.config.json`. Уровень тот же, с которым сборка
 * предсжимается для nginx `gzip_static` (`gzip -9` в Dockerfile клиента): по сети уходит
 * столько же с точностью до долей процента — реализации gzip немного расходятся.
 * Килобайт — 1000 байт, как в отчёте Vite.
 *
 * Код выхода 0 — бюджет соблюдён. 1 — превышен, сборки нет или в ней нет файлов.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { gzipSync } from 'node:zlib';

interface SizeConfig {
  /** Каталог сборки относительно корня репозитория. */
  dist: string;
  extensions: string[];
  gzipLevel: number;
  maxGzipKb: number;
}

const ROOT = path.resolve(import.meta.dirname, '../../..');
const config = JSON.parse(
  readFileSync(path.join(import.meta.dirname, '../size.config.json'), 'utf8'),
) as SizeConfig;

const kb = (bytes: number) => (bytes / 1000).toFixed(2);

const dist = path.join(ROOT, config.dist);
if (!existsSync(dist)) {
  console.error(`Нет сборки ${config.dist}: сначала npm run build -w @app/web`);
  process.exit(1);
}

const files = readdirSync(dist, { recursive: true, encoding: 'utf8' })
  .filter((file) => config.extensions.includes(path.extname(file)))
  .map((file) => {
    const content = readFileSync(path.join(dist, file));
    return {
      file,
      raw: content.length,
      gzip: gzipSync(content, { level: config.gzipLevel }).length,
    };
  })
  .sort((a, b) => b.gzip - a.gzip);

if (files.length === 0) {
  console.error(`В ${config.dist} нет файлов ${config.extensions.join(', ')}`);
  process.exit(1);
}

const width = Math.max(...files.map(({ file }) => file.length));
for (const { file, raw, gzip } of files) {
  console.log(`${file.padEnd(width)}  ${kb(raw).padStart(9)} kB  gzip ${kb(gzip).padStart(8)} kB`);
}

const total = files.reduce((sum, { gzip }) => sum + gzip, 0);
const limit = config.maxGzipKb * 1000;
const verdict = total <= limit ? 'в бюджете' : 'БЮДЖЕТ ПРЕВЫШЕН';
console.log(`\nИтого gzip: ${kb(total)} kB из ${config.maxGzipKb} kB — ${verdict}`);
process.exit(total <= limit ? 0 : 1);
