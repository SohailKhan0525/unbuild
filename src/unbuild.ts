import { chromium, type Browser, type Page } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { extractPage, type PageEvidence } from "./extract.js";
import { discoverUrls } from "./discover.js";
import { renderReport } from "./report.js";

export interface UnbuildOptions {
  output?: string;
  pages?: number;
  timeout?: number;
  viewports?: Array<{name:string;width:number;height:number}>;
  headless?: boolean;
}

export interface UnbuildResult {
  output: string;
  pages: number;
  screenshots: number;
}

const DEFAULT_VIEWPORTS = [
  {name:"desktop",width:1440,height:1000},
  {name:"tablet",width:1024,height:1000},
  {name:"mobile",width:390,height:844}
];

export function safeName(value:string):string {
  return value.replace(/^https?:\\/\\//,"").replace(/[^a-zA-Z0-9._-]+/g,"-").replace(/-+/g,"-").replace(/^-|-$/g,"").slice(0,80) || "site";
}

function pageName(url:string):string {
  const u=new URL(url);
  const path=u.pathname.replace(/^\\/|\\/$/g,"").replace(/[^a-zA-Z0-9._-]+/g,"-");
  return path ? path.slice(0,100) : "home";
}

export async function unbuild(inputUrl:string, options:UnbuildOptions={}):Promise<UnbuildResult> {
  const root = new URL(inputUrl);
  if (!/^https?:$/.test(root.protocol)) throw new Error("Only http:// and https:// URLs are supported.");
  const output = options.output ?? join(process.cwd(), "unbuild-output");
  const viewports = options.viewports ?? DEFAULT_VIEWPORTS;
  const timeout = options.timeout ?? 30000;
  const maxPages = Math.max(1, Math.min(options.pages ?? 12, 100));

  await mkdir(output,{recursive:true});
  for (const dir of ["screenshots","pages","evidence","tokens","components","ux","motion","responsive","assets"]) {
    await mkdir(join(output,dir),{recursive:true});
  }

  const browser:Browser = await chromium.launch({headless: options.headless ?? true});
  const evidence:PageEvidence[]=[];
  try {
    const page:Page = await browser.newPage({viewport:{width:viewports[0].width,height:viewports[0].height}});
    page.setDefaultTimeout(timeout);

    const urls=await discoverUrls(page,root,maxPages);
    await writeFile(join(output,"evidence","pages.json"),JSON.stringify(urls,null,2));

    for (const url of urls) {
      const name=pageName(url);
      await page.goto(url,{waitUntil:"networkidle",timeout}).catch(async()=>{ await page.goto(url,{waitUntil:"domcontentloaded",timeout}); });
      await page.waitForTimeout(300);
      const data=await extractPage(page,url);
      evidence.push(data);
      await writeFile(join(output,"pages",name+".json"),JSON.stringify(data,null,2));

      for (const viewport of viewports) {
        await page.setViewportSize({width:viewport.width,height:viewport.height});
        await page.goto(url,{waitUntil:"networkidle",timeout}).catch(async()=>{ await page.goto(url,{waitUntil:"domcontentloaded",timeout}); });
        await page.waitForTimeout(200);
        const shotDir=join(output,"screenshots",viewport.name);
        await mkdir(shotDir,{recursive:true});
        await page.screenshot({path:join(shotDir,name+".png"),fullPage:true});
        const responsive=await extractPage(page,url);
        await writeFile(join(output,"responsive",viewport.name+"-"+name+".json"),JSON.stringify({
          viewport,
          document:responsive.document,
          layout:responsive.layout,
          tokens:responsive.tokens,
          components:responsive.components
        },null,2));
      }
    }

    const aggregate=evidence[0];
    if (aggregate) {
      await writeFile(join(output,"evidence","all-pages.json"),JSON.stringify(evidence,null,2));
      await writeFile(join(output,"tokens","tokens.json"),JSON.stringify(
        evidence.map(x=>x.tokens),null,2
      ));
      await writeFile(join(output,"components","components.json"),JSON.stringify(
        evidence.map(x=>({url:x.url,components:x.components})),null,2
      ));
      await writeFile(join(output,"DESIGN.md"),renderReport(aggregate));
      await writeFile(join(output,"AI.md"),renderReport(aggregate,true));
    }

    await writeFile(join(output,"README.md"),[
      "# Unbuild output",
      "",
      `Source: ${root}`,
      `Pages analyzed: ${evidence.length}`,
      `Viewports: ${viewports.map(v=>v.name+" ("+v.width+"×"+v.height+")").join(", ")}`,
      "",
      "This directory contains measured browser evidence and an AI-readable reconstruction reference.",
      ""
    ].join("\n"));

    return {output,pages:evidence.length,screenshots:evidence.length*viewports.length};
  } finally {
    await browser.close();
  }
}
