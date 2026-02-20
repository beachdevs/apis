import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';
import { parse as parseToml } from '@iarna/toml';

const runJq = (filter, input) => {
  const f = filter.startsWith('.') ? filter : `.${filter}`;
  const r = spawnSync('jq', ['-r', f], { input, encoding: 'utf8', maxBuffer: 50 * 1024 * 1024 });
  if (r.error) throw r.error;
  if (r.status !== 0) throw new Error(r.stderr || `jq exited ${r.status}`);
  return r.stdout;
};

const _dir = dirname(fileURLToPath(import.meta.url));
const DEFAULT_TOML_PATH = join(_dir, '..', 'apicli.toml');
const USER_TOML_PATH = join(homedir(), '.apicli', 'apicli.toml');

const parseTxt = (c) => {
  const lines = c.trim().split('\n');
  const h = lines[0].trim().split(/\s+/).filter(Boolean);
  const rows = lines.slice(1).map(l => {
    const v = []; let cur = '', q = 0;
    for (let i = 0; i < l.length; i++) {
      if (l[i] === '"' && l[i+1] === '"') { cur += '"'; i++; }
      else if (l[i] === '"') q = !q;
      else if (l[i] === ' ' && !q) { v.push(cur); cur = ''; }
      else cur += l[i];
    }
    return [...v, cur];
  });
  return { apis: rows.map(r => Object.fromEntries(h.map((k, i) => {
    let v = r[i] === 'null' ? null : r[i];
    if (k !== 'body' && v != null) {
      try { if (typeof v === 'string' && (v.startsWith('{') || v.startsWith('['))) v = JSON.parse(v); } catch(e){}
    }
    return [k, v];
  }))) };
};

const parse = (content, isToml) => {
  if (isToml) {
    const data = parseToml(content);
    const apis = [];
    if (data.apis) {
      for (const [id, api] of Object.entries(data.apis)) {
        const [service, name] = id.split('.');
        apis.push({ service, name, ...api });
      }
    }
    return { apis };
  }
  return parseTxt(content);
};

const VAR_ALIASES = { 
  API_KEY: ['OPENROUTER_API_KEY', 'OPENAI_API_KEY', 'CEREBRAS_API_KEY'],
  OPENAI_API_KEY: ['API_KEY'],
  OPENROUTER_API_KEY: ['API_KEY'],
  CEREBRAS_API_KEY: ['API_KEY'],
  CLOUDFLARE_ANALYTICS_TOKEN: ['CLOUDFLARE_API_TOKEN'],
  CLOUDFLARE_API_TOKEN: ['CLOUDFLARE_ANALYTICS_TOKEN']
};
const isEnvVar = (k) => /^[A-Z][A-Z0-9_]*$/.test(k);
const sub = (s, v = {}) => s?.replace?.(/(!?)\$([A-Za-z_]\w*)/g, (_, r, k) => {
  if (!isEnvVar(k)) return `$${k}`; // preserve GraphQL/camelCase vars
  let val = v[k] ?? process.env[k];
  if (val == null && VAR_ALIASES[k]) {
    for (const alt of VAR_ALIASES[k]) {
      val = v[alt] ?? process.env[alt];
      if (val != null) break;
    }
  }
  if (r && val == null) throw new Error(`Variable ${k} is required`);
  return val ?? '';
}) ?? s;

const walk = (obj, v) => {
  if (typeof obj === 'string') return sub(obj, v);
  if (Array.isArray(obj)) return obj.map(x => walk(x, v));
  if (obj && typeof obj === 'object') return Object.fromEntries(Object.entries(obj).map(([k, x]) => [k, walk(x, v)]));
  return obj;
};

export function getApis(configPath) {
  if (configPath) {
    const isToml = configPath.endsWith('.toml');
    return parse(fs.readFileSync(configPath, 'utf8'), isToml).apis;
  }
  const isDefaultToml = fs.existsSync(DEFAULT_TOML_PATH);
  const defaults = parse(fs.readFileSync(isDefaultToml ? DEFAULT_TOML_PATH : join(_dir, '..', 'apis.txt'), 'utf8'), isDefaultToml).apis;
  const userTomlPath = join(homedir(), '.apicli', 'apicli.toml');
  const userTxtPath = join(homedir(), '.apicli', 'apis.txt');
  const userPath = fs.existsSync(userTomlPath) ? userTomlPath : (fs.existsSync(userTxtPath) ? userTxtPath : null);
  if (!userPath) return defaults;
  const isUserToml = userPath.endsWith('.toml');
  const user = parse(fs.readFileSync(userPath, 'utf8'), isUserToml).apis;
  const key = a => `${a.service}.${a.name}`;
  const map = new Map(defaults.map(a => [key(a), a]));
  for (const a of user) map.set(key(a), a);
  return [...map.values()];
}

export function getApi(service, name, configPath) {
  return getApis(configPath).find(a => a.service === service && a.name === name);
}

const providerBlock = ', "provider": {"order": ["$PROVIDER"]}';
const providerSub = (body, provider) =>
  provider ? body.replace(providerBlock, providerBlock.replace('$PROVIDER', provider)) : body.replace(providerBlock, '');

const expandBearer = (headers, v) => {
  if (typeof headers === 'string' && headers.startsWith('BEARER ')) {
    const token = sub(headers.slice(7).trim(), v);
    return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  }
  return headers;
};

export function getRequest(service, name, vars = {}, configPath) {
  const api = getApi(service, name, configPath);
  if (!api) throw new Error(`Unknown API: ${service}/${name}`);
  const provider = vars.PROVIDER ?? process.env.PROVIDER;
  const v = { ...vars };
  const url = sub(api.url, v);
  let headers = api.headers;
  headers = expandBearer(headers, v);
  headers = walk(headers, v);
  let body = api.body != null ? String(api.body).trim() : undefined;
  if (body != null && body.includes(providerBlock)) body = providerSub(body, provider);
  body = body != null ? sub(body, v) : undefined;
  return { url, method: api.method, headers, body };
}

const redact = (h) => {
  if (!h || typeof h !== 'object') return h;
  const out = { ...h };
  if (out.Authorization) out.Authorization = 'Bearer ***';
  return out;
};

export async function fetchApi(service, name, overrides = {}) {
  const opts = overrides === 'simple' ? { simple: true } : overrides;
  const { vars = {}, simple, configPath, debug, ...rest } = opts;
  const { url, method, headers, body } = getRequest(service, name, { ...vars, ...rest }, configPath);
  if (debug) {
    console.error('\x1b[90m> %s %s\x1b[0m', method, url);
    console.error('\x1b[90m> headers: %s\x1b[0m', JSON.stringify(redact(headers)));
    if (body) console.error('\x1b[90m> body: %s\x1b[0m', body.slice(0, 200) + (body.length > 200 ? '...' : ''));
  }
  const res = await fetch(url, { method, headers, body: body || undefined });
  if (debug) {
    console.error('\x1b[90m< %s %s\x1b[0m', res.status, res.statusText);
    for (const [k, v] of res.headers.entries()) console.error('\x1b[90m< %s: %s\x1b[0m', k, v);
  }
  return simple ? res.json() : res;
}

let _configPath = null;

export function useConfig(configPath) {
  _configPath = configPath ?? null;
  return { configPath: _configPath, get: (id, opts) => get(id, { ...opts, configPath: _configPath }) };
}

function responseWrapper(bodyText) {
  let parsed;
  try { parsed = JSON.parse(bodyText); } catch { parsed = null; }
  return {
    json(jqQuery) {
      if (jqQuery === undefined) return parsed;
      return runJq(jqQuery, bodyText);
    },
    text() { return bodyText; }
  };
}

export async function get(id, opts = {}) {
  const i = id.indexOf('.');
  if (i <= 0 || i === id.length - 1) throw new Error(`Invalid id: ${id}`);
  const service = id.slice(0, i);
  const name = id.slice(i + 1);
  const { configPath = _configPath, vars, debug, ...rest } = opts ?? {};
  const api = getApi(service, name, configPath);
  if (!api) throw new Error(`Unknown API: ${id}`);
  const res = await fetchApi(service, name, { ...rest, vars: vars ?? rest, simple: false, debug, configPath });
  const bodyText = await res.text();
  return responseWrapper(bodyText);
}
