import test from "node:test";
import assert from "node:assert/strict";
import { NameRegistry, pageName, safeName, sanitizeSegment } from "../dist/naming.js";
import { renderAggregateReport } from "../dist/report.js";

test("pageName derives a slug from the pathname only, never the origin", () => {
  assert.equal(pageName("https://example.com/"), "home");
  assert.equal(pageName("https://example.com/docs/getting-started"), "docs-getting-started");
});

test("NameRegistry prevents two different pages from colliding on the same filename", () => {
  const registry = new NameRegistry();
  const first = registry.take(pageName("https://example.com/"));
  const second = registry.take(pageName("https://example.com/home"));
  assert.equal(first, "home");
  assert.equal(second, "home-2");
  assert.notEqual(first, second);
});

test("safeName and sanitizeSegment strip protocol and collapse unsafe characters", () => {
  assert.equal(safeName("https://example.com/a path"), "example.com-a-path");
  assert.equal(sanitizeSegment("a//b??c"), "a-b-c");
});

test("renderAggregateReport evidence-file hint matches the real on-disk name across collisions", () => {
  const basePage = {
    url: "", title: "", description: null, lang: null,
    viewport: { width: 1440, height: 1000 }, document: { width: 1440, height: 1000 },
    visual: { background: "", color: "", fontFamily: "", density: "" },
    layout: { bodyWidth: 0, bodyHeight: 0, maxContentWidth: 0, horizontalOverflow: false, flexContainers: 0, gridContainers: 0, fixedElements: 0, stickyElements: 0 },
    tokens: { colors: {}, fonts: {}, fontSizes: {}, radii: {}, spacing: {}, shadows: {} },
    components: [], elements: [], landmarks: [], fonts: [], images: [], assetHints: [],
    cssVariables: [], links: [], controls: [], forms: [], headings: [], buttons: [],
    navigation: [], styleRules: { mediaQueries: [], keyframes: [], externalStylesheets: [] },
    interactionStates: [], motion: [], ariaSnapshot: "",
  };
  const home = { ...basePage, url: "https://example.com/" };
  const homeAlso = { ...basePage, url: "https://example.com/home" };
  const registry = new NameRegistry();
  const nameByUrl = new Map();
  for (const p of [home, homeAlso]) nameByUrl.set(p.url, registry.take(pageName(p.url)));
  const resolveName = (url) => nameByUrl.get(url) ?? pageName(url);

  const ai = renderAggregateReport([home, homeAlso], "https://example.com/", true, resolveName);
  assert.match(ai, /pages\/home\.json/);
  assert.match(ai, /pages\/home-2\.json/);
  assert.doesNotMatch(ai, /pages\/home\.json.*pages\/home\.json/s);
});
