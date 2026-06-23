## Summary

<!-- Explain what changed and why. Keep this focused on observable behavior and important implementation decisions. -->

## Related issue

<!-- Use "Closes #123" when this PR should close an issue. -->

## Change type

- [ ] Bug fix
- [ ] Feature
- [ ] Refactor or maintenance
- [ ] Documentation
- [ ] Build, packaging, or CI

## Validation

<!-- List the exact checks you ran and their results. Include the operating systems and architectures used for native behavior. -->

- [ ] `pnpm test`
- [ ] `pnpm build`
- [ ] `cargo fmt --manifest-path src-tauri/Cargo.toml --all -- --check`
- [ ] `cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets --all-features`
- [ ] `cargo test --manifest-path src-tauri/Cargo.toml --all-targets --all-features`
- [ ] I smoke-tested the affected desktop behavior.

## Screenshots or recordings

<!-- Required for visible UI changes. Remove this section when it does not apply. -->

## Risk and compatibility

<!-- Note migrations, database changes, permissions, network behavior, platform-specific code, package format changes, or known limitations. -->

- [ ] No new secrets, private data, telemetry, or broad Tauri permissions were introduced.
- [ ] User-facing documentation was updated where needed.
- [ ] Dependency and lockfile changes are intentional and limited to this PR.
- [ ] Breaking changes and upgrade steps are clearly documented.
