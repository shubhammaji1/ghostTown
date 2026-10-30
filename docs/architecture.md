# Architecture and implementation plan

GhostTown is a local desktop developer tool. The core owns validation, origin policy, persona scheduling, browser contexts, assertions, evidence and reports. The CLI and managed runner both call `runPopulation(config, options)`. The extension only manages editor UI, configuration, native tests and runner lifecycle.

Dependencies: TypeScript strict mode; Playwright for actual Chromium sessions and traces; Zod for strict declarative configuration and IPC; Vitest for policy, lifecycle, browser and packaging tests; esbuild for portable runtime bundles. Only Playwright remains an external runtime dependency. Browser binaries are installed explicitly and never bundled or downloaded during activation.

Protocol v1 uses JSON lines. Commands are `run` and `cancel`. Events have version, runId, sequence, time, type and schema-validated payload. Only one active run per runner; stdout contains protocol messages only. Browser work runs in a separate process, with cancellation via context closure and eventual process termination.

Each persona/scenario pair receives an isolated browser context. Session budgets close contexts on timeout; stop closes every active context. Requests are restricted to explicitly selected loopback origins, service workers and downloads are blocked, popups are closed. These checks are guardrails for developer-owned apps, not a network sandbox for malicious websites. Remote arbitrary targets are refused in this initial release.

Milestones: (1) schemas, core and real fixture tests; (2) CLI and packed-install checks; (3) runner and native VS Code sidebar/Test Explorer/history; (4) evidence UI and extension-host tests; (5) optional AI through a bounded adapter; (6) release packaging and evidence of remaining limitations.

No speculative source diagnostics: until reliable source mapping exists, evidence remains browser-level. No fabricated history or results. Unsupported modes are rejected explicitly.

The optional AI boundary is a `DecisionAdapter`: goals, route paths and at most 40 approved control labels go out; strict click/fill/finish decisions come back. Selectors and synthetic values remain locally controlled. In VS Code, the extension owns model authentication and streams through the native language-model API; the runner requests decisions through validated IPC. A per-run consent dialog precedes model use. No provider API key crosses IPC. Tests use an explicit deterministic decision adapter and do not claim authenticated-provider validation.

The React/Vite Studio communicates through four strictly validated message shapes (ready, save, import, export). Local resource roots are restricted to built assets, scripts require a nonce, and rendering uses React text nodes. A separate script-free report view escapes observed strings. Scenario-defined assertion locations can produce diagnostics only after path containment and document-range checks.
