#!/usr/bin/env node

function help(){
  console.log(`
unbuild — reverse-engineer a rendered website into an AI-ready design reference.

Usage:
  unbuild <url> [options]

Options:
  -o, --output <dir>       Output directory (default: ./unbuild-output)
  --timeout <ms>            Browser timeout (default 30000)
  --pages <n>               Maximum same-origin pages (default 12)
  --browser <path>          Use an installed Chromium/Chrome/Edge executable
  --cdp <url>               Connect to an existing Chromium browser over CDP
  --no-headless             Show Chromium while analyzing
  --verbose                 Show detailed live progress (default)
  --quiet                   Suppress live progress
  -h, --help                Show help

Android / Termux:
  Uses installed Termux Chromium automatically when available.
  Install it with: pkg install x11-repo && pkg install chromium
  Or use --cdp with an existing Chromium-compatible browser endpoint.
`);
}

function fail(message:string):never{
  console.error(`unbuild: ${message}`);
  console.error(`Run "unbuild --help" for usage.`);
  process.exit(1);
}

/** Flags that take a following value, mapped to their canonical long name. */
const VALUE_FLAGS:Record<string,string> = {
  "-o":"--output","--output":"--output",
  "--timeout":"--timeout",
  "--pages":"--pages",
  "--browser":"--browser",
  "--cdp":"--cdp"
};
/** Flags that take no value. */
const BOOLEAN_FLAGS = new Set(["-h","--help","--no-headless","--verbose","--quiet"]);

const args=process.argv.slice(2);
if(args.length===0||args.includes("-h")||args.includes("--help")){help();process.exit(args.length?0:1)}

const positionals:string[]=[];
const flags:Record<string,string|undefined>={};
for(let i=0;i<args.length;i++){
  const arg=args[i];
  const eq=arg.startsWith("--")?arg.indexOf("="):-1;
  const name=eq!==-1?arg.slice(0,eq):arg;

  if(name in VALUE_FLAGS){
    const canonical=VALUE_FLAGS[name];
    const value=eq!==-1?arg.slice(eq+1):args[++i];
    if(value===undefined||(value.startsWith("-")&&value!==""))
      fail(`missing value for ${name}`);
    flags[canonical]=value;
    continue;
  }
  if(BOOLEAN_FLAGS.has(name)){flags[name]=""; continue}
  if(arg.startsWith("-")) fail(`unrecognized option "${arg}"`);
  positionals.push(arg);
}

if(positionals.length===0) fail("missing required <url> argument");
if(positionals.length>1) fail(`unexpected extra argument "${positionals[1]}"`);

let target=positionals[0];
if(!/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(target)) target=`https://${target}`;
let url:URL;
try{ url=new URL(target) }
catch{ fail(`"${positionals[0]}" is not a valid URL`) }

function parseIntFlag(name:string,fallback:number):number{
  const raw=flags[name];
  if(raw===undefined) return fallback;
  const value=Number(raw);
  if(!Number.isFinite(value)||value<=0) fail(`${name} must be a positive number, got "${raw}"`);
  return value;
}

const output=flags["--output"];
const timeout=parseIntFlag("--timeout",30000);
const pages=parseIntFlag("--pages",12);
const executablePath=flags["--browser"];
const cdpEndpoint=flags["--cdp"];
if(executablePath&&cdpEndpoint) fail("--browser and --cdp cannot be used together");

try{
  const {unbuild}=await import("./unbuild.js");
  const verbose=!("--quiet" in flags);
  const result=await unbuild(url.toString(),{
    output,timeout,pages,executablePath,cdpEndpoint,
    headless:!("--no-headless" in flags),
    onProgress:verbose?(message)=>console.log(`[${new Date().toLocaleTimeString()}] ${message}`):undefined
  });
  console.log(`✓ Output: ${result.output}`);
  console.log(`✓ Screenshots: ${result.screenshots}`);
}catch(error){
  console.error("Unbuild failed:",error instanceof Error?error.message:error);
  process.exit(1);
}
