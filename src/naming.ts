/**
 * Single source of truth for turning URLs / arbitrary strings into
 * filesystem-safe segments. Every module that writes an output filename
 * derived from a URL must go through these helpers instead of re-implementing
 * its own sanitizer — divergent copies previously caused generated docs
 * (AI.md/DESIGN.md) to reference filenames that did not match what was
 * actually written to disk.
 */

/** Collapse anything unsafe for a filename into single dashes and trim. */
export function sanitizeSegment(value: string, maxLength = 80): string {
  return value
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, maxLength);
}

/**
 * Guarantees every name handed out is unique within a run by appending
 * "-2", "-3", ... on collision.
 */
export class NameRegistry {
  private readonly used = new Set<string>();
  take(base: string): string {
    if (!this.used.has(base)) {
      this.used.add(base);
      return base;
    }
    let n = 2;
    while (this.used.has(`${base}-${n}`)) n++;
    const name = `${base}-${n}`;
    this.used.add(name);
    return name;
  }
}

/** Site-level slug used for default output directory naming, e.g. "example.com". */
export function safeName(value: string): string {
  return sanitizeSegment(value.replace(/^https?:\/\//, ""), 80) || "site";
}

/**
 * Page-level slug derived from a URL's pathname only.
 * Any code that documents or references a per-page filename MUST call this
 * function rather than re-deriving the slug.
 */
export function pageName(url: string): string {
  const { pathname } = new URL(url);
  const path = sanitizeSegment(pathname.replace(/^\/|\/$/g, ""), 100);
  return path || "home";
}
