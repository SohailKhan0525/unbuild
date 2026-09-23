import test from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { extractPage } from "../dist/extract.js";

test("extractPage captures frontend reconstruction evidence", async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await page.setContent(`<!doctype html>
      <html lang="en">
        <head>
          <meta name="description" content="Fixture">
          <style>
            :root { --brand: rgb(10, 20, 30); }
            body { margin: 0; font-family: Inter, sans-serif; color: rgb(20,20,20); }
            .hero { display: grid; gap: 16px; padding: 32px; }
            button { color: white; background: rgb(10, 20, 30); border: 0; padding: 12px 20px; border-radius: 8px; transition: background-color 120ms ease; }
            button:hover { background: rgb(30, 40, 50); }
            input:focus { outline: 2px solid rgb(255, 0, 0); }
          </style>
          <link rel="icon" href="https://example.com/favicon.ico">
        </head>
        <body>
          <header><nav><a href="/">Home</a><a href="/docs">Docs</a></nav></header>
          <main>
            <section class="hero">
              <h1>Rebuild the interface</h1>
              <p>Rendered evidence fixture.</p>
              <form action="/signup" method="post">
                <label>Email <input name="email" type="email" placeholder="you@example.com" required></label>
                <button type="submit">Get started</button>
              </form>
            </section>
          </main>
          <footer>Footer</footer>
        </body>
      </html>`, { waitUntil: "load" });

    const evidence = await extractPage(page, "https://example.com/", { interactions: true });

    assert.equal(evidence.title, "");
    assert.equal(evidence.lang, "en");
    assert.equal(evidence.viewport.width, 1280);
    assert.ok(evidence.elements.length > 0);
    assert.ok(evidence.headings.some((h) => h.text === "Rebuild the interface"));
    assert.ok(evidence.forms.length === 1);
    assert.ok(evidence.buttons.some((b) => b.text === "Get started"));
    assert.ok(evidence.assetHints.some((a) => a.type === "icon" && a.source === "https://example.com/favicon.ico"));
    assert.ok(evidence.cssVariables.some((v) => v.name === "--brand"));
    assert.ok(evidence.styleRules.keyframes.length === 0);
    assert.ok(evidence.styleRules.mediaQueries.length === 0);
    assert.ok(evidence.ariaSnapshot.includes("heading"));
    assert.ok(evidence.interactionStates.some((s) => s.state === "hover" && s.changed));
    assert.ok(evidence.interactionStates.some((s) => s.state === "focus" && s.changed));
  } finally {
    await browser.close();
  }
});
