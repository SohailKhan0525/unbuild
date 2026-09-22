# Contributing to unbuild

Thanks for contributing.

unbuild is a focused open-source CLI. Good contributions improve extraction accuracy, evidence quality, security, reliability, documentation, or developer experience without turning the project into an unrelated platform.

## Before you start

For bugs, search existing issues first.

For new functionality, open an issue describing:

- the problem;
- the observable behavior you want;
- why the change belongs in unbuild;
- how you would verify it.

For security vulnerabilities, do not open a public issue. Follow [SECURITY.md](./SECURITY.md).

## Development

Requirements:

- Node.js 22.14+
- npm
- Chromium installed through Playwright

```bash
npm install
npx playwright install chromium
npm run check
npm test
```

Build:

```bash
npm run build
```

## Project boundaries

unbuild is about observable interface reconstruction.

Good changes include:

- better browser evidence;
- responsive measurement;
- accessibility/semantic evidence;
- component detection;
- motion detection;
- asset and font evidence;
- deterministic output;
- better CLI ergonomics;
- tests and security hardening;
- clearer AI-facing documentation.

Changes that turn unbuild into a hosted scraping service, authentication bypass, credential collector, or unrelated website builder are outside the project's purpose.

## Pull requests

Keep pull requests small and focused.

A useful PR description should answer:

1. What changed?
2. Why?
3. How was it tested?
4. Are there security or compatibility implications?

For extraction changes, include representative evidence or screenshots when useful.

For bug fixes, include a regression test whenever practical.

Do not submit large AI-generated walls of text. Maintainers need concise technical context that they can verify.

## Code standards

- TypeScript strict mode.
- Avoid `any`.
- Prefer immutable values and early returns.
- Keep helpers close to the code they support.
- Preserve clear boundaries between crawling, extraction, reporting, and CLI concerns.
- Treat target website content as untrusted.
- Do not weaken security controls to make a test pass.

## Tests

Run before opening a PR:

```bash
npm run check
npm test
```

If you change browser behavior, also run a real local fixture through the CLI.

Do not make the test suite depend on a third-party website being available.

## Commit messages

Use Conventional Commits:

- `feat:` new user-visible capability
- `fix:` bug fix
- `docs:` documentation
- `test:` tests
- `refactor:` behavior-preserving restructuring
- `chore:` maintenance

Examples:

```text
feat(extract): record CSS custom properties
fix(crawl): stop following cross-origin links
docs: clarify generated evidence semantics
test(cli): reject unsupported URL schemes
```

These messages are used by semantic-release to determine release versions.

## Release process

Releases are automated from `main` using semantic-release.

Do not manually edit the package version for normal releases.

A release commit must use a Conventional Commit that semantic-release can classify as a release.

The release workflow uses npm Trusted Publishing/OIDC. Never add an npm publish token to the repository.

Before a release, CI must be green.

## License

By contributing, you agree that your contribution is licensed under the repository's MIT license.
