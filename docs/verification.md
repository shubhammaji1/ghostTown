# GhostTown 0.1.0 verification

Verification date: 30 October 2026. This is a working beta implementation, not a certified production release.

## Retest on 30 October

The full existing suite passed: **31 tests across six files**, including all eight live HTTP/Chromium tests that were blocked on 29 October. The application build and TypeScript check pass. Prettier and frozen-lockfile metadata validation pass.

The two additional acceptance tests also pass: **33 automated tests passed across these runs**. The rebuilt VSIX includes the selected PNG logo, and its extracted browser runner completes an actual live test successfully.

An additional acceptance suite exercises the compiled CLI against the actual React/Vite playground with desktop, mobile and keyboard-only personas. All three sessions detect the deliberately broken registration; all three pass after changing the fixture path to `/register?fixed=1`. Failed runs produce real screenshots and traces, and CLI exit codes correctly change from 1 to 0. The suite also extracts the installable VSIX and runs its self-contained browser runner against the live React application.

The extension archive was rebuilt with `resources/icon.png` (1254 by 1254 pixels). Archive checks verify the logo, runtime libraries and Studio assets. npm clean-install smoke checks pass, including the installed command shim, ESM/CommonJS SDK imports and strict TypeScript declaration compilation in a separate consumer.

Current machine-readable evidence: `artifacts/test-results-2026-10-30.json`, `artifacts/react-playground-test-2026-10-30.json`, and summaries/reports under `artifacts/react-playground-acceptance/`. These local fixtures contain synthetic data only.

## Installed VS Code acceptance on 30 October

Completed through the actual installed `shubhammaji1.ghosttown` 0.1.0 extension in the user's normal VS Code window:

| Check                             | Observed result                                                                                                                                                                          |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Installed activation and branding | GhostTown extension page displays the selected portal logo; native sidebar loads project configuration                                                                                   |
| Real population run               | Homepage passes for both personas; deliberately broken registration fails for both: 2 passed, 2 failed, 0 execution errors                                                               |
| Native Test Explorer              | Homepage marked Passed; registration marked Failed                                                                                                                                       |
| Findings and evidence             | Report displays the failed assertion; captured 390x844 mobile PNG opens in VS Code with inputs masked                                                                                    |
| Installed React Studio            | Personas/scenarios load; edited registration path is applied and saved through the validated host message channel                                                                        |
| Repair verification               | After selecting `/register?fixed=1`, a run launched from the installed sidebar reports 4 passed, 0 failed, 0 errors                                                                      |
| Native cancellation               | Stop button cancels an intentionally waiting scenario; sidebar changes from Running to cancelled and returns to the Run action                                                           |
| Restart and history               | After Developer: Reload Window, the extension returns Ready; failed, passed and cancelled runs remain in Recent Runs; reopening the passing run still shows 4 passed, 0 failed, 0 errors |
| Test cleanup                      | Original `ghosttown.config.json` restored byte for byte; temporary cancellation settings removed                                                                                         |

The initial native execution error was `ECONNREFUSED 127.0.0.1:4173`: the playground was not running. Starting the real React/Vite playground resolved it. The playground was left running at the configured URL for the user.

The earlier automated editor launch still fails with Windows `EPERM`/Electron installation-directory ACL errors, but this no longer blocks validation of the installed extension through the already running normal VS Code window. No Windows permissions or sandbox protections were changed. The isolated F5 debug launch, negative Workspace Trust test, native trace-viewer/export commands, authenticated AI and non-Windows hosts are not covered by this manual acceptance pass.

## Implemented

- Strict Zod configuration, persona, action, scenario, report, webview and IPC schemas. Unknown executable instructions are rejected. Scenarios require explicit assertions; an early finish cannot bypass them.
- Standalone Playwright core with isolated Chromium contexts, bounded concurrency, action/session/run deadlines, keyboard/mobile settings, screenshots, opt-in traces, action timelines, observed runtime/HTTP failures and mobile overflow concerns.
- Dedicated JSON-line runner, monotonic validated events, cancellation and crash reporting. Context closure is shared between deadline, cancellation and cleanup to avoid competing close operations.
- CLI initialization, config/scenario/persona inspection, deterministic runs, JSON/Markdown reports, browser installation/checks and signal handling.
- VS Code native sidebar, Test Explorer, multi-folder selection, per-project local history, reports/timelines, screenshots/traces, configuration, reruns, exports and history deletion. Explicit scenario source metadata can map verified assertions to diagnostics after path/range checks.
- React/Vite Persona & Scenario Studio: validated JSON editing, duplication, deletion, import/export and theme-aware layout. The editor has explicit Apply and Save actions.
- Optional AI and hybrid execution with an SDK adapter and native VS Code model integration. Only explicitly approved selectors and synthetic values can be chosen. Authentication remains with VS Code. Deterministic assertions evaluate outcomes independently.
- React/Vite playground and a separate HTTP integration fixture. The registration fixture deliberately fails; `?fixed=1` supplies a repair for repeatable verification.
- ESM/CommonJS core bundles and declarations, CLI tarball, VSIX with intact Playwright runtime libraries, cross-platform CI workflow and publishing instructions.

## Local verification evidence

The original 29 October results are recorded in `artifacts/verification-results.json`; the current retest files are listed above. Checks use Windows with Node.js 22.17.0, TypeScript 5.9.3, Playwright 1.64.1 and Chromium revision 1248, Vitest 3.2.7, Zod 3.25.76, React 19.3.1, Vite 7.3.7 and vsce 3.9.2.

- Type checking, production bundle build and Prettier formatting checks.
- Offline suite: real Chromium registration interactions; failing expected outcome with genuine PNG and ZIP evidence; repaired outcome; local-storage isolation; desktop/mobile/keyboard profiles; cancellation and subsequent run; origin/redirect rejection; session deadlines; mobile overflow; bounded adapter execution and invalid decision rejection; runner IPC; built Studio edit/duplicate/save interaction; policy/schema tests.
- npm smoke: actual tarballs, packed-file allowlists, separate offline consumer installation, installed executable and shim, ESM and CommonJS imports, TypeScript declaration resolution.
- VSIX archive inspection and extraction, runtime dependencies resolved from inside the archive, and extracted runner cancellation protocol. No browser binaries are included.
- Frozen-lockfile metadata consistency check. Initial setup copied development dependencies from existing installed package caches when registry access was unavailable. The lock retains cached published integrity metadata where available; Zod 3.25.76 is pinned to its exact registry tarball URL without an integrity field. A fresh registry-based locked install has not been verified and remains a release gate.

## Blocked or unverified

1. Live HTTP integration is now verified on 30 October; the earlier `EACCES 127.0.0.1` restriction no longer blocks the browser suites. Offline response fixtures remain explicitly labelled and are separate from live tests. Fresh registry installation remains unverified.
2. Automated extension-host startup remains restricted by Windows `EPERM`/Electron ACL errors. Installed activation, sidebar execution, Test Explorer, Studio saving, reports, screenshots, cancellation and restart/history persistence are now verified through the normal VS Code UI. The isolated F5 debug launch, negative Workspace Trust test and native trace/export actions remain unverified.
3. Authenticated model calls: no configured provider/account was used. The model API integration is type checked, while browser decisions are tested with an explicit deterministic adapter. Provider costs and output-token limits remain provider-managed.
4. Linux/macOS, Remote SSH, WSL, Dev Containers, Cursor and Open VSX installation have not been executed here. CI is supplied but has not run on a remote repository.
5. Dependency audit and hosted secret scanning need registry/GitHub access. VSIX packaging ran vsce's local secret scan; this does not replace the full CI security gates.
6. Marketplace metadata needs a confirmed remote repository/issues URL, real screenshots, publisher authorization and registry name checks. Nothing has been published.

## Remaining product scope

The master prompt describes a larger production release. Remaining work includes automatic source-map/stack resolution, comprehensive automated accessibility audits, response assertions, advanced goal-based deterministic exploration, persisted returning-user setup, full visual form editors beyond validated JSON, configurable evidence retention, strict pre-write artifact quotas, provider-specific monetary cost enforcement and broader native-host tests. Timing and process cleanup still require repeated cross-platform stress checks. Browser routing is a guardrail for owned local apps, not network isolation for hostile pages.

Run the release gates in [publishing.md](publishing.md) before distributing this as production-ready.
