# apicli

<img src="data:image/svg+xml;utf8,%3Csvg width='48' height='48' viewBox='0 0 48 48' xmlns='http://www.w3.org/2000/svg'%3E%3Crect width='48' height='48' rx='12' fill='%2336b5ff'/%3E%3Cpath d='M15 24h18M24 15l9 9-9 9' stroke='white' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E" alt="apicli logo" width="48" height="48" />

A quick and flexible API tool for calling services from the command line or as a Bun module.

## Installation

```bash
npm -g install beachdevs/apicli
```

This installs the latest release globally. On first run, `apicli` copies the package `apicli.yaml` into `~/.apicli/apicli.yaml` if no user config exists.

## CLI Usage

A single `apicli.yaml` (either the default copied into `~/.apicli/apicli.yaml` or a custom one passed via `-config <path>`) defines all APIs. Run `apicli` with no arguments to print the effective config path before any other output.

**Options:** `-time` — print request duration; `-debug` — print fetch request/response info to stderr; `-config <path>` — use a custom `.yaml` file.

```bash
# List all available APIs
apicli ls

# Alias for ls
apicli list openai

# Filter APIs
apicli ls httpbin

# Copy one API definition into ./apicli.yaml
apicli get httpbin.get

# Use a custom config file
apicli -config ./custom.yaml ls
apicli -config ~/my-apis.yaml httpbin.get

# Show matching lines from config
apicli help httpbin

# Call an API
apicli httpbin.get

# Call an API with parameters
apicli httpbin.get foo=bar

# Call an API requiring keys
apicli openai.chat API_KEY=$OPENAI_API_KEY MODEL=gpt-4o-mini PROMPT="Hello!"

# OpenRouter with optional provider
apicli openrouter.chat API_KEY=$OPENROUTER_API_KEY MODEL=openai/gpt-4o-mini PROVIDER=openai PROMPT="Hello!"

# Cerebras (API_KEY or CEREBRAS_API_KEY)
apicli cerebras.chat API_KEY=$CEREBRAS_API_KEY MODEL=llama3.1-8b PROMPT="Hello!"

# Time the request
apicli -time httpbin.get

# Debug: show request/response info
apicli -debug httpbin.get

# API example
apicli catfact.getFact | jq ".fact"
```

## Library Usage

Import the module to use the same logic in your own applications.

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
