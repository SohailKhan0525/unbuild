import { lookup } from "node:dns/promises";
import { BlockList } from "node:net";
import type { Page } from "playwright";

const blocked = new BlockList();
for (const [subnet, prefix] of [
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8],
  ["169.254.0.0", 16], ["172.16.0.0", 12], ["192.0.0.0", 24], ["192.0.2.0", 24],
  ["192.168.0.0", 16], ["198.18.0.0", 15], ["198.51.100.0", 24], ["203.0.113.0", 24],
  ["224.0.0.0", 4], ["240.0.0.0", 4]
] as const) blocked.addSubnet(subnet, prefix, "ipv4");
for (const [subnet, prefix] of [
  ["::", 128], ["::1", 128], ["fc00::", 7], ["fe80::", 10], ["ff00::", 8], ["2001:db8::", 32]
] as const) blocked.addSubnet(subnet, prefix, "ipv6");

function isBlockedIp(address: string): boolean {
  const family = address.includes(":") ? "ipv6" : "ipv4";
  return blocked.check(address, family);
}

export async function assertPublicUrl(input: URL): Promise<void> {
  if (!["http:", "https:"].includes(input.protocol)) throw new Error("Only HTTP(S) URLs are supported.");
  if (input.username || input.password) throw new Error("URLs containing credentials are not supported.");
  const hostname = input.hostname.toLowerCase().replace(/\.$/, "");
  if (!hostname || hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".local")) {
    throw new Error("Local hostnames are blocked by default.");
  }
  if (/^\d+$/.test(hostname) || hostname.includes("%")) throw new Error("Non-standard hostnames are not supported.");
  if (isBlockedIp(hostname)) throw new Error("Private or special-use IP addresses are blocked by default.");
  const addresses = await lookup(hostname, { all: true, verbatim: true });
  if (!addresses.length || addresses.some((entry) => isBlockedIp(entry.address))) {
    throw new Error("The target resolves to a private or special-use network address.");
  }
}

export async function discoverUrls(page: Page, root: URL, limit: number, timeout = 30000): Promise<string[]> {
  await assertPublicUrl(root);
  const seen = new Set<string>();
  const queue = [root.toString()];
  while (queue.length && seen.size < limit) {
    const current = queue.shift()!;
    if (seen.has(current)) continue;
    const currentUrl = new URL(current);
    await assertPublicUrl(currentUrl);
    seen.add(current);
    await page.goto(current, { waitUntil: "domcontentloaded", timeout }).catch(() => {});
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
        if (!u.pathname.endsWith("/") && /\.(pdf|zip|png|jpe?g|gif|svg|webp|avif|mp4|webm|mp3|css|js)$/i.test(u.pathname)) continue;
        await assertPublicUrl(u);
        const normalized = u.toString();
        if (!seen.has(normalized) && !queue.includes(normalized)) queue.push(normalized);
      } catch {}
    }
  }
  return [...seen];
}
