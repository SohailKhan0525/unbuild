import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { assertPublicUrl, discoverUrls } from "./discover.js";
import { extractPage, type PageEvidence } from "./extract.js";
import { renderAggregateReport } from "./report.js";

export interface UnbuildOptions {
  output?: string;
  pages?: number;
  timeout?: number;
  viewports?: Array<{name:string;width:number;height:number}>;
  headless?: boolean;
  executablePath?: string;
  cdpEndpoint?: string;
  onProgress?: (message: string) => void;
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
  return value.replace(/^https?:\/\//,"").replace(/[^a-zA-Z0-9._-]+/g,"-").replace(/-+/g,"-").replace(/^-|-$/g,"").slice(0,80) || "site";
}

function pageName(url:string):string {
  const u=new URL(url);
  const path=u.pathname.replace(/^\/|\/$/g,"").replace(/[^a-zA-Z0-9._-]+/g,"-");
  return path ? path.slice(0,100) : "home";
}

function progress(options: UnbuildOptions, message: string): void {
  options.onProgress?.(message);
}

async function withHeartbeat<T>(options: UnbuildOptions, message: string, operation: Promise<T>): Promise<T> {
  progress(options, message);
  const started = Date.now();
  const timer = setInterval(() => {
    const elapsed = Math.floor((Date.now() - started) / 1000);
    progress(options, `${message} — ${elapsed}s elapsed`);
  }, 5000);
  try {
    return await operation;
  } finally {
    clearInterval(timer);
  }
}

async function launchBrowser(options: UnbuildOptions): Promise<Browser> {
  if (options.cdpEndpoint) {
    return chromium.connectOverCDP(options.cdpEndpoint, { timeout: options.timeout ?? 30000 });
  }
  return chromium.launch({
    headless: options.headless ?? true,
    executablePath: options.executablePath
  });
}

async function getContext(browser: Browser, connected: boolean): Promise<BrowserContext> {
  if (connected) {
    const existing = browser.contexts()[0];
    if (existing) return existing;
  }
  return browser.newContext({
    viewport: {width: DEFAULT_VIEWPORTS[0].width, height: DEFAULT_VIEWPORTS[0].height}
  });
}

export async function unbuild(inputUrl:string, options:UnbuildOptions={}):Promise<UnbuildResult> {
  const root = new URL(inputUrl);
  progress(options, "Validating target URL and checking network safety…");
  await assertPublicUrl(root);
  const output = options.output ?? join(process.cwd(), "unbuild-output");
  const viewports = options.viewports ?? DEFAULT_VIEWPORTS;
  const timeout = options.timeout ?? 30000;
  const maxPages = Math.max(1, Math.min(options.pages ?? 12, 100));

  if (options.cdpEndpoint && options.executablePath) {
    throw new Error("Choose either --cdp or --browser, not both.");
  }

  progress(options, `Preparing output directory: ${output}`);
  await mkdir(output,{recursive:true});
  for (const dir of ["screenshots","pages","evidence","tokens","components","ux","motion","responsive","assets"]) {
    await mkdir(join(output,dir),{recursive:true});
  }

  const connected = Boolean(options.cdpEndpoint);
  const browser = await withHeartbeat(
    options,
    connected ? `Connecting to Chromium over CDP: ${options.cdpEndpoint}` : "Launching Playwright Chromium…",
    launchBrowser(options)
  );
  const evidence:PageEvidence[]=[];
  try {
    const context = await getContext(browser, connected);
    const page:Page = context.pages()[0] ?? await context.newPage();
    page.setDefaultTimeout(timeout);

    await page.route("**/*", async (route) => {
      try {
        await assertPublicUrl(new URL(route.request().url()));
        await route.continue();
      } catch {
        await route.abort("blockedbyclient");
      }
    });

    progress(options, `Discovering up to ${maxPages} same-origin pages…`);
    const urls = await discoverUrls(page, root, maxPages, timeout, (message) => progress(options, message));
    progress(options, `Discovered ${urls.length} page(s).`);
    await writeFile(join(output,"evidence","pages.json"),JSON.stringify(urls,null,2));

    for (let pageIndex = 0; pageIndex < urls.length; pageIndex++) {
      const url = urls[pageIndex];
      const name=pageName(url);
      progress(options, `Analyzing page ${pageIndex + 1}/${urls.length}: ${url}`);
      await withHeartbeat(
        options,
        `Loading page ${pageIndex + 1}/${urls.length} — waiting for network idle`,
        page.goto(url,{waitUntil:"networkidle",timeout})
      ).catch(async()=>{
        progress(options, `Network idle was not reached; retrying page ${pageIndex + 1}/${urls.length} with DOMContentLoaded`);
        await withHeartbeat(
          options,
          `Loading page ${pageIndex + 1}/${urls.length} — DOMContentLoaded fallback`,
          page.goto(url,{waitUntil:"domcontentloaded",timeout})
        );
      });
      await page.waitForTimeout(300);
      progress(options, `Extracting design evidence from page ${pageIndex + 1}/${urls.length}`);
      const data=await extractPage(page,url);
      evidence.push(data);
      await writeFile(join(output,"pages",name+".json"),JSON.stringify(data,null,2));

      for (const viewport of viewports) {
        progress(options, `Capturing ${viewport.name} ${viewport.width}×${viewport.height} for page ${pageIndex + 1}/${urls.length}`);
        await page.setViewportSize({width:viewport.width,height:viewport.height});
        await withHeartbeat(
          options,
          `Rendering ${viewport.name} — waiting for network idle`,
          page.goto(url,{waitUntil:"networkidle",timeout})
        ).catch(async()=>{
          progress(options, `Network idle was not reached for ${viewport.name}; using DOMContentLoaded fallback`);
          await withHeartbeat(
            options,
            `Rendering ${viewport.name} — DOMContentLoaded fallback`,
            page.goto(url,{waitUntil:"domcontentloaded",timeout})
          );
        });
        await page.waitForTimeout(200);
        const shotDir=join(output,"screenshots",viewport.name);
        await mkdir(shotDir,{recursive:true});
        await page.screenshot({path:join(shotDir,name+".png"),fullPage:true});
        progress(options, `Extracting responsive evidence for ${viewport.name}`);
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

    progress(options, "Writing aggregate evidence and AI-readable reports…");
    if (evidence.length) {
      await writeFile(join(output,"evidence","all-pages.json"),JSON.stringify(evidence,null,2));
      await writeFile(join(output,"tokens","tokens.json"),JSON.stringify(evidence.map(x=>x.tokens),null,2));
      await writeFile(join(output,"components","components.json"),JSON.stringify(evidence.map(x=>({url:x.url,components:x.components})),null,2));
      await writeFile(join(output,"DESIGN.md"),renderAggregateReport(evidence, root.toString()));
      await writeFile(join(output,"AI.md"),renderAggregateReport(evidence, root.toString(), true));
    }

    await writeFile(join(output,"README.md"),[
      "# Unbuild output",
      "",
      "Source: " + root,
      "Pages analyzed: " + evidence.length,
      "Viewports: " + viewports.map(v=>v.name+" ("+v.width+"×"+v.height+")").join(", "),
      "",
      "This directory contains measured browser evidence and an AI-readable reconstruction reference.",
      ""
    ].join("\n"));

    progress(options, `Complete — ${evidence.length} page(s), ${evidence.length * viewports.length} screenshot(s)`);
    return {output,pages:evidence.length,screenshots:evidence.length*viewports.length};
  } finally {
    await browser.close();
  }
}
