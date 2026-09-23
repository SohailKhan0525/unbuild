import type { PageEvidence } from "./extract.js";

const top=(m:Record<string,number>,n=16,filter:(value:string)=>boolean=()=>true)=>
  Object.entries(m).filter(([k])=>filter(k)).sort((a,b)=>b[1]-a[1]).slice(0,n);
const esc=(v:string)=>v.replace(/\\/g,"\\\\").replace(/\|/g,"/");
const pageSummary=(p:PageEvidence)=>[
  "### "+(p.title||p.url),"",
  "- URL: "+p.url,
  "- Viewport: "+p.viewport.width+"×"+p.viewport.height,
  "- Document: "+p.document.width+"×"+p.document.height,
  "- Body: "+p.layout.bodyWidth+"×"+p.layout.bodyHeight,
  "- Background: "+p.visual.background,
  "- Text: "+p.visual.color,
  "- Font: "+p.visual.fontFamily,
  "- Density: "+p.visual.density,
  "- Flex / grid: "+p.layout.flexContainers+" / "+p.layout.gridContainers,
  "- Fixed / sticky: "+p.layout.fixedElements+" / "+p.layout.stickyElements,
  "- Horizontal overflow: "+(p.layout.horizontalOverflow?"yes":"no"),""
];

function componentRows(pages:PageEvidence[]){
  const map=new Map<string,{count:number;example:string}>();
  for(const p of pages)for(const c of p.components){
    const key=c.tag+"|"+(c.role||"");
    const v=map.get(key)||{count:0,example:c.samples[0]?.text||""};v.count+=c.count;if(!v.example)v.example=c.samples[0]?.text||"";map.set(key,v);
  }
  return [...map.entries()].sort((a,b)=>b[1].count-a[1].count).slice(0,80).map(([k,v])=>{const [tag,role]=k.split("|");return"| "+tag+" | "+(role||"—")+" | "+v.count+" | "+esc(v.example||"—")+" |"});
}

function tokenSection(lines:string[],title:string,map:Record<string,number>,limit:number,prefix=""){
  lines.push("","## "+title,"");for(const [k,v] of top(map,limit))lines.push("- "+prefix+k+" — observed "+v+"×");
}

export function aggregateTokenEvidence(pages:PageEvidence[]){
  const result={
    version:2,
    colors:{} as Record<string,number>,
    fonts:{} as Record<string,number>,
    fontSizes:{} as Record<string,number>,
    radii:{} as Record<string,number>,
    spacing:{} as Record<string,number>,
    shadows:{} as Record<string,number>,
    cssVariables:{} as Record<string,string>
  };
  const add=(target:Record<string,number>,key:string)=>{
    if(!key)return;
    target[key]=(target[key]??0)+1;
  };
  for(const page of pages){
    for(const [k,v] of Object.entries(page.tokens.colors))if(k!=="transparent"&&!/^rgba?\\(0, 0, 0, 0\\)$/.test(k))result.colors[k]=(result.colors[k]??0)+v;
    for(const [k,v] of Object.entries(page.tokens.fonts))result.fonts[k]=(result.fonts[k]??0)+v;
    for(const [k,v] of Object.entries(page.tokens.fontSizes))result.fontSizes[k]=(result.fontSizes[k]??0)+v;
    for(const [k,v] of Object.entries(page.tokens.radii))if(k!=="0px")result.radii[k]=(result.radii[k]??0)+v;
    for(const [k,v] of Object.entries(page.tokens.spacing))if(!["0px","normal","auto"].includes(k))result.spacing[k]=(result.spacing[k]??0)+v;
    for(const [k,v] of Object.entries(page.tokens.shadows))if(k!=="none")result.shadows[k]=(result.shadows[k]??0)+v;
    for(const variable of page.cssVariables)result.cssVariables[variable.name]=variable.value;
  }
  return result;
}

export function renderReport(d:PageEvidence,ai=false):string{
  const lines:string[]=[];
  lines.push("# Unbuild — "+(ai?"AI Reconstruction Brief":"Visual Design & UX Evidence"),"","Source: "+d.url,"Viewport: "+d.viewport.width+"×"+d.viewport.height,"Title: "+(d.title||"—"),"");
  if(ai)lines.push("## Reconstruction contract","","Recreate the rendered experience, not the original source code. Treat screenshots as visual truth, HTML as structural truth, computed element records as geometry/style truth, captured assets as reusable source files, and ARIA evidence as interaction/semantics truth. Prefer measured values over inference. Never invent missing assets, breakpoints, states, or tokens.","");
  else lines.push("## Visual summary","",...pageSummary(d),"## Evidence sources","", "- Full rendered HTML: pages/*.html","- Measured DOM/style evidence: pages/*.json","- AI accessibility tree: accessibility/*.yml","- Browser-delivered assets: assets/","- Responsive screenshots/evidence: screenshots/ and responsive/","- Interaction state evidence: ux/interaction-states.json",
    "- Interaction state screenshots: ux/states/",
    "- Automated accessibility findings: accessibility/axe-*.json",
    "- Parsed CSS inventory: styles/inventory.json","");

  lines.push("## Page anatomy","");
  for(const h of d.headings.slice(0,100))lines.push("- H"+h.level+" "+(h.text||"—")+" — "+h.selector+" — "+h.width+"×"+h.height);
  if(!d.headings.length)lines.push("- No headings captured.");

  lines.push("","## Landmarks","");
  for(const x of d.landmarks.slice(0,120))lines.push("- "+x.tag+" "+(x.role||"")+" — "+(x.name||"")+" — "+x.selector+" — "+x.rect.width+"×"+x.rect.height);

  lines.push("","## Components","");
  for(const c of d.components)lines.push("- "+c.tag+" — "+(c.role||"")+" — "+c.count+" observed — "+(c.samples[0]?.text||""));
  lines.push("","## Buttons","");
  for(const b of d.buttons.slice(0,80))lines.push("- "+(b.text||b.aria||"unnamed")+" — "+b.variant+" — "+b.rect.width+"×"+b.rect.height+" — "+b.selector);

  lines.push("","## Forms","");
  for(const f of d.forms)lines.push("- "+f.method+" "+f.action+" — "+f.selector+" — fields: "+f.fields.map(x=>x.label||x.name||x.placeholder||x.type||x.tag).join(", "));
  if(!d.forms.length)lines.push("- No HTML forms detected.");

  lines.push("","## Assets observed","");
  for(const a of d.assetHints.slice(0,160))lines.push("- "+a.type+" — "+a.source);
  if(!d.assetHints.length)lines.push("- No DOM asset hints captured.");

  tokenSection(lines,"Typography",d.tokens.fonts,20);
  tokenSection(lines,"Type scale",d.tokens.fontSizes,22);
  tokenSection(lines,"Colors",d.tokens.colors,28);
  tokenSection(lines,"Spacing",d.tokens.spacing,24);
  tokenSection(lines,"Radii",d.tokens.radii,18,"radius ");
  tokenSection(lines,"Shadows",d.tokens.shadows,18,"shadow ");

  lines.push("","## CSS variables");for(const x of d.cssVariables.slice(0,160))lines.push("- "+x.name+" = "+x.value);if(!d.cssVariables.length)lines.push("- None captured.");
  lines.push("","## Responsive rules observed","- Media queries: "+(d.styleRules.mediaQueries.join(" | ")||"none captured"),"- Keyframes: "+(d.styleRules.keyframes.join(" | ")||"none captured"),"- External stylesheets: "+d.styleRules.externalStylesheets.length);
  lines.push("","## Interaction states");for(const x of d.interactionStates)lines.push("- "+x.state+" — "+x.text+" — "+x.selector+" — changed: "+x.changed);if(!d.interactionStates.length)lines.push("- No state delta was observed on sampled interactive elements.");
  lines.push("","## Motion");for(const x of d.motion.slice(0,160))lines.push("- "+x.selector+" — "+x.property+" — "+x.duration+" — "+x.timing+" — "+x.animation+(x.source?" — "+x.source:"")+(x.delay?" — delay "+x.delay:"")+(x.iterations?" — iterations "+x.iterations:""));if(!d.motion.length)lines.push("- No transition, CSS animation, or Web Animations API activity was observed at capture time.");
  lines.push("","## Accessibility","", "The accessibility tree is stored separately so an agent can reconstruct semantic structure without guessing from pixels.","");
  return lines.join("\n");
}

export function renderAggregateReport(pages:PageEvidence[],source:string,ai=false):string{
  if(!pages.length)return"# Unbuild\n\nNo pages were successfully analyzed.\n";
  const color:Record<string,number>={},font:Record<string,number>={},size:Record<string,number>={},radius:Record<string,number>={},space:Record<string,number>={},shadow:Record<string,number>={};
  const vars=new Map<string,string>(),assets=new Set<string>(),media=new Set<string>(),keyframes=new Set<string>();
  let links=0,controls=0,forms=0,images=0,elements=0;
  for(const p of pages){
    for(const [k,v] of Object.entries(p.tokens.colors))color[k]=(color[k]??0)+v;
    for(const [k,v] of Object.entries(p.tokens.fonts))font[k]=(font[k]??0)+v;
    for(const [k,v] of Object.entries(p.tokens.fontSizes))size[k]=(size[k]??0)+v;
    for(const [k,v] of Object.entries(p.tokens.radii))radius[k]=(radius[k]??0)+v;
    for(const [k,v] of Object.entries(p.tokens.spacing))space[k]=(space[k]??0)+v;
    for(const [k,v] of Object.entries(p.tokens.shadows))shadow[k]=(shadow[k]??0)+v;
    for(const x of p.cssVariables)vars.set(x.name,x.value);
    for(const x of p.assetHints)assets.add(x.source);
    for(const x of p.styleRules.mediaQueries)media.add(x);
    for(const x of p.styleRules.keyframes)keyframes.add(x);
    links+=p.links.length;controls+=p.controls.length;forms+=p.forms.length;images+=p.images.length;elements+=p.elements.length;
  }
  const lines:string[]=[];
  lines.push("# Unbuild — "+(ai?"AI Reconstruction Brief":"Design System & UX Specification"),"","Source: "+source,"Pages analyzed: "+pages.length,"Visible measured elements: "+elements,"Images observed: "+images,"Asset URLs observed: "+assets.size,"");
  if(ai)lines.push("## Agent build order","","1. Open screenshots/desktop first and compare tablet/mobile screenshots for structural changes.",
    "2. Read DESIGN.md for the measured visual system and use it as the visual contract.",
    "3. Read pages/*.html to inspect the rendered DOM, text, links and source structure.",
    "4. Read pages/*.json for measured geometry, computed styles, components, tokens, images and asset hints.",
    "5. Read accessibility/*.yml to preserve landmarks, roles and accessible names.",
    "6. Read responsive/*.json to reproduce viewport-specific layout changes instead of guessing breakpoints.",
    "7. Open assets/manifest.json, then reuse the captured local files from assets/ rather than hotlinking the source site.",
    "8. Read ux/interaction-states.json and reproduce only state changes that were actually observed.",
    "9. Read motion/summary.json; Web Animations API records include runtime timing/keyframe evidence when available.",
    "10. Validate the rebuilt page at 1440×1000, 1024×1000 and 390×844 against the supplied screenshots.",
    "11. Treat missing evidence as unknown/inferred. Do not invent hidden implementation details.","");
  else lines.push("## Overview","","This report is a measured reconstruction reference. It separates visual design facts from implementation guidance so an agent can build a new frontend while preserving the observed UI/UX.","");

  lines.push("## Page index","");
  for(const p of pages){
    lines.push(...pageSummary(p));
    if(ai){
      lines.push("- Reconstruction focus: preserve the measured document dimensions, landmark hierarchy, typography, asset choices, responsive geometry and observed interaction/motion states.");
      lines.push("- Evidence files: pages/"+p.url.replace(/[^a-zA-Z0-9._-]+/g,"-").slice(0,100)+".json is generated per route; use the actual filenames in the pages/ directory.");
    }
  }
  lines.push("## Component inventory","","| Tag | Role | Count | Example |","|---|---|---:|---|",...componentRows(pages));
  tokenSection(lines,"Colors",color,30);
  tokenSection(lines,"Typography",font,22);
  tokenSection(lines,"Type scale",size,22);
  tokenSection(lines,"Spacing",space,26);
  tokenSection(lines,"Radii",radius,18,"radius ");
  tokenSection(lines,"Shadows",shadow,18,"shadow ");
  lines.push("","## CSS variables");for(const [k,v] of [...vars.entries()].sort())lines.push("- "+k+" = "+v);if(!vars.size)lines.push("- None captured.");
  lines.push("","## Responsive CSS evidence","- Media queries: "+([...media].join(" | ")||"none captured"),"- Keyframes: "+([...keyframes].join(" | ")||"none captured"));
  lines.push("","## UX surface","- Forms: "+forms,"- Controls: "+controls,"- Links: "+links,"- Images: "+images,"- Interaction deltas: "+pages.reduce((n,p)=>n+p.interactionStates.length,0));
  const stateScreenshots=pages.reduce((n,p)=>n+p.interactionStates.filter(x=>(x as PageEvidence["interactionStates"][number]&{screenshot?:string}).screenshot).length,0);
  lines.push("- Interaction state screenshots: "+stateScreenshots);
  lines.push("","## Asset reconstruction","", "Use assets/manifest.json as the authoritative local asset map. It records source URL, local path, type, byte size, content type, page references and capture status.");
  lines.push("","## Evidence hierarchy","","1. Screenshots and component screenshots — visual geometry and appearance.","2. Rendered HTML — structure and content.","3. Computed element JSON — dimensions, typography, color, spacing, borders, shadows and positioning.","4. ARIA snapshot — semantic hierarchy and accessible names.","5. Captured assets and stylesheets — reusable visual source material.","6. Markdown synthesis — human/agent guidance.","","Observed values are evidence of the rendered result; they do not claim to reveal the original application's source implementation.","");
  return lines.join("\n");
}
