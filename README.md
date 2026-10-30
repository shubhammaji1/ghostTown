# GhostTown

**Your app deserves users before it gets users.**

GhostTown runs declarative browser scenarios with configurable synthetic user profiles. A standalone TypeScript core, CLI and VS Code extension share the same Playwright engine. This initial version supports deterministic testing of developer-owned loopback applications. It does not predict human behavior, generate traffic, or require AI credentials.

## Develop

Node.js 22+, pnpm 8.15.9:

```sh
pnpm install
pnpm build
pnpm browsers:install
pnpm test
pnpm playground
```

In another terminal:

```sh
node packages/cli/dist/bin.cjs init
node packages/cli/dist/bin.cjs run
```

Default target: `http://127.0.0.1:4173`. `ghosttown.config.json` is a strict JSON file. Configure explicit assertions that describe the outcome you expect. A visible body only checks page availability.

```json
{
  "version": 1,
  "target": "http://127.0.0.1:4173",
  "personas": [{ "id": "visitor", "name": "First-Time Visitor" }],
  "scenarios": [
    {
      "id": "registration",
      "name": "Registration succeeds",
      "startPath": "/register",
      "steps": [
        { "type": "fill", "selector": "#email", "value": "synthetic@example.test" },
        { "type": "fill", "selector": "#password", "value": "Synthetic-only-123" },
        { "type": "click", "selector": "button[type=submit]" },
        { "type": "assertText", "selector": "#result", "text": "Account created" }
      ]
    }
  ]
}
```

The playground deliberately fails this registration scenario. Set `startPath` to `/register?fixed=1` to verify the repaired behavior.

## CLI

`ghosttown init`, `doctor`, `personas list`, `scenarios list`, `run`, `report FILE --format markdown`, `browsers install`. Use `--config FILE`, `--output DIR`, `--scenario ID`, `--json` on relevant commands. Exit codes: 0 success; 1 failed test/environment; 2 invalid input; 130 cancellation. Ctrl+C cancels a run.

## SDK

```ts
import { runPopulation, starterConfig } from 'ghosttown-core';
const report = await runPopulation(starterConfig('http://127.0.0.1:4173'), {
  outputDir: './.ghosttown/runs',
  onEvent: (event) => console.log(event.type),
});
```

`runPopulation(input, {outputDir, signal?, runId?, onEvent?})` validates input and returns an immutable-by-convention report after persisting `RUN_ID/report.json`. Reports contain actual action timelines, issue categories and relative artifact references. Every persona/scenario pair gets a new browser context. Cancellation and configured deadlines close active contexts.

## VS Code

Build and run `pnpm package:vsix`, then install `artifacts/ghosttown-0.1.0.vsix` using **Extensions: Install from VSIX**. Open a trusted folder, choose GhostTown in the activity bar, configure a target, select profiles, edit scenarios and run. Saved scenarios also appear in Test Explorer. View history, findings, screenshots and traces through GhostTown commands. No browser starts during activation. Chromium installation is a separate explicit action.

The extension runs in the workspace host. Under SSH/WSL/containers, localhost refers to that host; browser dependencies must be installed there. Web extension hosts are unsupported. Cursor/Open VSX compatibility requires separate validation.

## Capabilities and limits

- Real Chromium sessions, bounded concurrency (1–4), time budgets, independent storage, graceful cancellation.
- Navigate, click, fill, select, check, scroll, keys, locator waits and explicit visible/text/URL assertions.
- Mobile viewport/overflow checks; keyboard-only click/fill uses real Tab traversal; configurable latency, waits, pacing and motion preferences.
- Screenshots mask input fields; traces are opt-in. Both can still contain sensitive application data. Use synthetic accounts.
- Assertions establish expected outcomes. Runtime/HTTP failures are observations; horizontal overflow is a potential UX concern. No AI opinions are reported as defects.
- The twelve presets are configurable execution profiles, not validated models of human demographics. Returning-state setup must be explicit. Profiles do not automatically invent goals or exploratory journeys.
- AI/hybrid exploration is optional through a configured VS Code language model or SDK `DecisionAdapter`. Use **Configure AI Model**, then **Select Testing Mode**. Browser control labels and goals are sent only after explicit per-run consent. Credentials remain managed by VS Code; no API key is written to project files. The CLI currently supports deterministic mode.
- AI can only click/fill explicitly approved `explorationSelectors` with a small allowlist of synthetic values. Decisions cannot contain JS, shell commands, URLs or arbitrary selectors. Calls, input tokens, response size and time are bounded. Provider-specific output-token limits and monetary cost caps are not enforced; use your provider's billing limits. Hybrid executes setup actions, explores, then evaluates scenario assertions. An AI opinion never becomes an issue.
- The React/Vite Persona & Scenario Studio supports validated JSON definitions, editing, duplication, deletion and configuration import/export. The compact native sidebar and script-free report webview use VS Code themes.
- Explicit `source: {path, line}` metadata maps verified assertion failures to workspace diagnostics. Automatic stack/source-map resolution, full accessibility auditing and response assertions are not implemented. Source locations are never guessed.

See [architecture](docs/architecture.md), [security](SECURITY.md) and [verification](docs/verification.md) for exact scope and release gates.

## Offline verification

`pnpm test:offline` runs schema/policy tests, actual Chromium sessions against explicit in-memory responses, runner IPC and the built React Studio. Reports label these runs `transport: fixtures`; the fixture transport is an SDK option, never a silent substitute for a live target. `pnpm test` also runs live loopback HTTP tests and requires an environment that permits local connections. `pnpm test:packaging` installs tarballs into a separate consumer and checks CLI shims, ESM/CJS imports and TypeScript declarations. `pnpm test:vsix` checks the extracted VSIX runner and runtime dependencies. Neither substitutes for the complete VS Code host acceptance test.
