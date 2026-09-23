# unbuild

**Deconstruct a rendered website into an evidence-backed design system for humans and coding agents.**

[![npm](https://img.shields.io/npm/v/%40agent-qofeno%2Funbuild?style=flat-square)](https://www.npmjs.com/package/@agent-qofeno/unbuild)
[![CI](https://img.shields.io/github/actions/workflow/status/SohailKhan0525/unbuild/ci.yml?branch=main&style=flat-square&label=CI)](https://github.com/SohailKhan0525/unbuild/actions/workflows/ci.yml)
[![License](https://img.shields.io/badge/license-MIT-blue?style=flat-square)](./LICENSE)

unbuild renders a public website in Chromium and **unbuilds what the browser can actually observe**: layout, typography, colors, spacing, radii, shadows, components, responsive behavior, motion evidence, links, controls, images, fonts, and screenshots.

The result is a local, structured reference that can be inspected by a developer or handed directly to **OpenCode, Claude Code, Codex, Gemini CLI, Cursor, and other coding agents**.

## Cross-platform support

unbuild is a Node.js CLI with platform-neutral extraction code.

- **Windows, macOS, Linux:** use Playwright's managed Chromium or an installed Chromium/Chrome/Edge binary.
- **Linux ARM64/ARMv7 and other architectures:** use a compatible installed Chromium binary with `--browser` when Playwright's managed browser is unavailable.
- **Android / Termux:** Node.js can run in Termux, but Playwright's bundled desktop Chromium is not an Android host browser. Use `--cdp` to connect unbuild to a Chromium-compatible browser exposing the Chrome DevTools Protocol.
- **Other Unix-like environments:** use `--browser` or `--cdp` when a managed Playwright browser is unavailable.

The npm package installs the Playwright Chromium browser during package installation on supported desktop platforms. If browser installation is intentionally skipped or unavailable, use `--browser` with an installed Chromium/Chrome/Edge binary or `--cdp` with an existing Chromium browser. Android / Termux uses CDP rather than the bundled desktop browser. The CLI also keeps browser initialization lazy so `unbuild --help` works on Android even though Playwright does not recognize Android as a local browser-host platform.

## Install

Run it without installing globally:

```bash
npx @agent-qofeno/unbuild https://www.example.com
```

The package installs the matching Playwright Chromium browser as part of `npm install`, so the normal `npx` and global-install flows do not require a separate `npx playwright install` step.

Or install it:

```bash
npm install -g @agent-qofeno/unbuild
unbuild https://www.example.com
```

## Usage

```text
unbuild <url> [options]

Options:
  -o, --output <dir>    Output directory (default: ./unbuild-output)
  --timeout <ms>        Browser timeout
  --pages <n>           Maximum same-origin pages
  --browser <path>      Use an installed Chromium/Chrome/Edge executable
  --cdp <url>           Connect to an existing Chromium browser over CDP
  --no-headless         Show Chromium while analyzing
  -h, --help            Show help
```

Examples:

```bash
npx @agent-qofeno/unbuild https://www.turbostarter.dev -o ./unbuild-output
```

With an installed browser:

```bash
unbuild https://www.example.com --browser /path/to/chromium
```

With a CDP browser:

```bash
unbuild https://www.example.com --cdp http://127.0.0.1:9222
```

### Android / Termux

Android is the one platform where the browser engine needs special handling.

A practical Android setup is:

1. Install Node.js and npm in Termux.
2. Install `@agent-qofeno/unbuild`.
3. Run or expose a Chromium-compatible browser with a Chrome DevTools Protocol endpoint.
4. Run:
```bash
npx @agent-qofeno/unbuild https://www.example.com --cdp http://127.0.0.1:9222
```

The CDP endpoint can be local, ADB-forwarded, or provided by a remote browser service. The exact Android browser setup varies by device and ROM; unbuild does not require Android-specific native code. On Android/Termux, `--cdp` is required for an actual run; `--browser` is not a substitute for a browser that Playwright can launch natively.

## What it produces

A typical run produces:

```text
unbuild-output/
├── README.md
├── AI.md
├── DESIGN.md
├── evidence/
│   ├── pages.json
│   └── all-pages.json
├── pages/
│   └── *.json
├── responsive/
│   ├── desktop-*.json
│   ├── tablet-*.json
│   └── mobile-*.json
├── screenshots/
│   ├── desktop/
│   ├── tablet/
│   └── mobile/
├── tokens/
│   └── tokens.json
├── components/
│   └── components.json
├── assets/
│   ├── manifest.json
│   ├── images/
│   ├── icons/
│   ├── fonts/
│   └── styles/
├── motion/
│   └── summary.json
└── ux/
    └── summary.json
```

The exact files may grow as extraction capabilities expand.

### Evidence hierarchy

When reconstructing a site from an unbuild package:

1. **Screenshots** are the visual source of truth.
2. **Responsive evidence** describes observed viewport behavior.
3. **JSON evidence** contains measured browser values.
4. **Markdown reports** explain the evidence and reconstruction intent.
5. **Inference** should only be used when the evidence does not directly answer a question.

Do not treat a frequency count as proof of a design token. Repeated values are evidence of reuse, not proof of the original implementation.

## What unbuild observes

### Visual system

- rendered colors
- font families and font metadata exposed by the browser
- font sizes
- border radii
- spacing values
- shadows
- document and content dimensions
- screenshots at desktop, tablet, and mobile viewports

### Structure

- common semantic HTML elements
- links and external links
- form controls
- navigation/header/footer/form/dialog evidence
- classes and representative text samples
- document language metadata
- image URLs, dimensions, and alt text
- browser-delivered image, icon, font, stylesheet, media, and manifest assets saved locally under `assets/`
- asset manifest mapping every captured resource to its source URL and page usage
- heading hierarchy, component geometry, navigation structure, forms, focus evidence, and CSS custom properties

### Responsive behavior

Each configured viewport is rendered independently. The output records measurements and screenshots for:

- desktop: 1440×1000
- tablet: 1024×1000
- mobile: 390×844

These are observation points, not claims about the site's original breakpoint values.

### Motion

unbuild records observable CSS transition and animation metadata exposed by computed styles.

### Assets

The browser network is observed while pages render. Image, icon, font, stylesheet, media, and manifest responses are captured into `assets/` when they are available and within the safety/size budget. `assets/manifest.json` records the original URL, local path, content type, size, status, and pages where the resource was observed. It does not claim to recover every JavaScript-driven interaction or animation.

## What unbuild does not do

unbuild intentionally does **not** attempt to:

- recover private source repositories
- bypass authentication
- access databases or APIs as an authenticated user
- discover secrets
- reproduce server-side business logic
- claim that inferred implementation details are exact
- bypass a site's access controls
- guarantee pixel identity across machines, browsers, fonts, or dynamic content

Only analyze sites you are authorized to analyze and respect the target site's terms, access controls, robots policies, and applicable law.

## Security

unbuild is a browser-based network client. The URL you provide is loaded by a local Chromium process, and the target page can cause Chromium to make additional network requests for resources such as images, fonts, scripts, stylesheets, and APIs.

This matters because arbitrary URL fetching can become an SSRF and local-network access risk.

For that reason:

- Do not run unbuild against untrusted URLs in a privileged network environment.
- Do not assume the browser is a security sandbox.
- Do not provide credentials, client certificates, or private network access to the browser.
- Run unbuild inside a container or isolated environment when analyzing untrusted targets.
- Treat generated output as untrusted data; pages can contain attacker-controlled text, URLs, filenames, and metadata.
- Never execute generated files or agent instructions without reviewing them.

See [SECURITY.md](./SECURITY.md) for the threat model and vulnerability reporting process.

## Development

Requirements:

- Node.js 22.14+
- npm
- Chromium installed by the Playwright browser dependency, or an installed Chromium-compatible browser

Install dependencies:

```bash
npm install
```

If browser installation is intentionally skipped, install Chromium separately with `npx playwright install chromium`, or use `--browser` / `--cdp`.

Verify the repository:

```bash
npm run check
npm test
```

Build the package:

```bash
npm run build
```

## Working with coding agents

The repository includes [AGENTS.md](./AGENTS.md) with project-specific instructions for OpenCode and other agents.

The intended workflow is:

```text
website
  ↓
Chromium
  ↓
rendered evidence
  ↓
structured JSON + screenshots
  ↓
AI.md / DESIGN.md
  ↓
coding agent
  ↓
new implementation
```

An agent should reconstruct the **design language and observable interaction model**, not copy the target site's proprietary implementation or content.

## Releases

Releases use Conventional Commits and semantic-release.

Examples:

```text
feat: add breakpoint discovery
fix: handle pages with delayed fonts
docs: improve security guidance
refactor: simplify extraction pipeline
test: cover responsive evidence
```

The release workflow publishes through npm Trusted Publishing/OIDC rather than a long-lived npm publish token.

See [CONTRIBUTING.md](./CONTRIBUTING.md) for release and contribution rules.

## Contributing

Bug fixes, tests, extraction improvements, documentation, and security hardening are welcome.

Please read [CONTRIBUTING.md](./CONTRIBUTING.md) before opening an issue or pull request.

## License

MIT. See [LICENSE](./LICENSE).
