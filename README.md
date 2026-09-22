# unbuild

**Reverse-engineer a rendered website into an AI-ready design reference.**

unbuild takes a public HTTP(S) URL, renders it in a real Chromium browser, measures the rendered interface, captures responsive screenshots, and writes the observed design evidence into a local folder.

## Install

```bash
npx @agent-qofeno/unbuild https://example.com
```

## Output

The generated folder contains screenshots, measured design tokens, component evidence, responsive measurements, motion evidence, and Markdown instructions intended for coding agents such as Claude Code, Codex, Gemini CLI, and Cursor.

## What unbuild means

unbuild does not claim to recover a site's private source code. It reconstructs what can be observed from the rendered public interface: visual tokens, layout, typography, component structure, responsive behavior, interaction evidence, assets, and motion.

## Development

```bash
npm install
npx playwright install chromium
npm run check
npm run build
```

## Publishing

The package is configured for GitHub Actions + npm trusted publishing. Configure the npm trusted publisher for this repository and the `.github/workflows/publish.yml` workflow before the first release.

## License

MIT
