import { z } from 'zod';

export const idSchema = z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/);
const selector = z.string().min(1).max(500);
export const actionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('navigate'), path: z.string().min(1).max(1000) }).strict(),
  z.object({ type: z.literal('click'), selector }).strict(),
  z.object({ type: z.literal('fill'), selector, value: z.string().max(2000) }).strict(),
  z.object({ type: z.literal('select'), selector, value: z.string().max(500) }).strict(),
  z.object({ type: z.literal('check'), selector, checked: z.boolean() }).strict(),
  z
    .object({
      type: z.literal('press'),
      key: z.enum(['Tab', 'Shift+Tab', 'Enter', 'Space', 'Escape', 'ArrowDown', 'ArrowUp']),
    })
    .strict(),
  z.object({ type: z.literal('scroll'), deltaY: z.number().int().min(-2000).max(2000) }).strict(),
  z.object({ type: z.literal('wait'), selector }).strict(),
  z.object({ type: z.literal('assertVisible'), selector }).strict(),
  z.object({ type: z.literal('assertText'), selector, text: z.string().max(2000) }).strict(),
  z.object({ type: z.literal('assertURL'), path: z.string().max(1000) }).strict(),
  z.object({ type: z.literal('screenshot') }).strict(),
  z.object({ type: z.literal('finish') }).strict(),
]);
export type Action = z.infer<typeof actionSchema>;
export const personaSchema = z
  .object({
    id: idSchema,
    name: z.string().min(1).max(100),
    description: z.string().max(500).default(''),
    viewport: z
      .object({
        width: z.number().int().min(240).max(2560),
        height: z.number().int().min(240).max(1600),
      })
      .strict()
      .default({ width: 1280, height: 800 }),
    locale: z.string().min(2).max(30).default('en-US'),
    mobile: z.boolean().default(false),
    keyboardOnly: z.boolean().default(false),
    actionTimeoutMs: z.number().int().min(100).max(30000).default(5000),
    delayMs: z.number().int().min(0).max(2000).default(0),
    reducedMotion: z.boolean().default(false),
    networkLatencyMs: z.number().int().min(0).max(1000).default(0),
  })
  .strict();
export type Persona = z.infer<typeof personaSchema>;
export const scenarioSchema = z
  .object({
    id: idSchema,
    name: z.string().min(1).max(100),
    goal: z.string().max(500).default('Verify defined outcomes'),
    startPath: z.string().min(1).max(1000).default('/'),
    maxDurationMs: z.number().int().min(500).max(300000).default(30000),
    steps: z.array(actionSchema).min(1).max(100),
    explorationSelectors: z.array(selector).max(40).default([]),
    source: z
      .object({ path: z.string().min(1).max(500), line: z.number().int().min(1) })
      .strict()
      .optional(),
  })
  .strict()
  .superRefine((s, ctx) => {
    if (!s.steps.some((a) => ['assertVisible', 'assertText', 'assertURL'].includes(a.type)))
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'A scenario must contain an explicit outcome assertion',
        path: ['steps'],
      });
    if (s.steps.some((a, i) => a.type === 'finish' && i !== s.steps.length - 1))
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Finish must be the final step, after all assertions',
        path: ['steps'],
      });
  });
export type Scenario = z.infer<typeof scenarioSchema>;
export const configSchema = z
  .object({
    version: z.literal(1),
    target: z.string().url().max(1000),
    mode: z.enum(['deterministic', 'ai', 'hybrid']).default('deterministic'),
    ai: z
      .object({ maxDecisions: z.number().int().min(1).max(20).default(5) })
      .strict()
      .default({}),
    concurrency: z.number().int().min(1).max(4).default(1),
    personas: z.array(personaSchema).min(1).max(20),
    scenarios: z.array(scenarioSchema).min(1).max(30),
    capture: z
      .object({ screenshots: z.boolean().default(true), traces: z.boolean().default(false) })
      .strict()
      .default({}),
    allowedOrigins: z.array(z.string().url()).max(10).default([]),
    maxRunDurationMs: z.number().int().min(1000).max(600000).default(120000),
  })
  .strict()
  .superRefine((c, ctx) => {
    for (const key of ['personas', 'scenarios'] as const) {
      if (new Set(c[key].map((x) => x.id)).size !== c[key].length)
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: [key], message: 'IDs must be unique' });
    }
  });
export type Config = z.infer<typeof configSchema>;
export const studioMessageSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('ready') }).strict(),
  z.object({ type: z.literal('import') }).strict(),
  z.object({ type: z.literal('save'), config: configSchema }).strict(),
  z.object({ type: z.literal('export'), config: configSchema }).strict(),
]);
export const issueSchema = z
  .object({
    id: z.string(),
    title: z.string(),
    category: z.enum([
      'Verified Defect',
      'Observed Failure',
      'Environment Problem',
      'Potential UX Concern',
      'Inconclusive',
    ]),
    details: z.string(),
    step: z.number().int(),
    expected: z.string().optional(),
  })
  .strict();
export type Issue = z.infer<typeof issueSchema>;
export const sessionSchema = z
  .object({
    id: z.string(),
    persona: z.string(),
    scenario: z.string(),
    status: z.enum(['passed', 'failed', 'cancelled', 'error']),
    durationMs: z.number(),
    issues: z.array(issueSchema),
    screenshot: z.string().optional(),
    trace: z.string().optional(),
    timeline: z.array(
      z.object({
        step: z.number(),
        action: z.string(),
        status: z.enum(['passed', 'failed']),
        elapsedMs: z.number(),
      }),
    ),
  })
  .strict();
export type SessionResult = z.infer<typeof sessionSchema>;
export const reportSchema = z
  .object({
    version: z.literal(1),
    runId: z.string().uuid(),
    target: z.string(),
    transport: z.enum(['live', 'fixtures']),
    mode: z.enum(['deterministic', 'ai', 'hybrid']),
    startedAt: z.string(),
    endedAt: z.string(),
    status: z.enum(['passed', 'failed', 'cancelled', 'error']),
    sessions: z.array(sessionSchema),
    summary: z.object({
      passed: z.number(),
      failed: z.number(),
      cancelled: z.number(),
      errors: z.number(),
      issues: z.number(),
    }),
  })
  .strict();
export type Report = z.infer<typeof reportSchema>;
export const observationSchema = z
  .object({
    requestId: z.string().uuid(),
    goal: z.string().max(500),
    persona: z.string().max(100),
    path: z.string().max(1000),
    remaining: z.number().int().min(0).max(20),
    candidates: z
      .array(
        z
          .object({
            id: z.number().int().nonnegative(),
            type: z.enum(['click', 'fill']),
            label: z.string().max(120),
          })
          .strict(),
      )
      .max(40),
  })
  .strict();
export type Observation = z.infer<typeof observationSchema>;
export const decisionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('finish') }).strict(),
  z
    .object({ type: z.literal('click'), candidateId: z.number().int().nonnegative().max(39) })
    .strict(),
  z
    .object({
      type: z.literal('fill'),
      candidateId: z.number().int().nonnegative().max(39),
      value: z.enum(['synthetic@example.test', 'GhostTown Synthetic User', 'ghosttown']),
    })
    .strict(),
]);
export type Decision = z.infer<typeof decisionSchema>;
export const eventSchema = z
  .object({
    version: z.literal(1),
    runId: z.string().uuid(),
    sequence: z.number().int().nonnegative(),
    timestamp: z.string().datetime(),
    type: z.enum([
      'runner.ready',
      'run.started',
      'session.started',
      'action.completed',
      'session.completed',
      'run.completed',
      'runner.error',
      'ai.request',
    ]),
    payload: z
      .object({
        message: z.string().max(2000).optional(),
        session: sessionSchema.optional(),
        report: reportSchema.optional(),
        observation: observationSchema.optional(),
      })
      .strict(),
  })
  .strict();
export type RunEvent = z.infer<typeof eventSchema>;
export const commandSchema = z.discriminatedUnion('type', [
  z
    .object({
      version: z.literal(1),
      type: z.literal('run'),
      runId: z.string().uuid(),
      config: configSchema,
      outputDir: z.string().min(1).max(2000),
    })
    .strict(),
  z.object({ version: z.literal(1), type: z.literal('cancel') }).strict(),
  z
    .object({
      version: z.literal(1),
      type: z.literal('ai.response'),
      requestId: z.string().uuid(),
      decision: decisionSchema.nullable(),
    })
    .strict(),
]);

export const presets: Persona[] = [
  { id: 'first-time', name: 'First-Time Visitor' },
  { id: 'impatient', name: 'Impatient Visitor', actionTimeoutMs: 1000 },
  { id: 'explorer', name: 'Curious Explorer', actionTimeoutMs: 8000 },
  { id: 'power', name: 'Experienced Power User', actionTimeoutMs: 2000 },
  {
    id: 'mobile',
    name: 'Mobile-Only Visitor',
    mobile: true,
    viewport: { width: 390, height: 844 },
  },
  { id: 'keyboard', name: 'Keyboard-Only User', keyboardOnly: true },
  { id: 'slow-network', name: 'Slow-Network User', networkLatencyMs: 500, actionTimeoutMs: 10000 },
  {
    id: 'returning',
    name: 'Returning User',
    description: 'Fresh context; returning state must be established explicitly in scenario steps.',
  },
  { id: 'form', name: 'Form-Focused User', delayMs: 120 },
  { id: 'search', name: 'Search-Focused User', actionTimeoutMs: 7000 },
  { id: 'distracted', name: 'Distracted User', delayMs: 600 },
  { id: 'cautious', name: 'Cautious User', reducedMotion: true, delayMs: 300 },
].map((p) => personaSchema.parse(p));

export function starterConfig(target = 'http://127.0.0.1:4173'): Config {
  return configSchema.parse({
    version: 1,
    target,
    personas: presets.slice(0, 1),
    scenarios: [
      {
        id: 'homepage',
        name: 'Homepage is available',
        steps: [{ type: 'assertVisible', selector: 'body' }],
      },
    ],
  });
}
