import { chromium, type BrowserContext, type Page } from 'playwright';
import { randomUUID } from 'node:crypto';
import { access, writeFile, rename, stat, rm } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import {
  configSchema,
  type Config,
  type Persona,
  type Scenario,
  type Action,
  type Report,
  type SessionResult,
  type RunEvent,
} from '../../shared/src/index.js';
import { allowedURL, localURL, privateDirectory, redact, safePath } from './policy.js';
import { decideAction, type DecisionAdapter } from './agent.js';
export * from './agent.js';
export * from '../../shared/src/index.js';
export * from './policy.js';

export interface FixtureResponse {
  status?: number;
  body: string;
  contentType?: string;
  headers?: Record<string, string>;
}
export interface RunOptions {
  outputDir: string;
  signal?: AbortSignal;
  runId?: string;
  onEvent?: (event: RunEvent) => void;
  /** Explicit SDK-only response fixtures for offline browser tests. Reports label this transport. Missing routes fail closed. */
  mockResponses?: Record<string, FixtureResponse>;
  agent?: DecisionAdapter;
}
export async function checkBrowser(): Promise<{
  ready: boolean;
  executable: string;
  message: string;
}> {
  const executable = chromium.executablePath();
  try {
    await access(executable);
    const browser = await chromium.launch({ headless: true, timeout: 10000 });
    await browser.close();
    return {
      ready: true,
      executable,
      message: 'Compatible headless Chromium launched and closed successfully',
    };
  } catch {
    return {
      ready: false,
      executable,
      message: 'Chromium is missing. Run ghosttown browsers install on this extension host.',
    };
  }
}

async function perform(
  page: Page,
  action: Action,
  persona: Persona,
  target: string,
): Promise<void> {
  const locator = 'selector' in action ? page.locator(action.selector) : undefined;
  const timeout = persona.actionTimeoutMs;
  switch (action.type) {
    case 'navigate':
      await page.goto(new URL(action.path, target).href, { waitUntil: 'domcontentloaded' });
      break;
    case 'click':
      if (persona.keyboardOnly) {
        let reached = false;
        for (let i = 0; i < 60; i++) {
          if (await locator!.evaluate((el) => el === document.activeElement)) {
            reached = true;
            break;
          }
          await page.keyboard.press('Tab');
        }
        if (!reached)
          throw new Error('Control could not be reached within 60 keyboard Tab presses');
        await page.keyboard.press('Enter');
      } else await locator!.click();
      break;
    case 'fill':
      if (persona.keyboardOnly) {
        let reached = false;
        for (let i = 0; i < 60; i++) {
          if (await locator!.evaluate((el) => el === document.activeElement)) {
            reached = true;
            break;
          }
          await page.keyboard.press('Tab');
        }
        if (!reached) throw new Error('Input could not be reached by keyboard');
        await page.keyboard.press('ControlOrMeta+A');
        await page.keyboard.insertText(action.value);
      } else await locator!.fill(action.value);
      break;
    case 'select':
      if (persona.keyboardOnly)
        throw new Error('Keyboard-only select is unsupported; use explicit key actions');
      else await locator!.selectOption(action.value);
      break;
    case 'check':
      if (persona.keyboardOnly)
        throw new Error('Keyboard-only check is unsupported; use explicit key actions');
      else await locator!.setChecked(action.checked);
      break;
    case 'press':
      await page.keyboard.press(action.key);
      break;
    case 'scroll':
      await page.mouse.wheel(0, action.deltaY);
      break;
    case 'wait':
    case 'assertVisible':
      await locator!.waitFor({ state: 'visible', timeout });
      break;
    case 'assertText': {
      const end = Date.now() + timeout;
      do {
        const matches = await locator!.textContent({ timeout });
        if (matches?.includes(action.text)) return;
        await delay(50);
      } while (Date.now() < end);
      throw new Error('Expected text was not observed at the specified locator');
    }
    case 'assertURL': {
      const expected = new URL(action.path, target).href;
      await page.waitForURL(expected, { timeout });
      break;
    }
    case 'screenshot':
    case 'finish':
      break;
  }
}

export async function runPopulation(input: unknown, options: RunOptions): Promise<Report> {
  const config: Config = configSchema.parse(input);
  if (config.mode !== 'deterministic' && !options.agent)
    throw new Error('AI mode requires an explicitly configured decision adapter');
  const target = localURL(config.target);
  const origins = new Set([target.origin, ...config.allowedOrigins.map((o) => localURL(o).origin)]);
  for (const s of config.scenarios)
    for (const path of [
      s.startPath,
      ...s.steps.flatMap((a) => (a.type === 'navigate' ? [a.path] : [])),
    ])
      if (!allowedURL(new URL(path, target).href, origins))
        throw new Error('Scenario navigation violates the allowed-origin policy');
  const runId = options.runId ?? randomUUID();
  if (!/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(runId))
    throw new Error('Invalid run ID');
  const base = await privateDirectory(options.outputDir);
  const output = await privateDirectory(join(base, runId));
  safePath(base, relative(base, output));
  await writeFile(join(output, '.ghosttown-run'), '1', { flag: 'wx', mode: 0o600 });
  const startedAt = new Date().toISOString();
  let sequence = 0;
  const emit = (type: RunEvent['type'], payload: RunEvent['payload'] = {}) => {
    try {
      options.onEvent?.({
        version: 1,
        runId,
        sequence: sequence++,
        timestamp: new Date().toISOString(),
        type,
        payload,
      });
    } catch {
      /* Consumer errors cannot prevent cleanup. */
    }
  };
  const controller = new AbortController();
  const contexts = new Map<BrowserContext, () => Promise<void>>();
  const cancel = () => {
    controller.abort();
    for (const close of contexts.values()) void close();
  };
  options.signal?.addEventListener('abort', cancel, { once: true });
  if (options.signal?.aborted) cancel();
  const deadline = setTimeout(cancel, config.maxRunDurationMs);
  const sessions: SessionResult[] = [];
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
  emit('run.started');
  try {
    if (!controller.signal.aborted)
      browser = await chromium.launch({
        headless: true,
        timeout: 15000,
        args: ['--disable-background-networking', '--disable-quic'],
      });
    const queue = config.scenarios.flatMap((scenario) =>
      config.personas.map((persona) => ({ scenario, persona })),
    );
    const execute = async (scenario: Scenario, persona: Persona): Promise<SessionResult> => {
      const id = `${scenario.id}--${persona.id}`,
        start = Date.now();
      const result: SessionResult = {
        id,
        persona: persona.id,
        scenario: scenario.id,
        status: 'passed',
        durationMs: 0,
        issues: [],
        timeline: [],
      };
      if (controller.signal.aborted) return { ...result, status: 'cancelled' };
      emit('session.started', { message: id });
      let context: BrowserContext | undefined,
        page: Page | undefined,
        timeout: ReturnType<typeof setTimeout> | undefined;
      let closing: Promise<void> | undefined;
      const closeContext = () => {
        if (!context) return Promise.resolve();
        return (closing ??= context.close().catch(() => {}));
      };
      const sessionAbort = new AbortController();
      const abortSession = () => sessionAbort.abort();
      controller.signal.addEventListener('abort', abortSession, { once: true });
      let timedOut = false,
        step = -1;
      const issue = (
        title: string,
        category: SessionResult['issues'][number]['category'],
        details: string,
      ) => {
        if (result.issues.length < 50)
          result.issues.push({ id: randomUUID(), title, category, details: redact(details), step });
      };
      try {
        context = await browser!.newContext({
          viewport: persona.viewport,
          locale: persona.locale,
          isMobile: persona.mobile,
          hasTouch: persona.mobile,
          reducedMotion: persona.reducedMotion ? 'reduce' : 'no-preference',
          serviceWorkers: 'block',
          acceptDownloads: false,
        });
        contexts.set(context, closeContext);
        if (controller.signal.aborted) {
          await closeContext();
          return { ...result, status: 'cancelled' };
        }
        const active = context;
        timeout = setTimeout(() => {
          timedOut = true;
          sessionAbort.abort();
          void closeContext();
        }, scenario.maxDurationMs);
        context.setDefaultTimeout(persona.actionTimeoutMs);
        context.setDefaultNavigationTimeout(persona.actionTimeoutMs);
        // Context routing includes redirects and subresources. No extra origins are inferred from page content.
        await context.route('**/*', async (route) => {
          const url = route.request().url();
          if (!allowedURL(url, origins)) {
            issue(
              'Blocked request outside approved origins',
              'Observed Failure',
              'Request was blocked by the origin policy',
            );
            await route.abort().catch(() => {});
            return;
          }
          try {
            if (persona.networkLatencyMs) await delay(persona.networkLatencyMs);
            if (options.mockResponses) {
              const fixture = options.mockResponses[url];
              if (!fixture) {
                issue(
                  'Missing response fixture',
                  'Environment Problem',
                  'No response fixture is defined for this request',
                );
                await route.abort();
                return;
              }
              const location = fixture.headers?.location;
              if (location && !allowedURL(new URL(location, url).href, origins)) {
                issue(
                  'Blocked redirect outside approved origins',
                  'Observed Failure',
                  'Fixture redirects to an unapproved origin',
                );
                await route.abort();
                return;
              }
              await route.fulfill({
                status: fixture.status ?? 200,
                body: fixture.body,
                contentType: fixture.contentType ?? 'text/html',
                headers: fixture.headers,
              });
              return;
            }
            const response = await route.fetch({
              maxRedirects: 0,
              timeout: persona.actionTimeoutMs,
            });
            const location = response.headers()['location'];
            if (location && !allowedURL(new URL(location, url).href, origins)) {
              issue(
                'Blocked redirect outside approved origins',
                'Observed Failure',
                'Server redirected to an unapproved origin',
              );
              await route.abort();
              return;
            }
            await route.fulfill({ response });
          } catch (error) {
            if (!controller.signal.aborted && !timedOut)
              issue(
                'Request transport failed',
                'Environment Problem',
                redact(error instanceof Error ? error.message : String(error)),
              );
            await route.abort().catch(() => {});
          }
        });
        if (config.capture.traces)
          await context.tracing.start({ screenshots: true, snapshots: true, sources: false });
        page = await context.newPage();
        context.on('page', (p) => {
          if (p !== page) void p.close().catch(() => {});
        });
        page.on('dialog', (d) => void d.dismiss().catch(() => {}));
        page.on('pageerror', () =>
          issue(
            'Application JavaScript exception',
            'Observed Failure',
            'A browser pageerror event occurred. Enable local traces for detailed investigation.',
          ),
        );
        page.on('response', (r) => {
          if (r.status() >= 400)
            issue(
              `HTTP ${r.status()} response`,
              'Observed Failure',
              `${new URL(r.url()).pathname} returned ${r.status()}`,
            );
        });
        const response = await page.goto(new URL(scenario.startPath, target).href, {
          waitUntil: 'domcontentloaded',
        });
        if (!response || response.status() >= 400)
          throw new Error('Start page did not return a successful HTTP response');
        const assertions = scenario.steps.filter((a) => a.type.startsWith('assert'));
        const setup = scenario.steps.filter(
          (a) => !a.type.startsWith('assert') && a.type !== 'finish',
        );
        const steps: Action[] =
          config.mode === 'deterministic'
            ? scenario.steps
            : config.mode === 'hybrid'
              ? [...setup]
              : [];
        if (config.mode !== 'deterministic') {
          for (const action of steps) {
            await perform(page, action, persona, target.href);
            result.timeline.push({
              step: ++step,
              action: action.type,
              status: 'passed',
              elapsedMs: 0,
            });
          }
          steps.length = 0;
          for (let decision = 0; decision < config.ai.maxDecisions; decision++) {
            if (controller.signal.aborted || timedOut) throw new Error('Session stopped');
            const action = await decideAction(
              page,
              options.agent!,
              scenario.goal,
              persona,
              config.ai.maxDecisions - decision,
              sessionAbort.signal,
              scenario.explorationSelectors,
            );
            if (action.type === 'finish') break;
            const at = Date.now();
            await perform(page, action, persona, target.href);
            result.timeline.push({
              step: ++step,
              action: `ai.${action.type}`,
              status: 'passed',
              elapsedMs: Date.now() - at,
            });
            emit('action.completed', { message: `${id}: ai.${action.type}` });
          }
          steps.push(...assertions);
        }
        for (const action of steps) {
          step++;
          if (controller.signal.aborted || timedOut) throw new Error('Session stopped');
          const actionStart = Date.now();
          try {
            await perform(page, action, persona, target.href);
            if (action.type === 'screenshot' && config.capture.screenshots) {
              const name = `${id}.png`;
              await page.screenshot({
                path: join(output, name),
                timeout: 3000,
                mask: [page.locator('input,textarea,[contenteditable="true"]')],
              });
              result.screenshot = name;
            }
            result.timeline.push({
              step,
              action: action.type,
              status: 'passed',
              elapsedMs: Date.now() - actionStart,
            });
            emit('action.completed', { message: `${id}: ${action.type}` });
          } catch (error) {
            result.timeline.push({
              step,
              action: action.type,
              status: 'failed',
              elapsedMs: Date.now() - actionStart,
            });
            if (controller.signal.aborted || timedOut) throw error;
            issue(
              `Step ${step + 1}: ${action.type} failed`,
              action.type.startsWith('assert') ? 'Verified Defect' : 'Observed Failure',
              action.type.startsWith('assert')
                ? 'The scenario-defined expected outcome was not observed.'
                : `The ${action.type} action did not complete within its budget.`,
            );
            result.status = 'failed';
            break;
          }
          if (persona.delayMs)
            await delay(persona.delayMs, undefined, { signal: controller.signal });
          if (action.type === 'finish') break;
        }
        if (!controller.signal.aborted && !timedOut && persona.mobile) {
          const overflow = await page.evaluate(
            () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
          );
          if (overflow)
            issue(
              'Horizontal overflow at mobile viewport',
              'Potential UX Concern',
              'Document width exceeds the configured mobile viewport',
            );
        }
        if (
          config.capture.screenshots &&
          !controller.signal.aborted &&
          !timedOut &&
          result.issues.length
        ) {
          const name = `${id}.png`;
          await page
            .screenshot({
              path: join(output, name),
              timeout: 3000,
              mask: [page.locator('input,textarea,[contenteditable="true"]')],
            })
            .then(() => {
              result.screenshot = name;
            })
            .catch(() => {});
        }
        if (result.issues.some((i) => i.category === 'Observed Failure')) result.status = 'failed';
      } catch (error) {
        if (controller.signal.aborted) result.status = 'cancelled';
        else {
          result.status = timedOut ? 'failed' : 'error';
          issue(
            timedOut ? 'Scenario time budget exceeded' : 'Browser execution error',
            timedOut ? 'Observed Failure' : 'Environment Problem',
            timedOut
              ? 'Session closed at its configured deadline.'
              : redact(error instanceof Error ? error.message : String(error)),
          );
        }
      } finally {
        if (timeout) clearTimeout(timeout);
        controller.signal.removeEventListener('abort', abortSession);
        sessionAbort.abort();
        if (context) {
          if (config.capture.traces && !closing) {
            const name = `${id}.zip`;
            await context.tracing
              .stop({ path: join(output, name) })
              .then(() => {
                result.trace = name;
              })
              .catch(() => {});
          }
          await closeContext();
          contexts.delete(context);
        }
        for (const key of ['screenshot', 'trace'] as const)
          if (result[key]) {
            const path = join(output, result[key]!);
            if ((await stat(path)).size > 20 * 1024 * 1024) {
              await rm(path);
              delete result[key];
            }
          }
        result.durationMs = Date.now() - start;
      }
      emit('session.completed', { session: result });
      return result;
    };
    const worker = async () => {
      while (queue.length) {
        const pair = queue.shift();
        if (pair) sessions.push(await execute(pair.scenario, pair.persona));
      }
    };
    await Promise.all(Array.from({ length: config.concurrency }, worker));
  } catch (error) {
    if (!controller.signal.aborted) {
      sessions.push({
        id: 'environment',
        persona: 'none',
        scenario: 'none',
        status: 'error',
        durationMs: 0,
        timeline: [],
        issues: [
          {
            id: randomUUID(),
            title: 'Browser could not start',
            category: 'Environment Problem',
            details: redact(error instanceof Error ? error.message : String(error)),
            step: -1,
          },
        ],
      });
    }
  } finally {
    clearTimeout(deadline);
    options.signal?.removeEventListener('abort', cancel);
    await browser?.close().catch(() => {});
  }
  const count = (status: SessionResult['status']) =>
    sessions.filter((s) => s.status === status).length;
  const report: Report = {
    version: 1,
    runId,
    target: target.origin,
    transport: options.mockResponses ? 'fixtures' : 'live',
    mode: config.mode,
    startedAt,
    endedAt: new Date().toISOString(),
    status: controller.signal.aborted
      ? 'cancelled'
      : count('error')
        ? 'error'
        : count('failed')
          ? 'failed'
          : 'passed',
    sessions,
    summary: {
      passed: count('passed'),
      failed: count('failed'),
      cancelled: count('cancelled'),
      errors: count('error'),
      issues: sessions.reduce((n, s) => n + s.issues.length, 0),
    },
  };
  await writeFile(join(output, 'report.json.tmp'), JSON.stringify(report, null, 2), {
    mode: 0o600,
  });
  await rename(join(output, 'report.json.tmp'), join(output, 'report.json'));
  emit('run.completed', { report });
  return report;
}

export function markdownReport(report: Report): string {
  const clean = (s: string) => s.replace(/[\r\n|`<>]/g, ' ');
  return (
    `# GhostTown ${report.status}\n\nRun: ${report.runId}\nTarget: ${clean(report.target)}\nTransport: ${report.transport}\n\n| Scenario | Persona | Status | Issues |\n|---|---|---|---|\n` +
    report.sessions
      .map(
        (s) => `| ${clean(s.scenario)} | ${clean(s.persona)} | ${s.status} | ${s.issues.length} |`,
      )
      .join('\n') +
    '\n\n' +
    report.sessions
      .flatMap((s) =>
        s.issues.map((i) => `- **${clean(i.category)}** — ${clean(i.title)}: ${clean(i.details)}`),
      )
      .join('\n') +
    '\n'
  );
}
