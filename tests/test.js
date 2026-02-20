import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import * as api from '../src/fetch.js';

const testsDir = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(testsDir, '..');
const cli = join(projectRoot, 'src', 'apicli.js');
const configPath = join(projectRoot, 'apicli.toml');
const mockFetchPath = join(testsDir, 'mock-fetch.js');

const run = (args, env = {}) => {
  const nodeOptions = [process.env.NODE_OPTIONS, env.NODE_OPTIONS, `--import=${mockFetchPath}`]
    .filter(Boolean)
    .join(' ');
  return spawnSync(process.execPath, [cli, ...args], {
    encoding: 'utf8',
    cwd: projectRoot,
    env: { ...process.env, ...env, NODE_OPTIONS: nodeOptions }
  });
};

let originalFetch;
test.before(async () => {
  originalFetch = globalThis.fetch;
  await import('./mock-fetch.js');
});

test.after(() => {
  globalThis.fetch = originalFetch;
});

test('fetch.js - getApis', () => {
  const apis = api.getApis(configPath);
  assert.ok(Array.isArray(apis));
  assert.ok(apis.length >= 5);
  assert.ok(apis.some(a => a.service === 'httpbin'));
  assert.ok(apis.some(a => a.service === 'catfact'));
});

test('fetch.js - getApi', () => {
  const item = api.getApi('httpbin', 'get', configPath);
  assert.strictEqual(item.service, 'httpbin');
  assert.strictEqual(item.name, 'get');
  assert.strictEqual(item.method, 'GET');
});

test('fetch.js - getRequest basic', () => {
  const req = api.getRequest('httpbin', 'get', {}, configPath);
  assert.strictEqual(req.url, 'https://httpbin.org/get');
  assert.strictEqual(req.method, 'GET');
});

test('fetch.js - getRequest with vars', () => {
  const vars = { API_KEY: 'test-key', MODEL: 'gpt-4', PROMPT: 'hi' };
  const req = api.getRequest('openai', 'chat', vars, configPath);
  assert.strictEqual(req.headers.Authorization, 'Bearer test-key');
  const body = JSON.parse(req.body);
  assert.strictEqual(body.model, 'gpt-4');
  assert.strictEqual(body.messages[0].content, 'hi');
});

test('fetch.js - getRequest missing required var', () => {
  assert.throws(() => {
    api.getRequest('openai', 'chat', { MODEL: 'gpt-4' }, configPath);
  }, /Variable .* is required/);
});

test('fetch.js - variable aliases', () => {
  const oldKey = process.env.OPENAI_API_KEY;
  const oldKey2 = process.env.API_KEY;
  const oldKey3 = process.env.OPENROUTER_API_KEY;
  delete process.env.OPENAI_API_KEY;
  delete process.env.API_KEY;
  delete process.env.OPENROUTER_API_KEY;
  try {
    const vars = { OPENAI_API_KEY: 'alias-key', MODEL: 'gpt-4', PROMPT: 'hi' };
    const req = api.getRequest('openai', 'chat', vars, configPath);
    assert.strictEqual(req.headers.Authorization, 'Bearer alias-key');
  } finally {
    if (oldKey !== undefined) process.env.OPENAI_API_KEY = oldKey;
    if (oldKey2 !== undefined) process.env.API_KEY = oldKey2;
    if (oldKey3 !== undefined) process.env.OPENROUTER_API_KEY = oldKey3;
  }
});

test('fetch.js - optional variables', () => {
  const vars = { API_KEY: 'key', MODEL: 'm', PROMPT: 'hello' };
  const req = api.getRequest('openrouter', 'chat', vars, configPath);
  const body = JSON.parse(req.body);
  assert.strictEqual(body.messages[0].content, '');
  assert.strictEqual(body.messages[1].content, 'hello');
});

test('fetch.js - openrouter optional PROVIDER', () => {
  const vars = { API_KEY: 'key', MODEL: 'openai/gpt-4o-mini', PROMPT: 'hi', PROVIDER: 'openai' };
  const req = api.getRequest('openrouter', 'chat', vars, configPath);
  const body = JSON.parse(req.body);
  assert.deepStrictEqual(body.provider, { order: ['openai'] });
});

test('fetch.js - openrouter PROVIDER from env', () => {
  const old = process.env.PROVIDER;
  process.env.PROVIDER = 'anthropic';
  try {
    const vars = { API_KEY: 'key', MODEL: 'm', PROMPT: 'hi' };
    const req = api.getRequest('openrouter', 'chat', vars, configPath);
    const body = JSON.parse(req.body);
    assert.deepStrictEqual(body.provider, { order: ['anthropic'] });
  } finally {
    if (old !== undefined) process.env.PROVIDER = old;
    else delete process.env.PROVIDER;
  }
});

test('fetch.js - openrouter without PROVIDER omits provider block', () => {
  const vars = { API_KEY: 'key', MODEL: 'openai/gpt-4o-mini', PROMPT: 'hi' };
  const req = api.getRequest('openrouter', 'chat', vars, configPath);
  const body = JSON.parse(req.body);
  assert.strictEqual(body.provider, undefined);
});

test('fetch.js - fetchApi (mock network call)', async () => {
  const res = await api.fetchApi('httpbin', 'get', { simple: true, configPath });
  assert.strictEqual(res.url, 'https://httpbin.org/get');
});

test('fetch.js - custom configPath (txt)', () => {
  const tmpPath = join(testsDir, 'tmp-apis.txt');
  fs.writeFileSync(tmpPath, 'service name url method headers body\nlocal test http://localhost/$VAR GET {}');
  try {
    const item = api.getApi('local', 'test', tmpPath);
    assert.strictEqual(item.url, 'http://localhost/$VAR');
    const req = api.getRequest('local', 'test', { VAR: 'foo' }, tmpPath);
    assert.strictEqual(req.url, 'http://localhost/foo');
  } finally {
    fs.unlinkSync(tmpPath);
  }
});

test('fetch.js - custom configPath (toml)', () => {
  const tmpPath = join(testsDir, 'tmp-apis.toml');
  fs.writeFileSync(tmpPath, '[apis."local.test"]\nurl = "http://localhost/$VAR"\nmethod = "GET"\nheaders = {}');
  try {
    const item = api.getApi('local', 'test', tmpPath);
    assert.strictEqual(item.url, 'http://localhost/$VAR');
    const req = api.getRequest('local', 'test', { VAR: 'foo' }, tmpPath);
    assert.strictEqual(req.url, 'http://localhost/foo');
  } finally {
    fs.unlinkSync(tmpPath);
  }
});

test('fetch.js - fetchApi with overrides and configPath', async () => {
  const tmpPath = join(testsDir, 'tmp-fetch-apis.txt');
  fs.writeFileSync(tmpPath, 'service name url method headers body\nbin get https://httpbin.org/get GET {}');
  try {
    const res = await api.fetchApi('bin', 'get', { configPath: tmpPath, simple: true });
    assert.strictEqual(res.url, 'https://httpbin.org/get');
  } finally {
    fs.unlinkSync(tmpPath);
  }
});

test('fetch.js - bearer shorthand with required variable', () => {
  const req = api.getRequest('cerebras', 'chat2', {
    CEREBRAS_API_KEY: 'secret',
    MODEL: 'llama',
    PROMPT: 'hello'
  }, configPath);
  assert.strictEqual(req.headers.Authorization, 'Bearer secret');
  assert.strictEqual(req.headers['Content-Type'], 'application/json');
});

test('fetch.js - bearer shorthand missing required variable', () => {
  const oldCerebrasKey = process.env.CEREBRAS_API_KEY;
  const oldApiKey = process.env.API_KEY;
  delete process.env.CEREBRAS_API_KEY;
  delete process.env.API_KEY;
  try {
    assert.throws(() => {
      api.getRequest('cerebras', 'chat2', { MODEL: 'llama', PROMPT: 'hello' }, configPath);
    }, /Variable .* is required/);
  } finally {
    if (oldCerebrasKey !== undefined) process.env.CEREBRAS_API_KEY = oldCerebrasKey;
    if (oldApiKey !== undefined) process.env.API_KEY = oldApiKey;
  }
});

test('CLI - no args shows usage', () => {
  const r = run([]);
  assert.strictEqual(r.status, 0);
  assert.match(r.stdout, /Commands/);
});

test('CLI - -h and --help show usage', () => {
  assert.strictEqual(run(['-h']).status, 0);
  assert.strictEqual(run(['--help']).status, 0);
  assert.match(run(['-h']).stdout, /Commands/);
});

test('CLI - list', () => {
  const r = run(['list']);
  assert.strictEqual(r.status, 0);
  assert.match(r.stdout, /httpbin\.get/);
  assert.match(r.stdout, /catfact\.getFact/);
});

test('CLI - list with pattern', () => {
  const r = run(['list', 'httpbin']);
  assert.strictEqual(r.status, 0);
  assert.match(r.stdout, /httpbin\.get/);
  assert.doesNotMatch(r.stdout, /catfact/);
});

test('CLI - where', () => {
  const r = run(['where']);
  assert.strictEqual(r.status, 0);
  assert.match(r.stdout, /(apicli\.toml|apis\.txt)/);
});

test('CLI - -config uses custom config', () => {
  const tmpPath = join(testsDir, 'tmp-config.toml');
  fs.writeFileSync(tmpPath, '[apis."custom.get"]\nurl = "https://httpbin.org/get"\nmethod = "GET"\nheaders = {}');
  try {
    const r = run(['-config', tmpPath, 'list']);
    assert.strictEqual(r.status, 0);
    assert.match(r.stdout, /custom\.get/);
    const r2 = run(['-config', tmpPath, 'where']);
    assert.strictEqual(r2.status, 0);
    assert.match(r2.stdout, /config:/);
  } finally {
    fs.unlinkSync(tmpPath);
  }
});

test('CLI - -config missing path errors', () => {
  const r = run(['-config']);
  assert.strictEqual(r.status, 1);
  assert.match(r.stderr, /-config requires/);
});

test('CLI - help pattern', () => {
  const r = run(['help', 'httpbin']);
  assert.strictEqual(r.status, 0);
  assert.match(r.stdout, /https:\/\/httpbin\.org\/get/);
});

test('CLI - service call (mock network)', () => {
  const r = run(['httpbin.get']);
  assert.strictEqual(r.status, 0);
  const json = JSON.parse(r.stdout);
  assert.strictEqual(json.url, 'https://httpbin.org/get');
});

test('CLI - service call with params', () => {
  const r = run(['httpbin.get', 'foo=bar']);
  assert.strictEqual(r.status, 0);
  JSON.parse(r.stdout);
});

test('CLI - -time can appear anywhere in args', () => {
  const r = run(['httpbin.get', '-time']);
  assert.strictEqual(r.status, 0);
  assert.match(r.stderr, /\d+ms/);
  JSON.parse(r.stdout);
});

test('CLI - -debug prints fetch info', () => {
  const r = run(['-debug', 'httpbin.get']);
  assert.strictEqual(r.status, 0);
  assert.match(r.stderr, /> GET https:\/\/httpbin\.org\/get/);
  assert.match(r.stderr, /< 200/);
  JSON.parse(r.stdout);
});

test('CLI - --debug in different position', () => {
  const r = run(['httpbin.get', '--debug']);
  assert.strictEqual(r.status, 0);
  assert.match(r.stderr, /> GET/);
  assert.match(r.stderr, /< 200/);
});

test('CLI - unknown API', () => {
  const r = run(['unknown.api']);
  assert.strictEqual(r.status, 1);
  assert.match(r.stderr, /Unknown API/);
});

test('CLI - -time prints duration', () => {
  const r = run(['-time', 'httpbin.get']);
  assert.strictEqual(r.status, 0);
  assert.match(r.stderr, /\d+ms/);
  JSON.parse(r.stdout);
});
