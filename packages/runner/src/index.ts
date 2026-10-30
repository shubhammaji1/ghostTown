import { createInterface } from 'node:readline';
import {
  runPopulation,
  commandSchema,
  redact,
  type RunEvent,
  type Observation,
} from '../../core/src/index.js';
let controller: AbortController | undefined;
let active: Promise<void> | undefined;
let queuedBytes = 0;
const decisions = new Map<string, (decision: unknown) => void>();
let eventSequence = 0;
function send(event: RunEvent): void {
  const line = JSON.stringify(event) + '\n';
  queuedBytes += Buffer.byteLength(line);
  if (queuedBytes > 4 * 1024 * 1024) {
    controller?.abort();
    return;
  }
  process.stdout.write(line, () => {
    queuedBytes -= Buffer.byteLength(line);
  });
}
const input = createInterface({ input: process.stdin, crlfDelay: Infinity });
input.on('line', (line) => {
  try {
    if (line.length > 1024 * 1024) throw new Error('Oversized runner command');
    const cmd = commandSchema.parse(JSON.parse(line));
    if (cmd.type === 'ai.response') {
      decisions.get(cmd.requestId)?.(cmd.decision);
      return;
    }
    if (cmd.type === 'cancel') {
      controller?.abort();
      return;
    }
    if (active) throw new Error('Runner already has an active run');
    controller = new AbortController();
    eventSequence = 0;
    const emit = (event: RunEvent) => send({ ...event, sequence: eventSequence++ });
    active = runPopulation(cmd.config, {
      runId: cmd.runId,
      outputDir: cmd.outputDir,
      signal: controller.signal,
      onEvent: emit,
      agent:
        cmd.config.mode === 'deterministic'
          ? undefined
          : {
              decide: (observation: Observation, signal: AbortSignal) =>
                new Promise((res, rej) => {
                  const cancel = () =>
                    finish(undefined, new Error('AI decision cancelled or timed out'));
                  const timeout = setTimeout(cancel, 15000);
                  const finish = (value?: unknown, error?: Error) => {
                    clearTimeout(timeout);
                    signal.removeEventListener('abort', cancel);
                    decisions.delete(observation.requestId);
                    error ? rej(error) : res(value);
                  };
                  decisions.set(observation.requestId, (value) => finish(value));
                  signal.addEventListener('abort', cancel, { once: true });
                  emit({
                    version: 1,
                    runId: cmd.runId,
                    sequence: 0,
                    timestamp: new Date().toISOString(),
                    type: 'ai.request',
                    payload: { observation },
                  });
                }),
            },
    })
      .then(() => {})
      .catch((error) =>
        send({
          version: 1,
          runId: cmd.runId,
          sequence: 2147483647,
          timestamp: new Date().toISOString(),
          type: 'runner.error',
          payload: { message: redact(error instanceof Error ? error.message : String(error)) },
        }),
      )
      .finally(() => {
        active = undefined;
        controller = undefined;
      });
  } catch {
    process.stderr.write('Invalid or concurrent runner command rejected\n');
  }
});
input.on('close', () => controller?.abort());
process.on('SIGINT', () => controller?.abort());
process.on('SIGTERM', () => controller?.abort());
process.on('disconnect', () => controller?.abort());
