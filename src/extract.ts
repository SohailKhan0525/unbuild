import type { Page } from "playwright";

export interface TokenSet {
  colors: Record<string,number>;
  fonts: Record<string,number>;
  fontSizes: Record<string,number>;
  radii: Record<string,number>;
  spacing: Record<string,number>;
  shadows: Record<string,number>;
}
export interface ComponentEvidence { tag:string; role:string|null; count:number; samples:Array<{text:string;classes:string[]}>; }
export interface PageEvidence {
  url:string; title:string; description:string|null; lang:string|null;
  document:{width:number;height:number};
  layout:{bodyWidth:number;bodyHeight:number;maxContentWidth:number;horizontalOverflow:boolean};
  tokens:TokenSet;
  components:ComponentEvidence[];
  fonts:Array<{family:string;weight:string;style:string;source:string}>;
  images:Array<{src:string;alt:string;width:number;height:number}>;
  links:Array<{text:string;href:string;external:boolean}>;
  controls:Array<{tag:string;type:string|null;text:string;aria:string|null}>;
  motion:Array<{selector:string;property:string;duration:string;timing:string}>;
}

export async function extractPage(page:Page,url:string):Promise<PageEvidence>{
  return page.evaluate((url)=>{
    const count=(map:Record<string,number>,value:string|null)=>{if(!value)return;map[value]=(map[value]??0)+1};
    const els=Array.from(document.querySelectorAll("*")) as HTMLElement[];
    const colors:Record<string,number>={},fonts:Record<string,number>={},fontSizes:Record<string,number>={},radii:Record<string,number>={},spacing:Record<string,number>={},shadows:Record<string,number>={};
    const motion:Array<{selector:string;property:string;duration:string;timing:string}>=[];
    for(const el of els){
      const s=getComputedStyle(el);
      count(colors,s.color); count(colors,s.backgroundColor); count(colors,s.borderTopColor);
      count(fonts,s.fontFamily); count(fontSizes,s.fontSize); count(radii,s.borderRadius);
      for(const v of [s.marginTop,s.marginRight,s.marginBottom,s.marginLeft,s.paddingTop,s.paddingRight,s.paddingBottom,s.paddingLeft,s.gap]) count(spacing,v);
      count(shadows,s.boxShadow);
      if(s.transitionDuration!=="0s"||s.animationDuration!=="0s") motion.push({selector:el.tagName.toLowerCase()+(el.id?"#"+el.id:""),property:s.transitionProperty,duration:s.transitionDuration,timing:s.transitionTimingFunction});
    }
    const componentTags=["button","a","input","textarea","select","nav","header","footer","form","dialog","details","summary","article","section"];
    const components=componentTags.map(tag=>{
      const found=Array.from(document.querySelectorAll(tag)) as HTMLElement[];
      return {tag,role:found[0]?.getAttribute("role")??null,count:found.length,samples:found.slice(0,8).map(x=>({text:(x.innerText||x.getAttribute("aria-label")||"").trim().slice(0,160),classes:Array.from(x.classList).slice(0,12)}))};
    }).filter(x=>x.count);
    const fonts=Array.from(document.fonts).map(f=>({family:f.family,weight:f.weight,style:f.style,source:"document.fonts"}));
    const images=Array.from(document.images).map(i=>({src:i.currentSrc||i.src,alt:i.alt,width:i.naturalWidth,height:i.naturalHeight})).filter(x=>x.src);
    const links=Array.from(document.querySelectorAll("a")).map(a=>({text:(a.innerText||a.getAttribute("aria-label")||"").trim().slice(0,200),href:(a as HTMLAnchorElement).href,external:new URL((a as HTMLAnchorElement).href,location.href).origin!==location.origin}));
    const controls=Array.from(document.querySelectorAll("button,input,textarea,select")).map(x=>({tag:x.tagName.toLowerCase(),type:x.getAttribute("type"),text:(x as HTMLElement).innerText?.trim().slice(0,120)??"",aria:x.getAttribute("aria-label")}));
    const root=document.documentElement;
    return {
      url,title:document.title,description:document.querySelector('meta[name="description"]')?.getAttribute("content")??null,
      lang:root.lang||null,document:{width:root.scrollWidth,height:root.scrollHeight},
      layout:{bodyWidth:document.body.getBoundingClientRect().width,bodyHeight:document.body.getBoundingClientRect().height,maxContentWidth:Math.max(...els.map(e=>e.getBoundingClientRect().width).filter(Number.isFinite),0),horizontalOverflow:root.scrollWidth>innerWidth+1},
      tokens:{colors,fonts,fontSizes,radii,spacing,shadows},components,fonts,images,links,controls,motion
    };
  },url);
}