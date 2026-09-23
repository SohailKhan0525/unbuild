import type { PageEvidence } from "./extract.js";

const top=(m:Record<string,number>,n=16)=>Object.entries(m).sort((a,b)=>b[1]-a[1]).slice(0,n);
function unique<T>(items:T[],key:(x:T)=>string){const seen=new Set<string>(),out:T[]=[];for(const item of items){const k=key(item);if(!seen.has(k)){seen.add(k);out.push(item)}}return out}
function componentRows(pages:PageEvidence[]){
  const map=new Map<string,{count:number;examples:string[]}>();
  for(const p of pages)for(const c of p.components){const key=c.tag+"|"+(c.role||"")+"|"+c.text.slice(0,60);const v=map.get(key)||{count:0,examples:[]};v.count++;if(c.text&&v.examples.length<2)v.examples.push(c.text);map.set(key,v)}
  return [...map.entries()].sort((a,b)=>b[1].count-a[1].count).slice(0,60).map(([key,v])=>{const [tag,role,text]=key.split("|");return"| "+tag+" | "+(role||"—")+" | "+v.count+" | "+(text||"—").replace(/\|/g,"/")+" |"})
}
function pageSummary(p:PageEvidence){
  return [
    "### "+(p.title||p.url),"",
    "- URL: "+p.url,
    "- Document: "+p.document.width+"×"+p.document.height,
    "- Captured viewport: "+p.viewport.width+"×"+p.viewport.height,
    "- Body: "+p.layout.bodyWidth+"×"+p.layout.bodyHeight,
    "- Most frequent observed color: "+(Object.entries(p.tokens.colors)[0]?.[0]||"—"),
    "- Horizontal overflow: "+(p.layout.horizontalOverflow?"yes":"no"),
    "- Flex containers: "+p.layout.flexContainers,
    "- Grid containers: "+p.layout.gridContainers,
    "- Fixed / sticky: "+p.layout.fixedElements+" / "+p.layout.stickyElements,
    ""
  ];
}

export function renderReport(d:PageEvidence,ai=false):string{
  const lines:string[]=[];
  lines.push("# Unbuild — "+(ai?"AI Reconstruction Brief":"Visual Design & UX Evidence"),"","Source: "+d.url,"Viewport: "+d.viewport.width+"×"+d.viewport.height,"Title: "+(d.title||"—"),"");
  if(ai)lines.push("## Reconstruction contract","","This file is the implementation-facing summary. Inspect the screenshots first, then use JSON measurements and captured assets. Preserve observed geometry, typography, spacing, hierarchy, component states, and responsive behavior. Do not invent a value when a measurement exists.","");
  else lines.push("## Visual summary","", "- Canvas: "+d.document.width+"×"+d.document.height,"- Body: "+d.layout.bodyWidth+"×"+d.layout.bodyHeight,"- Density: "+d.visual.density,"- Background: "+d.visual.background,"- Text: "+d.visual.color,"- Font: "+d.visual.fontFamily,"- Flex/grid: "+d.layout.flexContainers+" / "+d.layout.gridContainers,"");
  lines.push("## Page anatomy","");
  for(const h of d.headings.slice(0,60))lines.push("- H"+h.level+" "+h.text+" — "+h.selector+" — "+h.width+"×"+h.height);
  if(!d.headings.length)lines.push("- No headings captured.");
  lines.push("","## Navigation","");
  for(const n of d.navigation)lines.push("- "+n.selector+" — "+n.items.join(" · "));
  if(!d.navigation.length)lines.push("- No navigation landmark captured.");
  lines.push("","## Components","");
  for(const c of d.components.slice(0,80))lines.push("- "+c.tag+" — "+(c.role||"") +" — "+(c.text||"")+" — "+c.rect.width+"×"+c.rect.height);
  lines.push("","## Buttons / controls","");
  for(const b of d.buttons.slice(0,50))lines.push("- "+(b.text||b.aria||"unnamed")+" — "+b.variant+" — "+b.rect.width+"×"+b.rect.height);
  lines.push("","## Forms","");
  for(const f of d.forms)lines.push("- "+f.method+" "+(f.action||"same page")+" — "+f.fields.map(x=>x.label||x.name||x.type).join(", "));
  if(!d.forms.length)lines.push("- No HTML forms detected.");
  lines.push("","## Assets observed","");
  for(const a of d.assetHints.slice(0,120))lines.push("- "+a.kind+" — "+a.source);
  if(!d.assetHints.length)lines.push("- No DOM asset hints captured.");
  lines.push("","## Typography","");
  for(const [v,c] of top(d.tokens.fonts,18))lines.push("- "+v+" — "+c);
  lines.push("","## Colors");for(const [v,c] of top(d.tokens.colors,24))lines.push("- "+v+" — "+c);
  lines.push("","## Type scale");for(const [v,c] of top(d.tokens.fontSizes,18))lines.push("- "+v+" — "+c);
  lines.push("","## Spacing / radius / shadows");for(const [v,c] of top(d.tokens.spacing,20))lines.push("- spacing "+v+" — "+c);for(const [v,c] of top(d.tokens.radii,14))lines.push("- radius "+v+" — "+c);for(const [v,c] of top(d.tokens.shadows,14))lines.push("- shadow "+v+" — "+c);
  lines.push("","## CSS variables");for(const x of d.cssVariables.slice(0,100))lines.push("- "+x.name+" = "+x.value);if(!d.cssVariables.length)lines.push("- None captured.");
  lines.push("","## Motion");for(const m of d.motion.slice(0,50))lines.push("- "+m.selector+" — "+m.property+" — "+m.duration+" — "+m.timing);
  lines.push("","## Responsive","- Viewport-specific evidence is stored in responsive/.","- Screenshots are stored in screenshots/desktop, screenshots/tablet, and screenshots/mobile.");
  return lines.join("\n");
}

export function renderAggregateReport(pages:PageEvidence[],source:string,ai=false):string{
  if(!pages.length)return"# Unbuild\n\nNo pages were successfully analyzed.\n";
  const color:Record<string,number>={},font:Record<string,number>={},size:Record<string,number>={},radius:Record<string,number>={},space:Record<string,number>={},shadow:Record<string,number>={};
  const vars=new Map<string,string>(),assets=new Set<string>(),patterns=new Map<string,number>();
  let links=0,controls=0,forms=0,images=0;
  for(const p of pages){
    for(const [k,v] of Object.entries(p.tokens.colors))color[k]=(color[k]??0)+v;
    for(const [k,v] of Object.entries(p.tokens.fonts))font[k]=(font[k]??0)+v;
    for(const [k,v] of Object.entries(p.tokens.fontSizes))size[k]=(size[k]??0)+v;
    for(const [k,v] of Object.entries(p.tokens.radii))radius[k]=(radius[k]??0)+v;
    for(const [k,v] of Object.entries(p.tokens.spacing))space[k]=(space[k]??0)+v;
    for(const [k,v] of Object.entries(p.tokens.shadows))shadow[k]=(shadow[k]??0)+v;
    for(const x of p.cssVariables)vars.set(x.name,x.value);
    for(const x of p.assetHints)assets.add(x.source);
    for(const ptn of ["navigation","hero","cta","form","card-grid","dialog","accordion","tabs","search","table"]){
      const count=p.components.filter(c=>c.tag===ptn).length;
      if(count)patterns.set(ptn,(patterns.get(ptn)??0)+count);
    }
    links+=p.links.length;controls+=p.controls.length;forms+=p.forms.length;images+=p.images.length;
  }
  const lines:string[]=[];
  lines.push("# Unbuild — "+(ai?"AI Reconstruction Brief":"Design System & UX Specification"),"","Source: "+source,"Pages analyzed: "+pages.length,"Images observed: "+images,"Asset URLs observed: "+assets.size,"");
  if(ai)lines.push("## Agent workflow","","1. Inspect screenshots/desktop, screenshots/tablet, screenshots/mobile.",
    "2. Read DESIGN.md as the design-system specification.",
    "3. Read pages/*.json for measured DOM, geometry and tokens.",
    "4. Read responsive/*.json for viewport-specific behavior.",
    "5. Reuse captured files from assets/; assets/manifest.json maps local files to original URLs.",
    "6. Read ux/summary.json and motion/summary.json for interaction and motion evidence.",
    "7. Mark missing information as inference instead of fabricating source-level facts.","");
  else lines.push("## Overview","","This is the measured design-system and UX reference for the rendered site. It is intentionally different from the AI brief: this document describes the visual system; AI.md describes how to consume the evidence.","");
  lines.push("## Page index","");for(const p of pages)lines.push(...pageSummary(p));
  lines.push("## Colors","");for(const [k,v] of top(color,28))lines.push("- "+k+" — "+v);
  lines.push("","## Typography","");for(const [k,v] of top(font,20))lines.push("- "+k+" — "+v);
  lines.push("","## Type scale");for(const [k,v] of top(size,22))lines.push("- "+k+" — "+v);
  lines.push("","## Layout & spacing");for(const [k,v] of top(space,24))lines.push("- "+k+" — "+v);
  lines.push("","## Shapes & elevation");for(const [k,v] of top(radius,18))lines.push("- radius "+k+" — "+v);for(const [k,v] of top(shadow,18))lines.push("- shadow "+k+" — "+v);
  lines.push("","## CSS variables");for(const [k,v] of [...vars.entries()].sort())lines.push("- "+k+" = "+v);if(!vars.size)lines.push("- None captured.");
  lines.push("","## Component inventory","","| Tag | Role | Count | Example |","|---|---|---:|---|",...componentRows(pages));
  lines.push("","## UX surface","- Forms: "+forms,"- Controls: "+controls,"- Links: "+links);for(const [k,v] of [...patterns.entries()].sort((a,b)=>b[1]-a[1]))lines.push("- "+k+" — "+v);
  lines.push("","## Responsive evidence","- Viewports: "+unique(pages,p=>p.viewport.width+"×"+p.viewport.height).map(x=>x.width+"×"+x.height).join(", "),"- See responsive/*.json and screenshots/*.");
  lines.push("","## Assets","", "Browser-delivered assets are saved under assets/. Use assets/manifest.json to map source URLs, local paths, types, sizes and pages.", ...[...assets].slice(0,120).map(x=>"- "+x));
  lines.push("","## Evidence hierarchy","","Screenshots → captured assets → JSON measurements → markdown synthesis. Repeated values indicate observed reuse; they do not prove the original implementation's source tokens.","");
  return lines.join("\n");
}
