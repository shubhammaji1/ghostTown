# ghosttown-core

Local persona-driven Playwright testing. ESM and CommonJS exports with TypeScript declarations. Node.js 22+ required. Install the matching Chromium with `npx playwright install chromium` before execution.

```ts
import { runPopulation, starterConfig } from 'ghosttown-core';
const report = await runPopulation(starterConfig('http://127.0.0.1:4173'), { outputDir: './runs' });
```

`runPopulation(input, options)` accepts strict declarative configuration and returns a persisted report. Options: `outputDir`, optional AbortSignal `signal`, optional UUID `runId`, optional `onEvent`. Utilities: `starterConfig`, `presets`, Zod schemas, `checkBrowser`, `markdownReport`. Only approved loopback HTTP(S) origins are supported. Screenshots can include private data; traces are disabled by default. Use synthetic data.
