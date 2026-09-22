import type { PageEvidence } from "./extract.js";

const top=(m:Record<string,number>,n=12)=>Object.entries(m).sort((a,b)=>b[1]-a[1]).slice(0,n);

export function renderReport(d:PageEvidence,ai=false):string{
  const lines:string[]=[];
  lines.push("# Unbuild — Design Reconstruction");
  lines.push("");
  lines.push(`Source: ${d.url}`);
  lines.push("");
  lines.push("## Scope");
  lines.push("");
  lines.push(ai
    ?"Use this folder as measured evidence for reconstructing a new interface. Prefer the JSON evidence and screenshots over guesses. Preserve the design language, not the source site's content, branding, business logic, or copy."
    :"This report describes the observable visual and interaction system of the rendered page. Measurements come from the browser rather than from source-code assumptions.");
  lines.push("");
  lines.push("## Typography");
  for(const [v,c] of top(d.tokens.fonts)) lines.push(`- ${v} — ${c} observed elements`);
  lines.push("");
  lines.push("## Colors");
  for(const [v,c] of top(d.tokens.colors)) lines.push(`- ${v} — ${c} observations`);
  lines.push("");
  lines.push("## Type scale");
  for(const [v,c] of top(d.tokens.fontSizes)) lines.push(`- ${v} — ${c} observations`);
  lines.push("");
  lines.push("## Radius");
  for(const [v,c] of top(d.tokens.radii)) lines.push(`- ${v} — ${c} observations`);
  lines.push("");
  lines.push("## Spacing");
  for(const [v,c] of top(d.tokens.spacing)) lines.push(`- ${v} — ${c} observations`);
  lines.push("");
  lines.push("## Components");
  for(const c of d.components) lines.push(`- ${c.tag}: ${c.count}`);
  lines.push("");
  lines.push("## Interaction and motion evidence");
  for(const m of d.motion.slice(0,30)) lines.push(`- ${m.selector}: ${m.property}, ${m.duration}, ${m.timing}`);
  lines.push("");
  lines.push("## Responsive evidence");
  lines.push(`- Base document: ${d.document.width}×${d.document.height}`);
  lines.push(`- Horizontal overflow detected: ${d.layout.horizontalOverflow ? "yes" : "no"}`);
  lines.push("");
  lines.push("## Accessibility / semantics");
  lines.push(`- Language: ${d.lang ?? "not declared"}`);
  lines.push(`- Links: ${d.links.length}`);
  lines.push(`- Interactive controls: ${d.controls.length}`);
  return lines.join("\n");
}