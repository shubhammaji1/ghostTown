# ghosttown-cli

Local deterministic synthetic user testing with real Chromium. Node.js 22+ required.

```sh
ghosttown browsers install
ghosttown init --target http://127.0.0.1:3000
ghosttown run
```

Use `ghosttown --help` for commands. Define expected outcome assertions in `ghosttown.config.json`. Exit codes: 0 pass, 1 failed test/environment, 2 input error, 130 cancelled. Evidence remains in the selected local output directory. Use synthetic data.
