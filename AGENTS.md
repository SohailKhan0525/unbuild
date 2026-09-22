# unbuild agent guide

## Purpose

unbuild is a Node.js/TypeScript CLI that uses Playwright to render public websites and extract observable UI/design evidence for downstream reconstruction.

The repository is a production package, not a demo. Prefer correctness, security, deterministic evidence, and maintainability over cleverness.

## Priorities

1. Security
2. Correctness of observed evidence
3. Reproducibility
4. Clear output for humans and coding agents
5. Performance
6. Simplicity

Never trade a security boundary for extraction convenience.

## Commands

Install:

```bash
npm install
```

The package installs the matching Chromium browser automatically. If browser installation is intentionally skipped, use `npx playwright install chromium` or an installed browser via `--browser` / `--cdp`.

Check:

```bash
npm run check
```

Test:

```bash
npm test
```

Build:

```bash
npm run build
```

## Architecture

- `src/cli.ts` — command-line parsing and user-facing errors.
- `src/unbuild.ts` — browser lifecycle, crawling, screenshots, and output orchestration.
- `src/discover.ts` — same-origin page discovery.
- `src/extract.ts` — browser-side evidence extraction.
- `src/report.ts` — Markdown reconstruction reports.
- `test/` — executable tests.

Keep browser collection separate from report generation. Do not make Markdown the source of truth when structured evidence can represent the fact.

## Evidence rules

- Distinguish observation from inference.
- Never call an inferred breakpoint, token, component, or interaction “exact” unless it is directly measured.
- Prefer computed browser values over source-code guesses.
- Preserve the URL and viewport associated with every observation.
- Keep screenshots and JSON evidence synchronized.
- Do not silently discard extraction failures; record enough context for debugging.

## Security rules

unbuild renders attacker-controlled web content.

- Treat every page value as untrusted input.
- Never execute target-provided code outside the browser.
- Never add shell execution based on page content.
- Do not introduce authenticated browser profiles.
- Do not weaken browser isolation or CSP behavior for convenience.
- Be explicit about network access and SSRF implications.
- Any future server mode must use process/container/network isolation rather than relying on Chromium as a sandbox.
- Avoid writing target-controlled values into paths without strict filename sanitization.
- Never place secrets in generated evidence.

## Code style

- TypeScript in strict mode.
- Prefer precise types; avoid `any`.
- Prefer `const` and early returns.
- Keep functions focused.
- Avoid abstractions that only hide one simple operation.
- Use ESM imports with explicit `.js` extensions for local imports.
- Keep user-facing errors actionable.
- Add comments for security boundaries and non-obvious browser behavior, not obvious code.

## Tests

Tests should exercise the actual implementation.

When adding extraction behavior, test:

- normal pages;
- missing metadata;
- responsive changes;
- unusual but valid CSS values;
- pages with delayed resources;
- malformed or hostile target-controlled strings;
- URL validation and filename handling.

Do not make tests depend on third-party production websites when a deterministic local fixture is sufficient.

## Changes

Use Conventional Commits:

```text
feat(scope): summary
fix(scope): summary
docs: summary
test(scope): summary
refactor(scope): summary
chore(scope): summary
```

Keep changes focused. If behavior changes, update tests and user-facing documentation in the same change.

## Generated output

Generated unbuild output is evidence, not executable source code.

When changing the output schema:

1. update the TypeScript types;
2. update extraction;
3. update reports;
4. update tests;
5. document the schema change in the README or release notes when user-visible.

## Release safety

Do not commit npm tokens or GitHub tokens.

The intended release path is GitHub Actions + npm Trusted Publishing/OIDC. Keep release permissions minimal and verify the package contents before publishing.

