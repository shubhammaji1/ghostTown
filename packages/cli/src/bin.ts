#!/usr/bin/env node
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { resolve, join, dirname } from 'node:path';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { parseArgs } from 'node:util';
import {
  runPopulation,
  configSchema,
  starterConfig,
  presets,
  checkBrowser,
  reportSchema,
  markdownReport,
  redact,
} from '../../core/src/index.js';

async function main(): Promise<void> {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      config: { type: 'string', short: 'c' },
      output: { type: 'string', short: 'o' },
      scenario: { type: 'string' },
      mode: { type: 'string' },
      json: { type: 'boolean' },
      format: { type: 'string' },
      target: { type: 'string' },
      help: { type: 'boolean', short: 'h' },
      version: { type: 'boolean', short: 'v' },
    },
  });
  if (values.version) {
    console.log('0.1.0');
    return;
  }
  const command = positionals[0] ?? 'help';
  if (values.help || command === 'help') {
    console.log(
      'GhostTown 0.1.0\n\ninit [--target URL]\ndoctor [--json]\npersonas list\nscenarios list [-c FILE]\nrun [-c FILE] [-o DIR] [--scenario ID] [--json]\nreport FILE [--format json|markdown]\nbrowsers install\n\nDefaults: ghosttown.config.json; .ghosttown/runs\nExit codes: 0 pass, 1 test failure/environment, 2 invalid input, 130 cancelled.',
    );
    return;
  }
  const path = resolve(values.config ?? 'ghosttown.config.json');
  if (command === 'init') {
    const config = starterConfig(values.target);
    await writeFile(path, JSON.stringify(config, null, 2) + '\n', { flag: 'wx' });
    console.log(`Created ${path}`);
    return;
  }
  if (command === 'doctor') {
    const browser = await checkBrowser();
    console.log(
      values.json
        ? JSON.stringify({ node: process.version, browser })
        : `${process.version}\n${browser.message}`,
    );
    process.exitCode = browser.ready ? 0 : 1;
    return;
  }
  if (command === 'browsers' && positionals[1] === 'install') {
    const require = createRequire(__filename);
    const cli = join(dirname(require.resolve('playwright/package.json')), 'cli.js');
    process.exitCode = await new Promise<number>((res, rej) => {
      const child = spawn(process.execPath, [cli, 'install', 'chromium'], {
        stdio: 'inherit',
        shell: false,
      });
      child.on('error', rej);
      child.on('exit', (code) => res(code ?? 1));
    });
    return;
  }
  if (command === 'personas' && positionals[1] === 'list') {
    console.log(JSON.stringify(presets, null, 2));
    return;
  }
  if (command === 'report') {
    if (!positionals[1]) throw new Error('Provide a report.json path');
    const report = reportSchema.parse(JSON.parse(await readFile(resolve(positionals[1]), 'utf8')));
    if (values.format && !['json', 'markdown'].includes(values.format))
      throw new Error('Format must be json or markdown');
    console.log(
      values.format === 'markdown' ? markdownReport(report) : JSON.stringify(report, null, 2),
    );
    return;
  }
  if (command !== 'run' && !(command === 'scenarios' && positionals[1] === 'list'))
    throw new Error('Unknown command; use --help');
  const config = configSchema.parse(JSON.parse(await readFile(path, 'utf8')));
  if (command === 'scenarios') {
    console.log(JSON.stringify(config.scenarios, null, 2));
    return;
  }
  if (values.mode && values.mode !== 'deterministic')
    throw new Error('Only deterministic mode is available in this release');
  if (values.mode === 'deterministic') config.mode = 'deterministic';
  if (values.scenario) {
    config.scenarios = config.scenarios.filter((s) => s.id === values.scenario);
    if (!config.scenarios.length) throw new Error('Unknown scenario ID');
  }
  const controller = new AbortController();
  const stop = () => controller.abort();
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
  try {
    const output = resolve(values.output ?? '.ghosttown/runs');
    await mkdir(output, { recursive: true });
    const report = await runPopulation(config, {
      outputDir: output,
      signal: controller.signal,
      onEvent: (event) => {
        if (!values.json && event.payload.message)
          process.stderr.write(event.payload.message + '\n');
      },
    });
    console.log(
      values.json
        ? JSON.stringify(report)
        : `${report.status.toUpperCase()}: ${report.summary.passed} passed, ${report.summary.failed} failed, ${report.summary.errors} errors\n${join(output, report.runId, 'report.json')}`,
    );
    process.exitCode = report.status === 'cancelled' ? 130 : report.status === 'passed' ? 0 : 1;
  } finally {
    process.removeListener('SIGINT', stop);
    process.removeListener('SIGTERM', stop);
  }
}
main().catch((error) => {
  process.stderr.write(redact(error instanceof Error ? error.message : String(error)) + '\n');
  process.exitCode = 2;
});
