# apicli

A quick and flexible API tool for calling services from the command line or as a Node.js module.

## Installation

```bash
npm -g install beachdevs/apicli
```

This installs the latest release globally. `apicli` merges built-in `apicli.toml` with any overrides from `~/.apicli/` automatically.

## CLI Usage

A single `apicli.toml` (the built-in copy from the package or a custom one passed via `-config <path>`) defines all APIs. Use `~/.apicli/apicli.toml` to override or extend defaults. Run `apicli` with no arguments to print the effective config paths before any other output.

**Options:** `-time` — print request duration; `-debug` — print fetch request/response info to stderr; `-config <path>` — use a custom `.toml` file.

```bash
# List all available APIs
apicli ls

# Filter APIs
apicli ls httpbin

# Use a custom config file
apicli -config ./custom.toml ls
apicli -config ~/my-apis.toml httpbin.get

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
const data = await fetchApi('httpbin', 'get', { simple: true });

// With variables and aliases (API_KEY, OPENAI_API_KEY, OPENROUTER_API_KEY, CEREBRAS_API_KEY)
const res = await fetchApi('openai', 'chat', {
  vars: {
    API_KEY: 'your-key',
    MODEL: 'gpt-4o',
    PROMPT: 'Hello world'
  }
});

// Custom config file (apicli.toml)
const customData = await fetchApi('my-service', 'my-name', {
  configPath: './custom.toml',
  simple: true
});

// With debug: logs request/response info to stderr
const data = await fetchApi('httpbin', 'get', { simple: true, debug: true });
```

## Configuration

### apicli.toml

Each API is a section keyed by `service.name`. Use `$VAR` (optional) or `!$VAR` (required) for variable substitution. Use `BEARER !$TOKEN` in `headers` as shorthand for `Authorization: Bearer` + `Content-Type: application/json`.

```toml
[apis."httpbin.get"]
url = "https://httpbin.org/get"
method = "GET"
headers = {}

[apis."openai.chat"]
url = "https://api.openai.com/v1/chat/completions"
method = "POST"
headers = { Authorization = "Bearer !$API_KEY", "Content-Type" = "application/json" }
body = """{"model": "!$MODEL", "messages": [{"role": "user", "content": "!$PROMPT"}]}"""
```

OpenRouter supports optional `$PROVIDER` to prefer a specific provider (e.g. `order: ["openai"]`).
