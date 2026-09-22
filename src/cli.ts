#!/usr/bin/env node
import { unbuild } from "./unbuild.js";

function help(){
  console.log(\`
unbuild — reverse-engineer a rendered website into an AI-ready design reference.

Usage:
  unbuild <url> [options]

Options:
  -o, --output <dir>       Output directory (default: ./unbuild-output)
  --timeout <ms>            Browser timeout (default: 30000)
  --pages <n>               Maximum same-origin pages (default: 12)
  --browser <path>          Use an installed Chromium/Chrome/Edge executable
  --cdp <url>               Connect to an existing Chromium browser over CDP
  --no-headless              Show Chromium while analyzing
  -h, --help                Show help

Android / Termux:
  Use --cdp with a Chromium-compatible browser exposed on a local CDP endpoint.
\`);
}

const args=process.argv.slice(2);
if(args.length===0||args.includes("-h")||args.includes("--help")){help();process.exit(args.length?0:1)}
const url=args.find(x=>!x.startsWith("-"));
if(!url){help();process.exit(1)}
let output:string|undefined;
let timeout=30000;
let pages=12;
let executablePath:string|undefined;
let cdpEndpoint:string|undefined;
for(let i=0;i<args.length;i++){
  if(args[i]==="-o"||args[i]==="--output") output=args[++i];
  if(args[i]==="--timeout") timeout=Number(args[++i]);
  if(args[i]==="--pages") pages=Number(args[++i]);
  if(args[i]==="--browser") executablePath=args[++i];
  if(args[i]==="--cdp") cdpEndpoint=args[++i];
}
try{
  console.log("Unbuilding "+url+"…");
  const result=await unbuild(url,{output,timeout,pages,executablePath,cdpEndpoint,headless:!args.includes("--no-headless")});
  console.log(\`✓ Output: \${result.output}\`);
  console.log(\`✓ Screenshots: \${result.screenshots}\`);
}catch(error){
  console.error("Unbuild failed:",error instanceof Error?error.message:error);
  process.exit(1);
}
