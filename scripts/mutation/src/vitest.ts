import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';

/** passed — все тесты зелёные; failed — есть упавшие; timeout и error — исход не определён. */
export type RunOutcome = 'passed' | 'failed' | 'timeout' | 'error';

export interface VitestRun {
  outcome: RunOutcome;
  failedTests: string[];
  passedCount: number;
  /** Ошибки уровня файла тестов из отчёта (например, мутант не компилируется). */
  fileErrors: string[];
  durationMs: number;
  /** Хвост stdout/stderr — для диагностики timeout и error. */
  outputTail: string;
}

interface JsonReport {
  numPassedTests: number;
  testResults: { message: string; assertionResults: { title: string; status: string }[] }[];
}

const OUTPUT_TAIL_CHARS = 4000;

const vitestPackageJson = createRequire(import.meta.url).resolve('vitest/package.json');
const { bin } = JSON.parse(readFileSync(vitestPackageJson, 'utf8')) as { bin: { vitest: string } };
const VITEST_BIN = path.join(path.dirname(vitestPackageJson), bin.vitest);

let activeChild: ChildProcess | undefined;

/** Убивает текущий прогон вместе с воркерами vitest: у прогона своя группа процессов. */
export function killActiveRun(): void {
  const pid = activeChild?.pid;
  if (pid !== undefined && activeChild?.exitCode === null) {
    try {
      process.kill(-pid, 'SIGKILL');
    } catch {
      // Группа уже завершилась.
    }
  }
}

export function runVitest(cwd: string, testFilter: string, timeoutMs: number): Promise<VitestRun> {
  const reportDir = mkdtempSync(path.join(tmpdir(), 'mutation-'));
  const reportFile = path.join(reportDir, 'report.json');
  const startedAt = performance.now();

  return new Promise((resolve) => {
    const child = spawn(
      process.execPath,
      [VITEST_BIN, 'run', testFilter, '--reporter=json', `--outputFile=${reportFile}`],
      // detached: отдельная группа процессов, чтобы по таймауту убить и воркеры,
      // а не только главный процесс vitest.
      { cwd, detached: true, stdio: ['ignore', 'pipe', 'pipe'] },
    );
    activeChild = child;

    let output = '';
    const collect = (chunk: Buffer) => {
      output = (output + chunk.toString()).slice(-OUTPUT_TAIL_CHARS);
    };
    child.stdout?.on('data', collect);
    child.stderr?.on('data', collect);

    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      killActiveRun();
    }, timeoutMs);

    child.on('close', (exitCode) => {
      clearTimeout(timer);
      activeChild = undefined;
      const report = readReport(reportFile);
      rmSync(reportDir, { recursive: true, force: true });

      const failedTests =
        report?.testResults.flatMap((file) =>
          file.assertionResults
            .filter((test) => test.status === 'failed')
            .map((test) => test.title),
        ) ?? [];
      // Упавший импорт тестового файла (например, синтаксическая ошибка в мутанте) даёт
      // ненулевой код без упавших тестов — это error, а не killed.
      const outcome: RunOutcome = timedOut
        ? 'timeout'
        : failedTests.length > 0
          ? 'failed'
          : exitCode === 0 && report
            ? 'passed'
            : 'error';

      resolve({
        outcome,
        failedTests,
        passedCount: report?.numPassedTests ?? 0,
        fileErrors: report?.testResults.map((file) => file.message).filter(Boolean) ?? [],
        durationMs: performance.now() - startedAt,
        outputTail: output,
      });
    });
  });
}

function readReport(file: string): JsonReport | undefined {
  try {
    return JSON.parse(readFileSync(file, 'utf8')) as JsonReport;
  } catch {
    return undefined;
  }
}
