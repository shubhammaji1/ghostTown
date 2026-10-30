# Release gates

1. Run the locked install, typecheck, build, full live/offline browser suite, extension-host suite and clean package smoke checks on all three CI platforms.
2. Run `pnpm package:vsix` and `pnpm test:vsix`. The runtime Playwright libraries must be present; browser binaries must not be bundled.
3. Install the VSIX into a clean VS Code profile. Start the React playground, configure its URL, select three profiles, observe a failing registration assertion, open screenshot/trace, repair the fixture with `?fixed=1`, rerun, cancel another test and restart the editor to check history. This gate is still mandatory even when component tests pass.
4. Exercise AI mode using a configured VS Code language model and disposable data. Check cancellation and refusal of noncandidate decisions. Provider credentials remain managed by VS Code.
5. Set real repository/issues URLs after creating the remote repository. Do not invent a URL. Verify the publisher `shubhammaji1` is authorized for this product. Capture actual marketplace screenshots and prepare release notes.
6. Rebuild, inspect package contents and record SHA-256 checksums. Publish the generated core and CLI tarballs using `npm publish artifacts/ghosttown-core-0.1.0.tgz` and `npm publish artifacts/ghosttown-cli-0.1.0.tgz` only after approval and registry-name availability checks.
7. Publish the reviewed VSIX with `vsce publish --packagePath artifacts/ghosttown-0.1.0.vsix`, or `ovsx publish artifacts/ghosttown-0.1.0.vsix` with configured publisher accounts. Neither marketplace publication nor a remote repository was created automatically.

No automatic marketplace publishing workflow is enabled. Cursor compatibility and Open VSX installation must be checked separately. A successful archive build is not a production readiness claim.
