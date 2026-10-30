import type { Page } from 'playwright';
import { randomUUID } from 'node:crypto';
import {
  decisionSchema,
  observationSchema,
  type Observation,
  type Persona,
  type Action,
} from '../../shared/src/index.js';
export interface DecisionAdapter {
  decide(observation: Observation, signal: AbortSignal): Promise<unknown>;
}
export async function decideAction(
  page: Page,
  adapter: DecisionAdapter,
  goal: string,
  persona: Persona,
  remaining: number,
  signal: AbortSignal,
  allowedSelectors: string[],
): Promise<Action> {
  const controls: Array<{ selector: string; type: 'click' | 'fill'; label: string }> = [];
  // Selectors are built locally from the current page. The model cannot supply JS, URLs, selectors or arbitrary input values.
  for (const approved of allowedSelectors) {
    const element = page.locator(approved);
    if ((await element.count()) !== 1 || !(await element.isVisible())) continue;
    const data = await element.evaluate((el) => ({
      tag: el.tagName.toLowerCase(),
      type: el.getAttribute('type'),
      label: (
        el.getAttribute('aria-label') ??
        el.getAttribute('placeholder') ??
        el.textContent ??
        ''
      )
        .trim()
        .slice(0, 120),
      href: el.getAttribute('href'),
    }));
    if (data.type === 'file' || data.type === 'password' || data.tag === 'select') continue;
    // Destructive or financial controls are never candidates. This is a guardrail; use only disposable test applications.
    if (
      /delete|remove|purchase|pay\b|checkout|transfer|unsubscribe|destroy|logout/i.test(data.label)
    )
      continue;
    controls.push({
      selector: approved,
      type: ['input', 'textarea'].includes(data.tag) ? 'fill' : 'click',
      label: data.label,
    });
  }
  const observation = observationSchema.parse({
    requestId: randomUUID(),
    goal,
    persona: persona.name,
    path: new URL(page.url()).pathname,
    remaining,
    candidates: controls.map((c, id) => ({ id, type: c.type, label: c.label })),
  });
  let listener: () => void = () => {};
  const aborted = new Promise<never>((_, reject) => {
    listener = () => reject(new Error('AI decision cancelled'));
    signal.addEventListener('abort', listener, { once: true });
    if (signal.aborted) listener();
  });
  let response: unknown;
  try {
    response = await Promise.race([adapter.decide(observation, signal), aborted]);
  } finally {
    signal.removeEventListener('abort', listener);
  }
  const decision = decisionSchema.parse(response);
  if (decision.type === 'finish') return decision;
  const candidate = controls[decision.candidateId];
  if (!candidate || candidate.type !== decision.type)
    throw new Error('AI decision is outside the approved candidate set');
  return decision.type === 'click'
    ? { type: 'click', selector: candidate.selector }
    : { type: 'fill', selector: candidate.selector, value: decision.value };
}
