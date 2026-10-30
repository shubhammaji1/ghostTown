import { describe, it, expect } from 'vitest';
import {
  configSchema,
  scenarioSchema,
  actionSchema,
  starterConfig,
  presets,
  eventSchema,
  localURL,
  allowedURL,
  safePath,
  redact,
} from '../../packages/core/src/index.js';
import { studioMessageSchema, decisionSchema } from '../../packages/shared/src/index.js';
describe('strict declarative contracts', () => {
  it('applies nested configuration defaults and preserves explicitly selected options', () => {
    const base = starterConfig();
    const { ai, capture, ...input } = base;
    const defaults = configSchema.parse(input);
    expect(defaults.ai).toEqual({ maxDecisions: 5 });
    expect(defaults.capture).toEqual({ screenshots: true, traces: false });
    const partial = configSchema.parse({ ...input, capture: { traces: true }, ai: {} });
    expect(partial.capture).toEqual({ screenshots: true, traces: true });
    expect(partial.ai.maxDecisions).toBe(5);
  });
  it('requires a real expected outcome', () => {
    expect(() =>
      scenarioSchema.parse({
        id: 'noop',
        name: 'No outcome',
        steps: [{ type: 'click', selector: 'button' }],
      }),
    ).toThrow(/explicit outcome/);
    expect(() =>
      scenarioSchema.parse({
        id: 'early',
        name: 'False pass',
        steps: [{ type: 'finish' }, { type: 'assertVisible', selector: '#never' }],
      }),
    ).toThrow(/final step/);
  });
  it('rejects executable steps, unknown keys and unbounded runs', () => {
    expect(() => actionSchema.parse({ type: 'evaluate', code: 'process.exit()' })).toThrow();
    expect(() => configSchema.parse({ ...starterConfig(), shell: 'rm -rf' })).toThrow();
    expect(() => configSchema.parse({ ...starterConfig(), concurrency: 1000 })).toThrow();
    expect(() =>
      configSchema.parse({ ...starterConfig(), personas: [presets[0], presets[0]] }),
    ).toThrow(/unique/);
  });
  it('has twelve schema-validated profiles with distinct environments', () => {
    expect(presets).toHaveLength(12);
    expect(presets.find((p) => p.id === 'keyboard')?.keyboardOnly).toBe(true);
    expect(presets.find((p) => p.id === 'mobile')?.viewport.width).toBe(390);
  });
  it('rejects malformed runner events', () =>
    expect(() =>
      eventSchema.parse({ version: 2, type: 'run.completed', payload: { status: 'passed' } }),
    ).toThrow());
  it('validates Studio messages and rejects executable instructions', () => {
    expect(studioMessageSchema.parse({ type: 'save', config: starterConfig() }).type).toBe('save');
    expect(() => studioMessageSchema.parse({ type: 'execute', command: 'whoami' })).toThrow();
    expect(() => studioMessageSchema.parse({ type: 'ready', path: '../secret' })).toThrow();
  });
  it('does not let model output supply selectors, arbitrary values or shell actions', () => {
    expect(() => decisionSchema.parse({ type: 'click', selector: 'body' })).toThrow();
    expect(() =>
      decisionSchema.parse({ type: 'fill', candidateId: 0, value: 'exfiltrate-real-secret' }),
    ).toThrow();
    expect(() => decisionSchema.parse({ type: 'shell', command: 'whoami' })).toThrow();
  });
});
describe('target and storage policy', () => {
  it.each([
    'https://example.com',
    'file:///etc/passwd',
    'http://localhost.evil.test',
    'http://user:secret@localhost',
    'http://169.254.169.254',
    'http://0.0.0.0',
  ])('rejects %s', (url) => expect(() => localURL(url)).toThrow());
  it('compares complete origins including ports', () => {
    expect(allowedURL('http://127.0.0.1:4173/a', new Set(['http://127.0.0.1:4173']))).toBe(true);
    expect(allowedURL('http://127.0.0.1:9999', new Set(['http://127.0.0.1:4173']))).toBe(false);
  });
  it('blocks traversal and absolute artifact paths', () => {
    expect(() => safePath(process.cwd(), '../outside')).toThrow();
    expect(() => safePath(process.cwd(), process.cwd())).toThrow();
    expect(safePath(process.cwd(), 'report.json')).toContain('report.json');
  });
  it('redacts common secret patterns', () => {
    expect(redact('Bearer abcd api_key=secret https://localhost/?token=abc')).not.toMatch(
      /abcd|=secret|=abc/,
    );
  });
});
