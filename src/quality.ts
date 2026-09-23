import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { AxeBuilder } from "@axe-core/playwright";
import type { Page } from "playwright";

export interface AccessibilityAuditSummary {
  engine: string;
  version: string;
  violations: number;
  incomplete: number;
  passes: number;
  inapplicable: number;
  critical: number;
  serious: number;
  moderate: number;
  minor: number;
}

function safeName(value:string):string {
  return value.replace(/[^a-zA-Z0-9._-]+/g,"-").replace(/-+/g,"-").replace(/^-|-$/g,"").slice(0,80)||"page";
}

export async function captureAccessibilityAudit(
  page:Page,
  output:string,
  viewport:string,
  pageName:string,
  progress?:(message:string)=>void
):Promise<AccessibilityAuditSummary|null>{
  try{
    progress?.(`Running axe accessibility analysis for ${viewport}`);
    const results=await new AxeBuilder({page})
      .withTags(["wcag2a","wcag2aa","wcag21a","wcag21aa","wcag22aa","best-practice"])
      .analyze();

    const summary:AccessibilityAuditSummary={
      engine:results.testEngine.name,
      version:results.testEngine.version,
      violations:results.violations.length,
      incomplete:results.incomplete.length,
      passes:results.passes.length,
      inapplicable:results.inapplicable.length,
      critical:results.violations.filter(x=>x.impact==="critical").length,
      serious:results.violations.filter(x=>x.impact==="serious").length,
      moderate:results.violations.filter(x=>x.impact==="moderate").length,
      minor:results.violations.filter(x=>x.impact==="minor").length
    };

    const report={
      source:page.url(),
      viewport,
      summary,
      violations:results.violations,
      incomplete:results.incomplete,
      passes:results.passes,
      inapplicable:results.inapplicable
    };
    await mkdir(join(output,"accessibility"),{recursive:true});
    await writeFile(
      join(output,"accessibility",`axe-${safeName(viewport)}-${safeName(pageName)}.json`),
      JSON.stringify(report,null,2)
    );
    return summary;
  }catch(error){
    progress?.(`axe analysis unavailable for ${viewport}: ${error instanceof Error?error.message:String(error)}`);
    return null;
  }
}

export interface InteractionScreenshot {
  selector:string;
  text:string;
  state:"hover"|"focus";
  path:string;
}

export async function captureInteractionScreenshots(
  page:Page,
  output:string,
  pageName:string,
  states:Array<{selector:string;text:string;state:"hover"|"focus";changed:boolean}>,
  progress?:(message:string)=>void
):Promise<InteractionScreenshot[]>{
  const dir=join(output,"ux","states");
  await mkdir(dir,{recursive:true});
  const results:InteractionScreenshot[]=[];
  const seen=new Set<string>();

  for(const state of states){
    if(!state.changed)continue;
    const key=state.state+"|"+state.selector;
    if(seen.has(key)||results.length>=32)continue;
    seen.add(key);
    try{
      const locator=page.locator(state.selector).first();
      if(!(await locator.isVisible()))continue;
      if(state.state==="hover"){
        await locator.hover({timeout:1500});
      }else{
        await locator.focus({timeout:1500});
      }
      await page.waitForTimeout(80);
      const index=String(results.length+1).padStart(2,"0");
      const file=`${safeName(pageName)}-${index}-${state.state}.png`;
      await locator.screenshot({
        path:join(dir,file),
        animations:"disabled",
        scale:"css",
        timeout:3000
      });
      const item={selector:state.selector,text:state.text,state:state.state,path:`ux/states/${file}` as string};
      results.push(item);
      progress?.(`Captured interaction state ${file}`);
    }catch{}
  }

  await page.locator("body").focus({timeout:1000}).catch(()=>{});
  return results;
}
