# apicli

A quick and flexible API tool for calling services from the command line or as a Bun module.

## Quick Start

```bash
npx beachdevs/apicli catfact.getFact
```

## CLI Usage

A single `apicli.yaml` defines all APIs. Use `-config <path>` to point at a custom file.

**Options:** `-time` — print request duration; `-debug` — print fetch request/response info to stderr; `-config <path>` — use a custom `.yaml` file; `fetch <name>` — copy one API definition into `./apicli.yaml`.

```bash
# List all available APIs
npx beachdevs/apicli ls

# Alias for ls
npx beachdevs/apicli list openai

# Filter APIs
npx beachdevs/apicli ls httpbin

# Copy one API definition into ./apicli.yaml
npx beachdevs/apicli fetch echo.ws

# Use a custom config file
npx beachdevs/apicli -config ./custom.yaml ls
npx beachdevs/apicli -config ~/my-apis.yaml httpbin.get

# Show matching lines from config
npx beachdevs/apicli help httpbin

# Call an API
npx beachdevs/apicli httpbin.get

# Call an API with parameters
npx beachdevs/apicli httpbin.get foo=bar

# Call an API requiring keys
npx beachdevs/apicli openai.chat API_KEY=$OPENAI_API_KEY MODEL=gpt-4o-mini PROMPT="Hello!"

# OpenRouter with optional provider
npx beachdevs/apicli openrouter.chat API_KEY=$OPENROUTER_API_KEY MODEL=openai/gpt-4o-mini PROVIDER=openai PROMPT="Hello!"

# Cerebras (API_KEY or CEREBRAS_API_KEY)
npx beachdevs/apicli cerebras.chat API_KEY=$CEREBRAS_API_KEY MODEL=llama3.1-8b PROMPT="Hello!"

# Time the request
npx beachdevs/apicli -time httpbin.get

# Debug: show request/response info
npx beachdevs/apicli -debug httpbin.get

# API example
npx beachdevs/apicli catfact.getFact | jq ".fact"
```

## Code Example

Install globally with Bun or add as a dependency with npm:

```bash
bun add -g beachdevs/apicli
npm install beachdevs/apicli
```

Then import and call from code:

```javascript
import { fetchApi, getRequest, getApis } from 'apicli';

// Simple usage
const res = await fetchApi('httpbin', 'get');
const data = await res.json();

// With variables and aliases (API_KEY, OPENAI_API_KEY, OPENROUTER_API_KEY, CEREBRAS_API_KEY)
const res = await fetchApi('openai', 'chat', {
  vars: {
    API_KEY: 'your-key',
    MODEL: 'gpt-4o',
    PROMPT: 'Hello world'
  }
});

// Custom config file (apicli.yaml)
const customData = await fetchApi('my-service', 'my-name', {
  configPath: './custom.yaml'
});
const customJson = await customData.json();

// With debug: logs request/response info to stderr
const res2 = await fetchApi('httpbin', 'get', { debug: true });
const data2 = await res2.json();
```

## Configuration

### apicli.yaml

Each API is a top-level key named `service.name` (no root object). Use `$VAR` (optional) or `$!VAR` (required) for variable substitution. Use `BEARER $!TOKEN` in `headers` as shorthand for `Authorization: Bearer` + `Content-Type: application/json`.

```yaml
httpbin.get:
  url: https://httpbin.org/get
  method: GET
  headers: {}

openai.chat:
  url: https://api.openai.com/v1/chat/completions
  method: POST
  headers:
    Authorization: "Bearer $!API_KEY"
    Content-Type: application/json
  body: |
    {"model":"$!MODEL","messages":[{"role":"user","content":"$!PROMPT"}]}
```

OpenRouter supports optional `$PROVIDER` to prefer a specific provider (e.g. `order: ["openai"]`).
