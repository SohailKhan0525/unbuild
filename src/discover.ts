import type { Page } from "playwright";

export async function discoverUrls(page: Page, root: URL, limit: number): Promise<string[]> {
  const seen = new Set<string>();
  const queue = [root.toString()];
  while (queue.length && seen.size < limit) {
    const current = queue.shift()!;
    if (seen.has(current)) continue;
    seen.add(current);
    await page.goto(current, { waitUntil: "domcontentloaded", timeout: 30000 }).catch(() => {});
    const links = await page.locator("a[href]").evaluateAll((nodes) =>
      nodes.map((node) => (node as HTMLAnchorElement).href)
    );
    for (const href of links) {
      if (seen.size + queue.length >= limit) break;
      try {
        const u = new URL(href);
        if (u.origin !== root.origin) continue;
        if (!["http:", "https:"].includes(u.protocol)) continue;
        u.hash = "";
        u.search = "";
        if (!/\/$/.test(u.pathname) && /\.(pdf|zip|png|jpe?g|gif|svg|webp|avif|mp4|webm|mp3|css|js)$/i.test(u.pathname)) continue;
        const normalized = u.toString();
        if (!seen.has(normalized) && !queue.includes(normalized)) queue.push(normalized);
      } catch {}
    }
  }
  return [...seen];
}
