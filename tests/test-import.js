import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { useConfig, get } from '../src/fetch.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const configPath = join(root, 'apicli.toml');

useConfig(configPath);
const originalFetch = globalThis.fetch;
globalThis.fetch = async (url, init = {}) => new Response(JSON.stringify({
  url: String(url),
  method: init.method ?? 'GET'
}), {
  status: 200,
  headers: { 'Content-Type': 'application/json' }
});

try {
  const data = await get('httpbin.get');
  console.assert(data && data.json() && data.json().url && data.json().url.includes('httpbin.org'), 'get() returns wrapper with .json()');
  console.assert(typeof data.text === 'function', 'wrapper has .text()');
  console.assert(data.json('.url').includes('httpbin.org'), '.json(jqQuery) runs jq');

  console.log(data.text());
  console.log(data.json());
} finally {
  globalThis.fetch = originalFetch;
}

console.log('Import test OK');
