# GhostTown

Your app deserves users before it gets users.

Run real, local Playwright scenarios with isolated synthetic user profiles from VS Code. No AI key or SaaS account required.

1. Open a trusted project folder and start your development server.
2. Open GhostTown in the activity bar and configure its loopback URL.
3. Run **GhostTown: Install Chromium** if the browser is missing.
4. Select profiles, edit `ghosttown.config.json`, define expected outcomes, then run.
5. Inspect actual results in Test Explorer, GhostTown reports and local screenshots/traces.

Use **GhostTown: Create Scenario** to add a validated starter scenario, then edit its steps. Persona and scenario definitions can be copied, edited, removed and shared through JSON. Run history persists in the extension's host storage. **Clear Run History** deletes stored evidence after confirmation.

Use **Open Persona & Scenario Studio** to edit, duplicate or delete profiles/scenarios and import/export validated configurations. The Studio uses React/Vite and your editor theme. Native reports include findings and action timelines. **Rerun Failed Scenarios** repeats failed definitions using current configuration.

Optional AI: configure a VS Code language model with **Configure AI Model**, choose AI or hybrid mode, and list allowed controls in each scenario's `explorationSelectors`. Each AI run asks for consent before sharing goals, route paths and approved control labels. The model chooses only listed controls and synthetic values. Scenario assertions independently verify outcomes. Authentication stays with VS Code. No raw API keys are stored by GhostTown. Real provider calls have not been verified in the build environment; deterministic mode requires no model account.

Explicit scenario `source: {path, line}` metadata can publish verified assertion failures as workspace diagnostics. Automatic source-map resolution and full accessibility audits are not available. This is an initial implementation; production acceptance and marketplace publication require the verification gates documented in the source repository.

The runner executes on the workspace extension host. For Remote SSH/WSL/containers, localhost and Chromium belong to that host. Desktop only; Cursor compatibility has not been verified. No project scripts run automatically.

Privacy: no telemetry. Optional AI sends approved observations through your selected VS Code model after consent; deterministic mode makes no model calls. Screenshots mask inputs but can reveal rendered data. Traces include DOM/network data and are disabled by default. Use synthetic data and delete evidence when finished. This is not an OS/network sandbox for hostile web pages.

Troubleshooting: **Check Browser Environment**, **Install Chromium**, then inspect the GhostTown Output channel. Ensure the configured server is reachable from the workspace host and all required local asset origins are explicitly listed in `allowedOrigins`.
