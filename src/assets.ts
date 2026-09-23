import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { basename, extname, join } from "node:path";
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
    "image/png":".png","image/jpeg":".jpg","image/webp":".webp","image/gif":".gif",
    "image/svg+xml":".svg","image/avif":".avif","image/x-icon":".ico","image/vnd.microsoft.icon":".ico",
    "font/woff":".woff","font/woff2":".woff2","font/ttf":".ttf","font/otf":".otf","application/font-woff":".woff",
    "text/css":".css","application/manifest+json":".webmanifest","video/mp4":".mp4","video/webm":".webm"
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
function safeBase(url:string){
  try{return (basename(new URL(url).pathname)||"asset").replace(/[^a-zA-Z0-9._-]+/g,"-").slice(0,80)||"asset"}catch{return "asset"}
}

export class AssetCollector{
  private readonly output:string;
  private readonly progress?:(message:string)=>void;
  private readonly records=new Map<string,AssetRecord>();
  private readonly pending=new Set<Promise<void>>();
  private totalBytes=0;
  constructor(output:string,progress?:(message:string)=>void){this.output=output;this.progress=progress}
  attach(page:Page){
    page.on("requestfinished",request=>{
      const p=this.captureRequest(request);
      this.pending.add(p);
      void p.finally(()=>this.pending.delete(p));
    });
  }
  async captureUrl(page:Page,url:string,pageUrl:string,type:AssetRecord["type"]="icon",alt?:string){
    let parsed:URL;try{parsed=new URL(url)}catch{return}
    if(!/^https?:$/i.test(parsed.protocol))return;
    await assertPublicUrl(parsed);
    const old=this.records.get(url);
    if(old){if(!old.pages.includes(pageUrl))old.pages.push(pageUrl);if(alt&&!old.alt)old.alt=alt;return}
    try{
      const response=await page.request.get(url,{timeout:15000,failOnStatusCode:false,maxRedirects:0});
      const record:AssetRecord={id:assetId(url),source:url,localPath:null,type,contentType:response.headers()["content-type"]??null,bytes:0,status:response.status(),pages:[pageUrl],alt,captured:false};
      this.records.set(url,record);
      if(!response.ok()){record.reason="HTTP response was not successful";return}
      await this.persist(record,await response.body());
    }catch(error){
      this.records.set(url,{id:assetId(url),source:url,localPath:null,type,contentType:null,bytes:0,status:0,pages:[pageUrl],alt,captured:false,reason:error instanceof Error?error.message:String(error)});
    }
  }
  private async captureRequest(request:Request){
    const response=await request.response();
    if(!response||response.status()<200||response.status()>=400)return;
    const contentType=await response.headerValue("content-type")??"";
    const type=classify(request,contentType);if(!type)return;
    const url=response.url();if(url.startsWith("data:")||this.records.has(url))return;
    const record:AssetRecord={id:assetId(url),source:url,localPath:null,type,contentType:contentType||null,bytes:0,status:response.status(),pages:[],captured:false};
    this.records.set(url,record);
    try{
      const size=await request.sizes(),expected=Number(size.responseBodySize||0);
      if(expected>MAX_ASSET_BYTES||this.totalBytes+expected>MAX_TOTAL_BYTES){record.reason=expected>MAX_ASSET_BYTES?"asset exceeds size limit":"run asset budget exceeded";return}
      const body=await response.body();
      if(body.length>MAX_ASSET_BYTES||this.totalBytes+body.length>MAX_TOTAL_BYTES){record.reason=body.length>MAX_ASSET_BYTES?"asset exceeds size limit":"run asset budget exceeded";return}
      await this.persist(record,body);
    }catch(error){record.reason=error instanceof Error?error.message:String(error)}
  }
  private async persist(record:AssetRecord,body:Buffer){
    const ext=extensionFor(record.contentType??"",record.source);
    const folder=record.type==="font"?"fonts":record.type==="stylesheet"?"styles":record.type==="icon"?"icons":record.type==="media"?"media":record.type==="manifest"?"manifests":"images";
    const relative=join("assets",folder,record.id+"-"+safeBase(record.source)+ext);
    await mkdir(join(this.output,"assets",folder),{recursive:true});
    await writeFile(join(this.output,relative),body);
    record.localPath=relative.replace(/\\/g,"/");record.bytes=body.length;record.captured=true;this.totalBytes+=body.length;
    this.progress?.("Captured asset "+record.localPath+" ("+body.length+" bytes)");
  }
  addPage(url:string,assets:Array<{source:string;type:AssetRecord["type"];alt?:string;width?:number;height?:number}>){
    for(const asset of assets){
      if(!asset.source||asset.source.startsWith("data:"))continue;
      const record=this.records.get(asset.source);
      if(record){if(!record.pages.includes(url))record.pages.push(url);if(asset.alt&&!record.alt)record.alt=asset.alt;if(asset.width&&!record.width)record.width=asset.width;if(asset.height&&!record.height)record.height=asset.height}
    }
  }
  async flush(){while(this.pending.size)await Promise.all([...this.pending])}
  async writeManifest(){
    await this.flush();const records=[...this.records.values()].sort((a,b)=>a.type.localeCompare(b.type)||a.source.localeCompare(b.source));
    await mkdir(join(this.output,"assets"),{recursive:true});
    await writeFile(join(this.output,"assets","manifest.json"),JSON.stringify({version:1,capturedAt:new Date().toISOString(),totalAssets:records.length,capturedAssets:records.filter(x=>x.captured).length,totalBytes:records.reduce((s,x)=>s+x.bytes,0),assets:records},null,2));
    return records;
  }
}
