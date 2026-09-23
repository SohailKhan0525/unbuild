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
  assetHints:Array<{source:string;kind:"image"|"icon"|"font"|"stylesheet"|"media"|"manifest";alt?:string;width?:number;height?:number}>;
  headings:Array<{level:number;text:string;selector:string;width:number;height:number}>;
  cssVariables:Array<{name:string;value:string}>;
  links:Array<{text:string;href:string;external:boolean}>;
  controls:Array<{tag:string;type:string|null;text:string;aria:string|null}>;
  motion:Array<{selector:string;property:string;duration:string;timing:string}>;
}

export async function extractPage(page:Page,url:string):Promise<PageEvidence>{
  return page.evaluate((url)=>{
    const count=(map:Record<string,number>,value:string|null)=>{if(!value)return;map[value]=(map[value]??0)+1};
    const els=Array.from(document.querySelectorAll("*")) as HTMLElement[];
    const colors:Record<string,number>={},fontCounts:Record<string,number>={},fontSizes:Record<string,number>={},radii:Record<string,number>={},spacing:Record<string,number>={},shadows:Record<string,number>={};
    const motion:Array<{selector:string;property:string;duration:string;timing:string}>=[];
    for(const el of els){
      const s=getComputedStyle(el);
      count(colors,s.color); count(colors,s.backgroundColor); count(colors,s.borderTopColor);
      count(fontCounts,s.fontFamily); count(fontSizes,s.fontSize); count(radii,s.borderRadius);
      for(const v of [s.marginTop,s.marginRight,s.marginBottom,s.marginLeft,s.paddingTop,s.paddingRight,s.paddingBottom,s.paddingLeft,s.gap]) count(spacing,v);
      count(shadows,s.boxShadow);
      if(s.transitionDuration!=="0s"||s.animationDuration!=="0s") motion.push({selector:el.tagName.toLowerCase()+(el.id?"#"+el.id:""),property:s.transitionProperty,duration:s.transitionDuration,timing:s.transitionTimingFunction});
    }
    const componentTags=["button","a","input","textarea","select","nav","header","footer","form","dialog","details","summary","article","section"];
    const components=componentTags.map(tag=>{
      const found=Array.from(document.querySelectorAll(tag)) as HTMLElement[];
      return {tag,role:found[0]?.getAttribute("role")??null,count:found.length,samples:found.slice(0,8).map(x=>({text:(x.innerText||x.getAttribute("aria-label")||"").trim().slice(0,160),classes:Array.from(x.classList).slice(0,12)}))};
    }).filter(x=>x.count);
    const fonts:Array<{family:string;weight:string;style:string;source:string}>=[]; document.fonts.forEach((f)=>fonts.push({family:f.family,weight:f.weight,style:f.style,source:"document.fonts"}));
    const images=Array.from(document.images).map(i=>({src:i.currentSrc||i.src,alt:i.alt,width:i.naturalWidth,height:i.naturalHeight})).filter(x=>x.src);
    const assetHints:PageEvidence["assetHints"]=[];
    const addAsset=(source:string,kind:PageEvidence["assetHints"][number]["kind"],extra:Partial<PageEvidence["assetHints"][number]>={})=>{
      if(!source||source.startsWith("data:")||assetHints.some(x=>x.source===source)) return;
      assetHints.push({source,kind,...extra});
    };
    for(const image of images) addAsset(image.src,"image",{alt:image.alt,width:image.width,height:image.height});
    for(const link of Array.from(document.querySelectorAll("link[href]"))){
      const rel=(link.getAttribute("rel")||"").toLowerCase();
      const href=new URL(link.getAttribute("href")!,location.href).href;
      if(rel.includes("icon")||rel.includes("apple-touch-icon")||rel.includes("mask-icon")) addAsset(href,"icon");
      else if(rel.includes("stylesheet")) addAsset(href,"stylesheet");
      else if(rel.includes("manifest")) addAsset(href,"manifest");
      else if(rel.includes("preload")){
        const as=link.getAttribute("as");
        if(as==="font") addAsset(href,"font");
        if(as==="image") addAsset(href,"image");
      }
    }
    for(const el of els){
      const bg=getComputedStyle(el).backgroundImage;
      for(const match of bg.matchAll(/url\(["']?([^"')]+)["']?\)/g)){
        try{addAsset(new URL(match[1],location.href).href,"image")}catch{}
      }
    }
    for(const media of Array.from(document.querySelectorAll("video,audio"))){
      const src=(media as HTMLMediaElement).currentSrc||(media as HTMLMediaElement).src;
      if(src) addAsset(src,"media");
      const poster=(media as HTMLVideoElement).poster;
      if(poster) addAsset(new URL(poster,location.href).href,"image");
    }
    const headings=Array.from(document.querySelectorAll("h1,h2,h3,h4,h5,h6")).map(h=>{
      const r=(h as HTMLElement).getBoundingClientRect();
      return {level:Number(h.tagName.slice(1)),text:(h.textContent||"").replace(/\s+/g," ").trim().slice(0,180),selector:h.tagName.toLowerCase(),width:Math.round(r.width),height:Math.round(r.height)};
    });
    const cssVariables:Array<{name:string;value:string}>=[];
    for(const style of [getComputedStyle(document.documentElement),getComputedStyle(document.body)]){
      for(let i=0;i<style.length;i++){const name=style[i];if(name.startsWith("--")) cssVariables.push({name,value:style.getPropertyValue(name).trim()})}
    }
    const links=Array.from(document.querySelectorAll("a")).map(a=>({text:(a.innerText||a.getAttribute("aria-label")||"").trim().slice(0,200),href:(a as HTMLAnchorElement).href,external:new URL((a as HTMLAnchorElement).href,location.href).origin!==location.origin}));
    const controls=Array.from(document.querySelectorAll("button,input,textarea,select")).map(x=>({tag:x.tagName.toLowerCase(),type:x.getAttribute("type"),text:(x as HTMLElement).innerText?.trim().slice(0,120)??"",aria:x.getAttribute("aria-label")}));
    const root=document.documentElement;
    return {
      url,title:document.title,description:document.querySelector('meta[name="description"]')?.getAttribute("content")??null,
      lang:root.lang||null,document:{width:root.scrollWidth,height:root.scrollHeight},
      layout:{bodyWidth:document.body.getBoundingClientRect().width,bodyHeight:document.body.getBoundingClientRect().height,maxContentWidth:Math.max(...els.map(e=>e.getBoundingClientRect().width).filter(Number.isFinite),0),horizontalOverflow:root.scrollWidth>innerWidth+1},
      tokens:{colors,fonts:fontCounts,fontSizes,radii,spacing,shadows},components,fonts,images,assetHints,headings,cssVariables,links,controls,motion
    };
  },url);
}