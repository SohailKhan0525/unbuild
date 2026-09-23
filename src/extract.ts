import type { Page } from "playwright";

export interface TokenSet {
  colors: Record<string,number>;
  fonts: Record<string,number>;
  fontSizes: Record<string,number>;
  radii: Record<string,number>;
  spacing: Record<string,number>;
  shadows: Record<string,number>;
}

export interface ElementEvidence {
  selector:string; tag:string; id:string|null; classes:string[];
  role:string|null; name:string|null; text:string;
  href:string|null; placeholder:string|null; type:string|null;
  visible:boolean; rect:{x:number;y:number;width:number;height:number};
  styles:{
    display:string; position:string; zIndex:string; boxSizing:string;
    width:string; height:string; maxWidth:string; minHeight:string;
    margin:string; padding:string; gap:string;
    color:string; backgroundColor:string; backgroundImage:string;
    fontFamily:string; fontSize:string; fontWeight:string; lineHeight:string; letterSpacing:string;
    border:string; borderRadius:string; boxShadow:string;
    opacity:string; transform:string; overflow:string; cursor:string;
  };
}

export interface ComponentEvidence {
  tag:string; role:string|null; count:number;
  samples:Array<{text:string;classes:string[];rect:{width:number;height:number}}>;
}

export interface PageEvidence {
  url:string; title:string; description:string|null; lang:string|null;
  viewport:{width:number;height:number};
  document:{width:number;height:number};
  visual:{background:string;color:string;fontFamily:string;density:string};
  layout:{
    bodyWidth:number; bodyHeight:number; maxContentWidth:number; horizontalOverflow:boolean;
    flexContainers:number; gridContainers:number; fixedElements:number; stickyElements:number;
  };
  tokens:TokenSet;
  components:ComponentEvidence[];
  elements:ElementEvidence[];
  landmarks:Array<{tag:string;role:string|null;name:string|null;selector:string;rect:{x:number;y:number;width:number;height:number}}>;
  fonts:Array<{family:string;weight:string;style:string;source:string}>;
  images:Array<{src:string;alt:string;width:number;height:number}>;
  assetHints:Array<{source:string;type:"image"|"icon"|"font"|"stylesheet"|"media"|"manifest";alt?:string;width?:number;height?:number}>;
  headings:Array<{level:number;text:string;selector:string;width:number;height:number}>;
  cssVariables:Array<{name:string;value:string}>;
  styleRules:{mediaQueries:string[];keyframes:string[];externalStylesheets:string[]};
  links:Array<{text:string;href:string;external:boolean;selector:string}>;
  controls:Array<{tag:string;type:string|null;text:string;aria:string|null;selector:string;rect:{width:number;height:number}}>;
  buttons:Array<{text:string;aria:string|null;type:string|null;variant:string;selector:string;rect:{width:number;height:number};styles:Pick<ElementEvidence["styles"],"color"|"backgroundColor"|"border"|"borderRadius"|"boxShadow"|"fontSize"|"fontWeight"|"padding"|"height">}>;
  forms:Array<{method:string;action:string;selector:string;fields:Array<{tag:string;type:string|null;name:string|null;label:string|null;placeholder:string|null;required:boolean}>}>;
  navigation:Array<{selector:string;items:string[]}>;
  interactionStates:Array<{selector:string;text:string;state:"hover"|"focus";changed:boolean;before:Record<string,string>;after:Record<string,string>}>;
  motion:Array<{selector:string;property:string;duration:string;timing:string;animation:string}>;
  ariaSnapshot:string;
}

const stateKeys=["color","backgroundColor","borderColor","boxShadow","transform","opacity","outline","outlineColor","outlineWidth"] as const;
type StateStyle=Record<string,string>;

export async function extractPage(page:Page,url:string,options:{interactions?:boolean}={}):Promise<PageEvidence>{
  const base=await page.evaluate((url)=>{
    const count=(map:Record<string,number>,value:string|null|undefined)=>{if(!value)return;map[value]=(map[value]??0)+1};
    const round=(n:number)=>Math.round(n*100)/100;
    const rect=(el:Element)=>{const r=el.getBoundingClientRect();return{x:round(r.x),y:round(r.y),width:round(r.width),height:round(r.height)}};
    const visible=(el:Element,s:CSSStyleDeclaration)=>{const r=el.getBoundingClientRect();return r.width>0&&r.height>0&&s.display!=="none"&&s.visibility!=="hidden"&&Number(s.opacity)!==0};
    const selectorFor=(el:Element)=>{
      const parts:string[]=[];let current:Element|null=el;
      while(current&&current!==document.documentElement){
        const h=current as HTMLElement;
        if(h.id&&document.querySelectorAll("#"+CSS.escape(h.id)).length===1){parts.unshift("#"+CSS.escape(h.id));break}
        let part=current.tagName.toLowerCase();
        const classes=Array.from(current.classList).filter(x=>/^[a-zA-Z_][\\w-]*$/.test(x)).slice(0,2);
        if(classes.length)part+="."+classes.map(CSS.escape).join(".");
        const parent:HTMLElement|null=current.parentElement;
        if(parent){const same=Array.from(parent.children).filter((x:Element)=>x.tagName===current!.tagName);if(same.length>1)part+=":nth-of-type("+(same.indexOf(current)+1)+")"}
        parts.unshift(part);current=parent;
      }
      return parts.join(" > ")||el.tagName.toLowerCase();
    };
    const styleSnapshot=(s:CSSStyleDeclaration)=>{
      const border=[s.borderTopWidth,s.borderTopStyle,s.borderTopColor].join(" ");
      return {
        display:s.display,position:s.position,zIndex:s.zIndex,boxSizing:s.boxSizing,width:s.width,height:s.height,maxWidth:s.maxWidth,minHeight:s.minHeight,
        margin:[s.marginTop,s.marginRight,s.marginBottom,s.marginLeft].join(" "),padding:[s.paddingTop,s.paddingRight,s.paddingBottom,s.paddingLeft].join(" "),gap:s.gap,
        color:s.color,backgroundColor:s.backgroundColor,backgroundImage:s.backgroundImage,
        fontFamily:s.fontFamily,fontSize:s.fontSize,fontWeight:s.fontWeight,lineHeight:s.lineHeight,letterSpacing:s.letterSpacing,
        border, borderRadius:s.borderRadius,boxShadow:s.boxShadow,opacity:s.opacity,transform:s.transform,overflow:s.overflow,cursor:s.cursor
      };
    };
    const els=Array.from(document.querySelectorAll("*")) as HTMLElement[];
    const colors:Record<string,number>={},fontCounts:Record<string,number>={},fontSizes:Record<string,number>={},radii:Record<string,number>={},spacing:Record<string,number>={},shadows:Record<string,number>={};
    const motion:Array<{selector:string;property:string;duration:string;timing:string;animation:string}>=[];

    for(const el of els){
      const s=getComputedStyle(el);
      count(colors,s.color);count(colors,s.backgroundColor);count(colors,s.borderTopColor);
      count(fontCounts,s.fontFamily);count(fontSizes,s.fontSize);count(radii,s.borderRadius);count(shadows,s.boxShadow);
      for(const v of [s.marginTop,s.marginRight,s.marginBottom,s.marginLeft,s.paddingTop,s.paddingRight,s.paddingBottom,s.paddingLeft,s.gap])count(spacing,v);
      if(s.transitionDuration!=="0s"||s.animationDuration!=="0s")motion.push({selector:selectorFor(el),property:s.transitionProperty,duration:s.transitionDuration,timing:s.transitionTimingFunction,animation:s.animationName});
    }

    const elements=els.filter(el=>visible(el,getComputedStyle(el))).slice(0,700).map(el=>{
      const s=getComputedStyle(el);const r=rect(el);
      return {
        selector:selectorFor(el),tag:el.tagName.toLowerCase(),id:el.id||null,classes:Array.from(el.classList).slice(0,20),
        role:el.getAttribute("role"),name:el.getAttribute("aria-label")||el.getAttribute("title"),
        text:(el.innerText||"").replace(/\\s+/g," ").trim().slice(0,240),
        href:(el as HTMLAnchorElement).href||null,placeholder:el.getAttribute("placeholder"),type:el.getAttribute("type"),
        visible:true,rect:r,styles:styleSnapshot(s)
      };
    });

    const componentTags=["button","a","input","textarea","select","nav","header","footer","form","dialog","details","summary","article","section","main","aside"];
    const components=componentTags.map(tag=>{
      const found=Array.from(document.querySelectorAll(tag)) as HTMLElement[];
      return {tag,role:found[0]?.getAttribute("role")??null,count:found.length,samples:found.slice(0,8).map(x=>({text:(x.innerText||x.getAttribute("aria-label")||"").replace(/\\s+/g," ").trim().slice(0,160),classes:Array.from(x.classList).slice(0,12),rect:{width:round(x.getBoundingClientRect().width),height:round(x.getBoundingClientRect().height)}}))};
    }).filter(x=>x.count);

    const landmarks=Array.from(document.querySelectorAll("header,nav,main,aside,footer,form,article,section,[role]")).filter(el=>visible(el,getComputedStyle(el))).slice(0,250).map(el=>({
      tag:el.tagName.toLowerCase(),role:el.getAttribute("role"),name:el.getAttribute("aria-label")||el.getAttribute("aria-labelledby"),selector:selectorFor(el),rect:rect(el)
    }));

    const fonts:Array<{family:string;weight:string;style:string;source:string}>=[];document.fonts.forEach(f=>fonts.push({family:f.family,weight:f.weight,style:f.style,source:"document.fonts"}));
    const images=Array.from(document.images).map(i=>({src:i.currentSrc||i.src,alt:i.alt,width:i.naturalWidth,height:i.naturalHeight})).filter(x=>x.src);

    const assetHints:PageEvidence["assetHints"]=[];
    const addAsset=(source:string,type:PageEvidence["assetHints"][number]["type"],extra:Partial<PageEvidence["assetHints"][number]>={})=>{
      if(!source||source.startsWith("data:")||assetHints.some(x=>x.source===source))return;
      assetHints.push({source,type,...extra});
    };
    for(const image of images)addAsset(image.src,"image",{alt:image.alt,width:image.width,height:image.height});
    for(const link of Array.from(document.querySelectorAll("link[href]"))){
      const rel=(link.getAttribute("rel")||"").toLowerCase();const href=new URL(link.getAttribute("href")!,location.href).href;
      if(rel.includes("icon")||rel.includes("apple-touch-icon")||rel.includes("mask-icon"))addAsset(href,"icon");
      else if(rel.includes("stylesheet"))addAsset(href,"stylesheet");
      else if(rel.includes("manifest"))addAsset(href,"manifest");
      else if(rel.includes("preload")){const as=link.getAttribute("as");if(as==="font")addAsset(href,"font");if(as==="image")addAsset(href,"image")}
    }
    for(const el of els){const bg=getComputedStyle(el).backgroundImage;for(const match of bg.matchAll(/url\\(["']?([^"')]+)["']?\\)/g)){try{addAsset(new URL(match[1],location.href).href,"image")}catch{}}}
    for(const media of Array.from(document.querySelectorAll("video,audio"))){
      const src=(media as HTMLMediaElement).currentSrc||(media as HTMLMediaElement).src;if(src)addAsset(src,"media");
      const poster=(media as HTMLVideoElement).poster;if(poster)try{addAsset(new URL(poster,location.href).href,"image")}catch{}
    }

    const headings=Array.from(document.querySelectorAll("h1,h2,h3,h4,h5,h6")).map(h=>{const r=h.getBoundingClientRect();return{level:Number(h.tagName.slice(1)),text:(h.textContent||"").replace(/\\s+/g," ").trim().slice(0,180),selector:selectorFor(h),width:round(r.width),height:round(r.height)}});

    const cssVariables:Array<{name:string;value:string}>=[];const seenVars=new Set<string>();
    for(const style of [getComputedStyle(document.documentElement),getComputedStyle(document.body)]){
      for(let i=0;i<style.length;i++){const name=style[i];if(name.startsWith("--")&&!seenVars.has(name)){seenVars.add(name);cssVariables.push({name,value:style.getPropertyValue(name).trim()})}}
    }

    const styleRules={mediaQueries:[] as string[],keyframes:[] as string[],externalStylesheets:Array.from(document.querySelectorAll('link[rel~="stylesheet"]')).map(x=>new URL((x as HTMLLinkElement).href,location.href).href)};
    for(const sheet of Array.from(document.styleSheets)){try{for(const rule of Array.from(sheet.cssRules||[])){if(rule.type===CSSRule.MEDIA_RULE)styleRules.mediaQueries.push((rule as CSSMediaRule).conditionText);if(rule.type===CSSRule.KEYFRAMES_RULE)styleRules.keyframes.push((rule as CSSKeyframesRule).name)}}catch{}}
    styleRules.mediaQueries=[...new Set(styleRules.mediaQueries)];styleRules.keyframes=[...new Set(styleRules.keyframes)];

    const links=Array.from(document.querySelectorAll("a")).map(a=>({text:(a.innerText||a.getAttribute("aria-label")||"").replace(/\\s+/g," ").trim().slice(0,200),href:(a as HTMLAnchorElement).href,external:new URL((a as HTMLAnchorElement).href,location.href).origin!==location.origin,selector:selectorFor(a)}));
    const controls=Array.from(document.querySelectorAll("button,input,textarea,select,[role='button']")).filter(el=>visible(el,getComputedStyle(el))).map(x=>({tag:x.tagName.toLowerCase(),type:x.getAttribute("type"),text:(x as HTMLElement).innerText?.replace(/\\s+/g," ").trim().slice(0,120)??"",aria:x.getAttribute("aria-label"),selector:selectorFor(x),rect:{width:round(x.getBoundingClientRect().width),height:round(x.getBoundingClientRect().height)}}));

    const buttonStyles=["color","backgroundColor","border","borderRadius","boxShadow","fontSize","fontWeight","padding","height"] as const;
    const buttons=Array.from(document.querySelectorAll("button,[role='button']")).filter(el=>visible(el,getComputedStyle(el))).map(x=>{
      const s=getComputedStyle(x);const variant=s.backgroundColor!=="rgba(0, 0, 0, 0)"&&s.backgroundColor!=="transparent"?"filled":s.borderStyle!=="none"?"outlined":"text";
      const styles={color:s.color,backgroundColor:s.backgroundColor,border:s.border,borderRadius:s.borderRadius,boxShadow:s.boxShadow,fontSize:s.fontSize,fontWeight:s.fontWeight,padding:[s.paddingTop,s.paddingRight,s.paddingBottom,s.paddingLeft].join(" "),height:s.height};
      return{text:((x as HTMLElement).innerText||"").replace(/\\s+/g," ").trim().slice(0,160),aria:x.getAttribute("aria-label"),type:x.getAttribute("type"),variant,selector:selectorFor(x),rect:{width:round(x.getBoundingClientRect().width),height:round(x.getBoundingClientRect().height)},styles};
    });

    const labelFor=(el:Element)=>{const id=el.getAttribute("id");if(id){const label=document.querySelector('label[for="'+CSS.escape(id)+'"]');if(label)return(label.textContent||"").replace(/\\s+/g," ").trim().slice(0,160)}const parent=el.closest("label");return parent?(parent.textContent||"").replace(/\\s+/g," ").trim().slice(0,160):null};
    const forms=Array.from(document.forms).map(form=>({
      method:(form.method||"get").toUpperCase(),action:(form.action||location.href),selector:selectorFor(form),
      fields:Array.from(form.elements).filter(x=>x instanceof HTMLElement).map(x=>({tag:x.tagName.toLowerCase(),type:x.getAttribute("type"),name:x.getAttribute("name"),label:labelFor(x),placeholder:x.getAttribute("placeholder"),required:(x as HTMLInputElement).required}))
    }));

    const navigation=Array.from(document.querySelectorAll("nav,[role='navigation']")).map(nav=>({selector:selectorFor(nav),items:Array.from(nav.querySelectorAll("a,button")).map(x=>((x as HTMLElement).innerText||x.getAttribute("aria-label")||"").replace(/\\s+/g," ").trim()).filter(Boolean).slice(0,80)}));

    const root=document.documentElement,body=document.body,rootStyle=getComputedStyle(root),bodyStyle=getComputedStyle(body);
    const flexContainers=els.filter(x=>getComputedStyle(x).display.includes("flex")).length;
    const gridContainers=els.filter(x=>getComputedStyle(x).display.includes("grid")).length;
    const fixedElements=els.filter(x=>getComputedStyle(x).position==="fixed").length;
    const stickyElements=els.filter(x=>getComputedStyle(x).position==="sticky").length;
    const bodyRect=body.getBoundingClientRect();
    const background=bodyStyle.backgroundColor!=="rgba(0, 0, 0, 0)"?bodyStyle.backgroundColor:rootStyle.backgroundColor;
    const text=bodyStyle.color;
    const fontFamily=bodyStyle.fontFamily;
    const density=els.length>1800?"dense":els.length>700?"medium":"sparse";
    return {
      url,title:document.title,description:document.querySelector('meta[name="description"]')?.getAttribute("content")??null,lang:root.lang||null,
      viewport:{width:innerWidth,height:innerHeight},document:{width:root.scrollWidth,height:root.scrollHeight},
      visual:{background,color:text,fontFamily,density},
      layout:{bodyWidth:round(bodyRect.width),bodyHeight:round(bodyRect.height),maxContentWidth:Math.max(...els.map(e=>e.getBoundingClientRect().width).filter(Number.isFinite),0),horizontalOverflow:root.scrollWidth>innerWidth+1,flexContainers,gridContainers,fixedElements,stickyElements},
      tokens:{colors,fonts:fontCounts,fontSizes,radii,spacing,shadows},components,elements,landmarks,fonts,images,assetHints,headings,cssVariables,styleRules,links,controls,buttons,forms,navigation,interactionStates:[] as PageEvidence["interactionStates"],motion
    };
  },url);

  const ariaSnapshot=await page.ariaSnapshot({mode:"ai",boxes:true,timeout:5000}).catch(()=> "");
  let interactionStates:PageEvidence["interactionStates"]=[];
  if(options.interactions!==false){
    const candidates=await page.locator("a,button,input,textarea,select,[role='button'],summary,[tabindex]").all();
    for(const locator of candidates.slice(0,18)){
      try{
        if(!(await locator.isVisible()))continue;
        const selector=await locator.evaluate(el=>{
          const e=el as HTMLElement;const id=e.id;if(id)return "#"+CSS.escape(id);
          const parts:string[]=[];let cur:Element|null=e;
          while(cur&&cur!==document.documentElement){let p=cur.tagName.toLowerCase();const parent=cur.parentElement;if(parent){const same=Array.from(parent.children).filter(x=>x.tagName===cur!.tagName);if(same.length>1)p+=":nth-of-type("+(same.indexOf(cur)+1)+")"}parts.unshift(p);cur=parent;if(parts.length>5)break}
          return parts.join(" > ");
        });
        const styles=()=>locator.evaluate(el=>{const s=getComputedStyle(el);return Object.fromEntries(["color","backgroundColor","borderColor","boxShadow","transform","opacity","outline","outlineColor","outlineWidth"].map(k=>[k,s.getPropertyValue(k)])) as Record<string,string>});
        const text=await locator.evaluate(el=>((el as HTMLElement).innerText||el.getAttribute("aria-label")||el.getAttribute("placeholder")||"").replace(/\\s+/g," ").trim().slice(0,120));
        const beforeHover=await styles();let changedHover=false;let afterHover=beforeHover;
        try{await locator.hover({timeout:1200});await page.waitForTimeout(60);afterHover=await styles();changedHover=JSON.stringify(beforeHover)!==JSON.stringify(afterHover)}catch{}
        if(changedHover)interactionStates.push({selector,text,state:"hover",changed:true,before:beforeHover,after:afterHover});
        await locator.focus({timeout:1200});await page.waitForTimeout(40);const beforeFocus=afterHover;const afterFocus=await styles();
        const changedFocus=JSON.stringify(beforeFocus)!==JSON.stringify(afterFocus);
        if(changedFocus)interactionStates.push({selector,text,state:"focus",changed:true,before:beforeFocus,after:afterFocus});
        await locator.blur({timeout:1200}).catch(()=>{});
      }catch{}
    }
  }

  return {...base,interactionStates,ariaSnapshot};
}
