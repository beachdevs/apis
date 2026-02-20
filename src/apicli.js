#!/usr/bin/env node
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { fetchApi, getApi, getApis } from './fetch.js';
import { homedir } from 'node:os';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const defaultTomlPath = join(root, 'apicli.toml');
const defaultTxtPath = join(root, 'apis.txt');
const userTomlPath = join(homedir(), '.apicli', 'apicli.toml');
const userTxtPath = join(homedir(), '.apicli', 'apis.txt');

const c = { dim: '\x1b[90m', cyan: '\x1b[36m', yellow: '\x1b[33m', green: '\x1b[32m', bold: '\x1b[1m', reset: '\x1b[0m' };

const usage = `
🔌 ${c.bold}apicli${c.reset} ${c.dim}— call APIs (${c.cyan}./apicli${c.reset})${c.reset}
${c.dim}apicli.toml:${c.reset} ${defaultTomlPath}

${c.bold}Commands${c.reset}
  ${c.cyan}ls${c.reset} [pattern]            List APIs (e.g. ${c.dim}apicli ls "openrouter*"${c.reset})
  ${c.cyan}help${c.reset} <pattern>          Show matching lines (e.g. ${c.dim}apicli help "httpbin*"${c.reset})
  ${c.green}<service.name>${c.reset} [k=v …]  Call API with optional params

${c.bold}Options${c.reset}
  ${c.cyan}-time${c.reset}                   Print request duration
  ${c.cyan}-debug${c.reset}                  Print fetch request/response info (e.g. ${c.dim}apicli -debug httpbin.get${c.reset})
  ${c.cyan}-config${c.reset} <path>         Use custom config file (e.g. ${c.dim}apicli -config ./custom.toml httpbin.get${c.reset})

${c.bold}Example${c.reset}
  ${c.dim}apicli openrouter.chat API_KEY=$OPENROUTER_API_KEY MODEL=openai/gpt-4o-mini PROMPT=Hello${c.reset}
  ${c.dim}apicli -time httpbin.get${c.reset}
  ${c.dim}apicli -debug httpbin.get${c.reset}
`;

const rawArgs = process.argv.slice(2);
const timeFlag = rawArgs.includes('-time') || rawArgs.includes('--time');
const debugFlag = rawArgs.includes('-debug') || rawArgs.includes('--debug');
const configIdx = rawArgs.findIndex(a => a === '-config' || a === '--config');
if (configIdx >= 0 && (!rawArgs[configIdx + 1] || rawArgs[configIdx + 1].startsWith('-'))) {
  console.error('Error: -config requires a file path');
  process.exit(1);
}
const configPath = configIdx >= 0 ? rawArgs[configIdx + 1] : null;
const args = rawArgs.filter((a, i) => {
  if (['-time', '--time', '-debug', '--debug'].includes(a)) return false;
  if (configIdx >= 0 && (i === configIdx || i === configIdx + 1)) return false;
  return true;
});
const arg = args[0];
const pattern = args[1] ?? '.';

const defaultConfigPath = () => fs.existsSync(defaultTomlPath) ? defaultTomlPath : defaultTxtPath;
const userConfigPath = () => fs.existsSync(userTomlPath) ? userTomlPath : (fs.existsSync(userTxtPath) ? userTxtPath : null);
const printConfigInfo = () => {
  console.error('apicli.toml:', defaultTomlPath);
  if (configPath) {
    console.error('config:', configPath);
    return;
  }
  console.error('default:', defaultConfigPath());
  const userPath = userConfigPath();
  if (userPath) console.error('user:   ', userPath);
};
const getConfigFiles = (override) => {
  if (override) return [override];
  const files = [defaultConfigPath()];
  const userPath = userConfigPath();
  if (userPath) files.push(userPath);
  return files;
};

const showConfigInfo = args.length === 0;
if (showConfigInfo) printConfigInfo();

if (!arg || arg === '-h' || arg === '--help') {
  console.log(usage);
  process.exit(0);
}

if (arg === 'ls') {
  const re = new RegExp(pattern.replace(/\*/g, '.*'), 'i');
  for (const a of getApis(configPath)) {
    const id = `${a.service}.${a.name}`;
    if (re.test(id)) console.log(id);
  }
  process.exit(0);
}

if (arg === 'help') {
  const re = new RegExp(pattern.replace(/\*/g, '.*'), 'i');
  const files = getConfigFiles(configPath);
  for (const f of files) {
    if (!fs.existsSync(f)) continue;
    for (const line of fs.readFileSync(f, 'utf8').split('\n')) {
      if (re.test(line)) console.log(line);
    }
  }
  process.exit(0);
}

if (/^\w+\.\w+$/.test(arg)) {
  const [service, name] = arg.split('.');
  const api = getApi(service, name, configPath);
  if (!api) {
    console.error('Unknown API:', arg);
    process.exit(1);
  }
  const params = {};
  for (const a of args.slice(1)) {
    const i = a.indexOf('=');
    if (i > 0) params[a.slice(0, i)] = a.slice(i + 1);
  }
  const hasBodyTemplate = api.body != null && String(api.body).trim() !== '';
  const isJsonPost = api.method === 'POST' && String(api.headers || '').includes('json');
  const overrides = hasBodyTemplate
    ? { vars: params, simple: true, configPath }
    : isJsonPost
      ? { body: JSON.stringify(params), simple: true, configPath }
      : { vars: params, simple: true, configPath };
  if (debugFlag) overrides.debug = true;
  try {
    const t0 = timeFlag ? process.hrtime.bigint() : null;
    const result = await fetchApi(service, name, overrides);
    if (t0 != null) {
      const ms = Number(process.hrtime.bigint() - t0) / 1e6;
      console.error(`\x1b[90m%ims\x1b[0m`, ms.toFixed(0));
    }
    console.log(JSON.stringify(result, null, 2));
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
  process.exit(0);
}

// search apicli.toml/apis.txt
const re2 = new RegExp(arg.replace(/\*/g, '.*'), 'i');
const files = getConfigFiles(configPath);
for (const f of files) {
  if (!fs.existsSync(f)) continue;
  for (const line of fs.readFileSync(f, 'utf8').split('\n')) {
    if (re2.test(line)) console.log(line);
  }
}
