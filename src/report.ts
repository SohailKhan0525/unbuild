import type { PageEvidence } from "./extract.js";

const top=(m:Record<string,number>,n=12)=>Object.entries(m).sort((a,b)=>b[1]-a[1]).slice(0,n);

export function renderReport(d:PageEvidence,ai=false):string{
  const lines:string[]=[];
  lines.push("# Unbuild — Design Reconstruction","",`Source: ${d.url}`,"");
  lines.push("## Scope","",ai
    ?"Use this folder as measured evidence for reconstructing a new interface. Prefer the JSON evidence and screenshots over guesses. Preserve the design language, not the source site's content, branding, business logic, or copy."
    :"This report describes the observable visual and interaction system of the rendered page. Measurements come from the browser rather than source-code assumptions.","");
  lines.push("## Typography","");
  for(const [v,c] of top(d.tokens.fonts)) lines.push(`- ${v} — ${c} observed elements`);
  lines.push("","## Colors","");
  for(const [v,c] of top(d.tokens.colors)) lines.push(`- ${v} — ${c} observations`);
  lines.push("","## Type scale","");
  for(const [v,c] of top(d.tokens.fontSizes)) lines.push(`- ${v} — ${c} observations`);
  lines.push("","## Radius","");
  for(const [v,c] of top(d.tokens.radii)) lines.push(`- ${v} — ${c} observations`);
  lines.push("","## Spacing","");
  for(const [v,c] of top(d.tokens.spacing)) lines.push(`- ${v} — ${c} observations`);
  lines.push("","## Components","");
  for(const c of d.components) lines.push(`- ${c.tag}: ${c.count}`);
  lines.push("","## Interaction and motion evidence","");
  for(const m of d.motion.slice(0,30)) lines.push(`- ${m.selector}: ${m.property}, ${m.duration}, ${m.timing}`);
  lines.push("","## Responsive evidence",`- Base document: ${d.document.width}×${d.document.height}`,`- Horizontal overflow detected: ${d.layout.horizontalOverflow ? "yes" : "no"}`);
  lines.push("","## Accessibility / semantics",`- Language: ${d.lang ?? "not declared"}`,`- Links: ${d.links.length}`,`- Interactive controls: ${d.controls.length}`);
  return lines.join("\n");
}

export function renderAggregateReport(pages:PageEvidence[],source:string,ai=false):string{
  if(!pages.length) return `# Unbuild\\n\\nNo pages were successfully analyzed.\\n`;
  const color:Record<string,number>={},font:Record<string,number>={},size:Record<string,number>={},radius:Record<string,number>={},space:Record<string,number>={};
  const components=new Map<string,number>();
  let links=0,controls=0;
  for(const p of pages){
    for(const [k,v] of Object.entries(p.tokens.colors)) color[k]=(color[k]??0)+v;
    for(const [k,v] of Object.entries(p.tokens.fonts)) font[k]=(font[k]??0)+v;
    for(const [k,v] of Object.entries(p.tokens.fontSizes)) size[k]=(size[k]??0)+v;
    for(const [k,v] of Object.entries(p.tokens.radii)) radius[k]=(radius[k]??0)+v;
    for(const [k,v] of Object.entries(p.tokens.spacing)) space[k]=(space[k]??0)+v;
    for(const c of p.components) components.set(c.tag,(components.get(c.tag)??0)+c.count);
    links+=p.links.length; controls+=p.controls.length;
  }
  const lines=[ "# Unbuild — Design System Reconstruction","",`Source: ${source}`,`Pages analyzed: ${pages.length}`,"",
    "## What this is", "",
    ai ? "This is the recovered design language of the rendered site. Reuse the measurable system and interaction patterns; do not reproduce the original site's content, copy, business logic, or branding." : "Measurements below are aggregated from the rendered pages and should be treated as observable evidence.",
    "","## Typography"];
  for(const [k,v] of top(font)) lines.push(`- ${k} — ${v}`);
  lines.push("","## Colors"); for(const [k,v] of top(color)) lines.push(`- ${k} — ${v}`);
  lines.push("","## Type scale"); for(const [k,v] of top(size)) lines.push(`- ${k} — ${v}`);
  lines.push("","## Radius"); for(const [k,v] of top(radius)) lines.push(`- ${k} — ${v}`);
  lines.push("","## Spacing"); for(const [k,v] of top(space)) lines.push(`- ${k} — ${v}`);
  lines.push("","## Component evidence"); for(const [k,v] of [...components.entries()].sort((a,b)=>b[1]-a[1])) lines.push(`- ${k}: ${v}`);
  lines.push("","## Interaction surface",`- Links observed: ${links}`,`- Controls observed: ${controls}`);
  lines.push("","## Source-of-truth rule","Prefer screenshots for visual appearance, JSON evidence for measurements, and responsive files for breakpoint behavior.");
  return lines.join("\n");
}
