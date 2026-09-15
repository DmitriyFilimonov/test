/**
 * Мутационная проверка: вносит в код заранее описанные ошибки и проверяет, что тесты
 * их ловят.
 *
 *   npm run test:mutation                         все наборы
 *   npm run test:mutation -- shared-query         выбранные наборы
 *   npm run test:mutation -- --markdown           в конце — таблицы в Markdown
 *
 * Код выхода 0 — все мутации убиты. 1 — есть выжившие, невалидные, зависшие или
 * упавшие с ошибкой, либо базовый прогон тестов не зелёный.
 */
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { stripVTControlCharacters } from 'node:util';
import { suites } from './suites/index.ts';
import type { Mutation, Suite } from './types.ts';
import { killActiveRun, runVitest, type VitestRun } from './vitest.ts';

type MutationStatus = 'killed' | 'survived' | 'invalid' | 'timeout' | 'error';

interface MutationResult {
  mutation: Mutation;
  status: MutationStatus;
  failedTests: string[];
  note?: string;
}

interface SuiteReport {
  suite: Suite;
  baselineOk: boolean;
  results: MutationResult[];
}

const ROOT = path.resolve(import.meta.dirname, '../../..');
const DEFAULT_TIMEOUT_MS = 60_000;
const BACKUP_SUFFIX = '.mutation-backup';

const STATUS_BY_OUTCOME: Record<VitestRun['outcome'], MutationStatus> = {
  failed: 'killed',
  passed: 'survived',
  timeout: 'timeout',
  error: 'error',
};

/** Файл, который сейчас изменён мутацией. Восстанавливается при любом завершении процесса. */
let active: { target: string; original: string; backup: string } | undefined;

function restoreActive(): void {
  if (!active) {
    return;
  }
  writeFileSync(active.target, active.original);
  rmSync(active.backup, { force: true });
  active = undefined;
}

for (const [signal, exitCode] of [
  ['SIGINT', 130],
  ['SIGTERM', 143],
  ['SIGHUP', 129],
] as const) {
  process.on(signal, () => {
    const hadActive = active !== undefined;
    killActiveRun();
    restoreActive();
    console.error(`\nПрервано (${signal}).${hadActive ? ' Изменённый файл восстановлен.' : ''}`);
    process.exit(exitCode);
  });
}
process.on('exit', restoreActive);

function plural(count: number, [one, few, many]: [string, string, string]): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  const word =
    mod10 === 1 && mod100 !== 11
      ? one
      : mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)
        ? few
        : many;
  return `${count} ${word}`;
}

const MUTATIONS: [string, string, string] = ['мутация', 'мутации', 'мутаций'];
const TESTS: [string, string, string] = ['тест', 'теста', 'тестов'];

function seconds(ms: number): string {
  return `${(ms / 1000).toFixed(1)} с`;
}

function printOutputTail(run: VitestRun): void {
  const source = run.fileErrors.length > 0 ? run.fileErrors.join('\n') : run.outputTail;
  const lines = stripVTControlCharacters(source).trim().split('\n').slice(-15);
  console.log(lines.map((line) => `            | ${line}`).join('\n'));
}

async function runMutation(
  target: string,
  original: string,
  mutation: Mutation,
  suite: Suite,
): Promise<MutationResult> {
  const matches = original.split(mutation.from).length - 1;
  if (matches !== 1) {
    return {
      mutation,
      status: 'invalid',
      failedTests: [],
      note: `фрагмент найден ${matches} раз(а), нужно ровно 1`,
    };
  }
  if (mutation.from === mutation.to) {
    return { mutation, status: 'invalid', failedTests: [], note: 'from и to совпадают' };
  }

  // Функция вместо строки замены: иначе `$&`, `$1` в коде мутации были бы спецпоследовательностями.
  writeFileSync(
    target,
    original.replace(mutation.from, () => mutation.to),
  );
  try {
    const run = await runVitest(ROOT, suite.tests, suite.timeoutMs ?? DEFAULT_TIMEOUT_MS);
    const status = STATUS_BY_OUTCOME[run.outcome];
    console.log(
      `  ${status.toUpperCase().padEnd(9)} ${mutation.name}  [${seconds(run.durationMs)}]`,
    );
    if (run.failedTests.length > 0) {
      console.log(`            упали: ${run.failedTests.join(' | ')}`);
    }
    if (status === 'timeout' || status === 'error') {
      printOutputTail(run);
    }
    return { mutation, status, failedTests: run.failedTests };
  } finally {
    writeFileSync(target, original);
  }
}

async function runSuite(suite: Suite): Promise<SuiteReport> {
  const target = path.join(ROOT, suite.file);
  const original = readFileSync(target, 'utf8');
  console.log(`\n▶ ${suite.name} — ${suite.file} (${plural(suite.mutations.length, MUTATIONS)})`);

  const baseline = await runVitest(ROOT, suite.tests, suite.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  if (baseline.outcome !== 'passed') {
    console.log(`  базовый прогон: ${baseline.outcome} — мутации не запускались`);
    if (baseline.failedTests.length > 0) {
      console.log(`            упали: ${baseline.failedTests.join(' | ')}`);
    }
    printOutputTail(baseline);
    return { suite, baselineOk: false, results: [] };
  }
  console.log(
    `  базовый прогон: ${plural(baseline.passedCount, TESTS)}, все зелёные [${seconds(baseline.durationMs)}]`,
  );

  active = { target, original, backup: `${target}${BACKUP_SUFFIX}` };
  // Копия на диске — на случай, если процесс убьют так, что обработчики не сработают.
  writeFileSync(active.backup, original);

  const results: MutationResult[] = [];
  try {
    for (const mutation of suite.mutations) {
      const result = await runMutation(target, original, mutation, suite);
      if (result.status === 'invalid') {
        console.log(`  INVALID   ${mutation.name}: ${result.note}`);
      }
      results.push(result);
    }
  } finally {
    restoreActive();
  }

  if (readFileSync(target, 'utf8') !== original) {
    throw new Error(`${suite.file} не совпадает с исходным после восстановления`);
  }
  return { suite, baselineOk: true, results };
}

function printMarkdown(reports: SuiteReport[]): void {
  const cell = (text: string) => text.replaceAll('|', '\\|');
  for (const { suite, baselineOk, results } of reports) {
    console.log(`\n**${suite.name}** — \`${suite.file}\`\n`);
    if (!baselineOk) {
      console.log('Базовый прогон тестов не зелёный, мутации не запускались.');
      continue;
    }
    console.log('| Мутация | Результат | Какие тесты упали |');
    console.log('| --- | --- | --- |');
    for (const { mutation, status, failedTests, note } of results) {
      const detail = failedTests.length > 0 ? failedTests.join('; ') : (note ?? '—');
      console.log(`| ${cell(mutation.name)} | ${status} | ${cell(detail)} |`);
    }
  }
}

async function main(): Promise<number> {
  const args = process.argv.slice(2);
  const flags = args.filter((arg) => arg.startsWith('--'));
  const names = args.filter((arg) => !arg.startsWith('--'));

  const unknownFlags = flags.filter((flag) => flag !== '--markdown');
  const unknownNames = names.filter((name) => !suites.some((suite) => suite.name === name));
  if (unknownFlags.length > 0 || unknownNames.length > 0) {
    console.error(`Неизвестные аргументы: ${[...unknownFlags, ...unknownNames].join(', ')}`);
    console.error(`Наборы: ${suites.map((suite) => suite.name).join(', ')}; флаги: --markdown`);
    return 1;
  }

  const selected = names.length > 0 ? suites.filter((suite) => names.includes(suite.name)) : suites;

  const leftovers = selected
    .map((suite) => path.join(ROOT, `${suite.file}${BACKUP_SUFFIX}`))
    .filter((backup) => existsSync(backup));
  if (leftovers.length > 0) {
    console.error('Найдены копии от прерванного прогона — файл мог остаться с мутацией:');
    for (const backup of leftovers) {
      console.error(`  ${path.relative(ROOT, backup)}`);
    }
    console.error('Сверьте исходный файл с копией, восстановите его и удалите копию.');
    return 1;
  }

  const reports: SuiteReport[] = [];
  for (const suite of selected) {
    reports.push(await runSuite(suite));
  }

  const all = reports.flatMap((report) => report.results);
  const count = (status: MutationStatus) => all.filter((result) => result.status === status).length;
  const brokenBaselines = reports.filter((report) => !report.baselineOk).length;
  console.log(
    `\nИтого: ${plural(all.length, MUTATIONS)} — killed ${count('killed')}, survived ${count('survived')}, ` +
      `invalid ${count('invalid')}, timeout ${count('timeout')}, error ${count('error')}` +
      (brokenBaselines > 0 ? `; наборов с незелёным базовым прогоном: ${brokenBaselines}` : ''),
  );

  if (args.includes('--markdown')) {
    printMarkdown(reports);
  }

  return brokenBaselines === 0 && count('killed') === all.length ? 0 : 1;
}

process.exitCode = await main();
