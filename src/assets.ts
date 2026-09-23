import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, extname, join } from "node:path";
import postcss from "postcss";
import type { Page, Request } from "playwright";
import { assertPublicUrl } from "./discover.js";

export interface AssetRecord {
  id:string; source:string; localPath:string|null;
  type:"image"|"icon"|"font"|"stylesheet"|"media"|"manifest";
  contentType:string|null; bytes:number; status:number; pages:string[];
  alt?:string; width?:number; height?:number; captured:boolean; reason?:string;
}
const MAX_ASSET_BYTES=20*1024*1024;
const MAX_TOTAL_BYTES=150*1024*1024;

function extensionFor(contentType:string,url:string):string{
  const existing=extname(url.split("?")[0].split("#")[0]);
  if(existing&&existing.length<=8)return existing.toLowerCase();
  const map:Record<string,string>={
    "image/png":".png","image/jpeg":".jpg","image/webp":".webp","image/gif":".gif","image/svg+xml":".svg","image/avif":".avif","image/x-icon":".ico","image/vnd.microsoft.icon":".ico",
    "font/woff":".woff","font/woff2":".woff2","font/ttf":".ttf","font/otf":".otf","application/font-woff":".woff",
    "text/css":".css","application/manifest+json":".webmanifest","application/json":".json","video/mp4":".mp4","video/webm":".webm","audio/mpeg":".mp3","audio/ogg":".ogg"
  };
  return map[contentType.split(";")[0].trim().toLowerCase()]??"";
}
function classify(request:Request,contentType:string):AssetRecord["type"]|null{
  const rt=request.resourceType(),mime=contentType.split(";")[0].trim().toLowerCase();
  if(rt==="image"||mime.startsWith("image/"))return "image";
  if(rt==="font"||mime.startsWith("font/")||mime.includes("woff"))return "font";
  if(rt==="stylesheet"||mime==="text/css")return "stylesheet";
  if(rt==="media"||mime.startsWith("video/")||mime.startsWith("audio/"))return "media";
  if(rt==="manifest"||mime.includes("manifest+json"))return "manifest";
  return null;
}
function assetId(url:string){return createHash("sha256").update(url).digest("hex").slice(0,16)}
function safeBase(url:string){try{return(basename(new URL(url).pathname)||"asset").replace(/[^a-zA-Z0-9._-]+/g,"-").slice(0,80)||"asset"}catch{return"asset"}}
function folderFor(type:AssetRecord["type"]){return type==="font"?"fonts":type==="stylesheet"?"styles":type==="icon"?"icons":type==="media"?"media":type==="manifest"?"manifests":"images"}
function classifyCssAsset(url:string,property?:string):AssetRecord["type"]{
  const value=url.split("#")[0].split("?")[0].toLowerCase();
  if(/\.(woff2?|ttf|otf|eot)$/.test(value)||/font|src/.test(property??""))return "font";
  if(/\.(mp4|webm|mov|mp3|wav|ogg|m4a)$/.test(value))return "media";
  if(/\.css$/.test(value))return "stylesheet";
  return "image";
}
function extractCssUrls(value:string):string[]{
  const urls:string[]=[];
  const re=/url\(\s*(?:"([^"]+)"|'([^']+)'|([^)]*?))\s*\)/gi;
  for(const match of value.matchAll(re)){
    const raw=(match[1]??match[2]??match[3]??"").trim();
    if(raw&&!/^data:|^blob:|^javascript:/i.test(raw))urls.push(raw);
  }
  return urls;
}

export class AssetCollector{
  private readonly output:string;private readonly progress?:(message:string)=>void;
  private readonly records=new Map<string,AssetRecord>();private readonly pending=new Set<Promise<void>>();private totalBytes=0;
  constructor(output:string,progress?:(message:string)=>void){this.output=output;this.progress=progress}
  attach(page:Page){
    page.on("requestfinished",request=>{const p=this.captureRequest(request);this.pending.add(p);void p.finally(()=>this.pending.delete(p))});
  }
  private async validate(url:string){try{const parsed=new URL(url);if(!/^https?:$/i.test(parsed.protocol))return null;await assertPublicUrl(parsed);return parsed}catch{return null}}
  async captureUrl(page:Page,url:string,pageUrl:string,type:AssetRecord["type"]="icon",alt?:string){
    const parsed=await this.validate(url);if(!parsed)return;
    const normalized=parsed.href;
    const old=this.records.get(normalized)||this.records.get(url);
    if(old?.captured){
        if(!old.pages.includes(pageUrl))old.pages.push(pageUrl);
        if(alt&&!old.alt)old.alt=alt;
        return;
      }
    try{
      const response=await page.request.get(normalized,{timeout:15000,failOnStatusCode:false,maxRedirects:0});
      const record:AssetRecord={id:assetId(normalized),source:normalized,localPath:null,type,contentType:response.headers()["content-type"]??null,bytes:0,status:response.status(),pages:[pageUrl],alt,captured:false};
      this.records.set(normalized,record);
      if(!response.ok()){record.reason="HTTP response was not successful";return}
      const body=await response.body();if(body.length>MAX_ASSET_BYTES||this.totalBytes+body.length>MAX_TOTAL_BYTES){record.reason=body.length>MAX_ASSET_BYTES?"asset exceeds size limit":"run asset budget exceeded";return}
      await this.persist(record,body);
    }catch(error){
      this.records.set(normalized,{id:assetId(normalized),source:normalized,localPath:null,type,contentType:null,bytes:0,status:0,pages:[pageUrl],alt,captured:false,reason:error instanceof Error?error.message:String(error)});
    }
  }
  private async captureRequest(request:Request){
    try{
      const response=await request.response();if(!response||response.status()<200||response.status()>=400)return;
      const contentType=await response.headerValue("content-type")??"";const type=classify(request,contentType);if(!type)return;
      const url=response.url();if(url.startsWith("data:"))return;
      const existing=this.records.get(url);if(existing?.captured)return;
      const record=existing??{id:assetId(url),source:url,localPath:null,type,contentType:contentType||null,bytes:0,status:response.status(),pages:[],captured:false};
      record.type=type;record.contentType=contentType||record.contentType;record.status=response.status();this.records.set(url,record);
      const size=await request.sizes(),expected=Number(size.responseBodySize||0);
      if(expected>MAX_ASSET_BYTES||this.totalBytes+expected>MAX_TOTAL_BYTES){record.reason=expected>MAX_ASSET_BYTES?"asset exceeds size limit":"run asset budget exceeded";return}
      const body=await response.body();if(body.length>MAX_ASSET_BYTES||this.totalBytes+body.length>MAX_TOTAL_BYTES){record.reason=body.length>MAX_ASSET_BYTES?"asset exceeds size limit":"run asset budget exceeded";return}
      await this.persist(record,body);
    }catch(error){
      const url=request.url();const record=this.records.get(url);if(record)record.reason=error instanceof Error?error.message:String(error);
    }
  }
  private async persist(record:AssetRecord,body:Buffer){
    const ext=extensionFor(record.contentType??"",record.source);const base=safeBase(record.source);const suffix=ext&&base.toLowerCase().endsWith(ext.toLowerCase())?"":ext;const relative=join("assets",folderFor(record.type),record.id+"-"+base+suffix);
    await mkdir(join(this.output,"assets",folderFor(record.type)),{recursive:true});await writeFile(join(this.output,relative),body);
    record.localPath=relative.replace(/\\/g,"/");record.bytes=body.length;record.captured=true;delete record.reason;this.totalBytes+=body.length;
    this.progress?.("Captured asset "+record.localPath+" ("+body.length+" bytes)");
  }
  async captureCssDependencies(page:Page,pageUrl:string):Promise<number>{
    let discovered=0;
    const stylesheets=[...this.records.values()].filter(x=>x.type==="stylesheet"&&x.captured&&x.localPath);
    for(const sheet of stylesheets){
      try{
        const css=await readFile(join(this.output,sheet.localPath!),"utf8");
        const root=postcss.parse(css,{from:"<captured-css>"});
        const found=new Map<string,AssetRecord["type"]>();
        const collect=(value:string,property?:string)=>{
          for(const raw of extractCssUrls(value)){
            try{
              const absolute=new URL(raw,sheet.source).href;
              found.set(absolute,classifyCssAsset(absolute,property));
            }catch{}
          }
        };
        root.walkDecls(decl=>collect(decl.value,decl.prop));
        root.walkAtRules(rule=>{
          if(rule.name.toLowerCase()==="import"){
            collect(rule.params,"@import");
            const quoted=rule.params.match(/^["']([^"']+)["']/);
            if(quoted){
              try{const absolute=new URL(quoted[1],sheet.source).href;found.set(absolute,"stylesheet")}catch{}
            }
          }else if(rule.name.toLowerCase()==="font-face"){
            collect(rule.toString(),"font-face");
          }
        });
        for(const [source,type] of found){
          const before=this.records.get(source);
          await this.captureUrl(page,source,pageUrl,type);
          const after=this.records.get(source);
          if(!before&&after)discovered++;
        }
      }catch(error){
        this.progress?.("Could not parse captured stylesheet "+sheet.source+": "+(error instanceof Error?error.message:String(error)));
      }
    }
    return discovered;
  }

  addPage(url:string,assets:Array<{source:string;type:AssetRecord["type"];alt?:string;width?:number;height?:number}>){
    for(const asset of assets){if(!asset.source||asset.source.startsWith("data:"))continue;const record=this.records.get(asset.source);if(record){if(!record.pages.includes(url))record.pages.push(url);if(asset.alt&&!record.alt)record.alt=asset.alt;if(asset.width&&!record.width)record.width=asset.width;if(asset.height&&!record.height)record.height=asset.height}}
  }
  async flush(){while(this.pending.size)await Promise.all([...this.pending])}
  async writeStylesheetInventory(){
    const inventory:{version:number;stylesheets:Array<{
      source:string;localPath:string;bytes:number;selectors:string[];mediaQueries:string[];
      keyframes:string[];customProperties:Array<{name:string;value:string;selector:string|null}>;
      fontFaces:Array<Record<string,string>>;referencedAssets:string[];
    }>}={version:1,stylesheets:[]};
    for(const sheet of [...this.records.values()].filter(x=>x.type==="stylesheet"&&x.captured&&x.localPath)){
      try{
        const css=await readFile(join(this.output,sheet.localPath!),"utf8");
        const root=postcss.parse(css,{from:"<captured-css>"});
        const selectors:string[]=[];const mediaQueries:string[]=[];const keyframes:string[]=[];
        const customProperties:Array<{name:string;value:string;selector:string|null}>=[];
        const fontFaces:Array<Record<string,string>>=[];const referencedAssets:string[]=[];
        root.walkRules(rule=>{
          selectors.push(rule.selector);
          rule.walkDecls(decl=>{
            if(decl.prop.startsWith("--"))customProperties.push({name:decl.prop,value:decl.value,selector:rule.selector});
            for(const raw of extractCssUrls(decl.value)){
              try{referencedAssets.push(new URL(raw,sheet.source).href)}catch{}
            }
          });
        });
        root.walkAtRules(rule=>{
          const name=rule.name.toLowerCase();
          if(name==="media"||name==="supports"||name==="container")mediaQueries.push("@"+rule.name+" "+rule.params);
          if(name==="keyframes"||name.endsWith("keyframes"))keyframes.push(rule.params);
          if(name==="font-face"){
            const face:Record<string,string>={};
            rule.walkDecls(decl=>{face[decl.prop]=decl.value});
            fontFaces.push(face);
          }
          for(const raw of extractCssUrls(rule.params)){
            try{referencedAssets.push(new URL(raw,sheet.source).href)}catch{}
          }
        });
        inventory.stylesheets.push({
          source:sheet.source,localPath:sheet.localPath!,bytes:sheet.bytes,
          selectors:[...new Set(selectors)].slice(0,5000),
          mediaQueries:[...new Set(mediaQueries)],
          keyframes:[...new Set(keyframes)],
          customProperties,
          fontFaces,
          referencedAssets:[...new Set(referencedAssets)]
        });
      }catch(error){
        this.progress?.("Could not inventory stylesheet "+sheet.source+": "+(error instanceof Error?error.message:String(error)));
      }
    }
    await mkdir(join(this.output,"styles"),{recursive:true});
    await writeFile(join(this.output,"styles","inventory.json"),JSON.stringify(inventory,null,2));
    return inventory;
  }

  async writeManifest(){await this.flush();const records=[...this.records.values()].sort((a,b)=>a.type.localeCompare(b.type)||a.source.localeCompare(b.source));await mkdir(join(this.output,"assets"),{recursive:true});await writeFile(join(this.output,"assets","manifest.json"),JSON.stringify({version:2,capturedAt:new Date().toISOString(),totalAssets:records.length,capturedAssets:records.filter(x=>x.captured).length,totalBytes:records.reduce((s,x)=>s+x.bytes,0),assets:records},null,2));return records}
}
