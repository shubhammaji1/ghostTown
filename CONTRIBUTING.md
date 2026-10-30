# Contributing

Use Node.js 22.17+ and pnpm 8.15.9. Install locked dependencies, build, then run type checking, Vitest and packaging smoke tests. Chromium installation is explicit. Keep the standalone core independent of VS Code. Add behavioral tests for changes in assertions, policy, lifecycle, IPC or packaging. Never weaken a failing expected outcome to produce green reports.

Live-browser tests need loopback network access. Offline response-fixture tests still launch Chromium, but reports must retain `transport: fixtures`; they do not establish live-server compatibility. VS Code host tests require a runnable desktop editor environment. Document blocked checks in the verification report.
