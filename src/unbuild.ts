import { chromium, type Browser, type Page } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { extractPage } from "./extract.js";
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

function safeName(value:string):string {
  return value.replace(/^https?:\\/\\//,"").replace(/[^a-zA-Z0-9._-]+/g,"-").replace(/-+/g,"-").replace(/^-|-$/g,"").slice(0,80) || "site";
}

export async function unbuild(inputUrl:string, options:UnbuildOptions={}):Promise<UnbuildResult> {
  const url = new URL(inputUrl);
  if (!/^https?:$/.test(url.protocol)) throw new Error("Only http:// and https:// URLs are supported.");
  const output = options.output ?? join(process.cwd(), "unbuild-output");
  const viewports = options.viewports ?? DEFAULT_VIEWPORTS;
  const timeout = options.timeout ?? 30000;
  await mkdir(output,{recursive:true});
  for (const dir of ["screenshots","pages","evidence","tokens","components","ux","motion","responsive","assets"]) await mkdir(join(output,dir),{recursive:true});

  const browser:Browser = await chromium.launch({headless: options.headless ?? true});
  const pages:string[] = [];
  try {
    const page:Page = await browser.newPage({viewport:{width:viewports[0].width,height:viewports[0].height}});
    page.setDefaultTimeout(timeout);
    await page.goto(url.toString(),{waitUntil:"networkidle",timeout});
    await page.waitForTimeout(500);
    const data = await extractPage(page,url.toString());
    pages.push(data.url);

    await writeFile(join(output,"evidence","page.json"),JSON.stringify(data,null,2));
    await writeFile(join(output,"tokens","tokens.json"),JSON.stringify(data.tokens,null,2));
    await writeFile(join(output,"components","components.json"),JSON.stringify(data.components,null,2));

    for (const viewport of viewports) {
      await page.setViewportSize({width:viewport.width,height:viewport.height});
      await page.goto(url.toString(),{waitUntil:"networkidle",timeout});
      await page.screenshot({path:join(output,"screenshots",viewport.name+".png"),fullPage:true});
      const responsive = await extractPage(page,url.toString());
      await writeFile(join(output,"responsive",viewport.name+".json"),JSON.stringify({
        viewport,
        document:{width:responsive.document.width,height:responsive.document.height},
        layout:responsive.layout,
        tokens:responsive.tokens
      },null,2));
    }

    await writeFile(join(output,"DESIGN.md"),renderReport(data));
    await writeFile(join(output,"AI.md"),renderReport(data,true));
    await writeFile(join(output,"README.md"),`# Unbuild output\\n\\nSource: ${url}\\n\\nThis directory contains measured design evidence and an AI-readable reconstruction reference.\\n`);
    return {output,pages:pages.length,screenshots:viewports.length};
  } finally {
    await browser.close();
  }
}

export { safeName };