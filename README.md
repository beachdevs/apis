# apicli

A quick and flexible API tool for calling services from the command line or as a Node.js module.

## Installation

```bash
git clone https://github.com/beachdevs/apicli.git && cd apicli && ./install.sh
```

This creates `~/.apicli/` for your custom APIs and adds the `apicli` alias to your shell. Run `git pull` to get updates.

## CLI Usage

Built-in APIs are loaded from the repo's `apicli.toml` (or `apis.txt`). Private APIs in `~/.apicli/apicli.toml` (or `apis.txt`) are merged on top — entries with the same `service.name` override the defaults. Add your own APIs there.

**Options:** `-time` — print request duration; `-debug` — print fetch request/response info to stderr; `-config <path>` — use a custom config file (`.toml` or `.txt`).

```bash
# List all available APIs
apicli list

# Filter APIs
apicli list httpbin

# Show the location of the config file(s) being used
apicli where

# Use a custom config file
apicli -config ./custom.toml list
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

// Custom config file (apicli.toml or apis.txt)
const customData = await fetchApi('my-service', 'my-name', {
  configPath: './custom.toml',
  simple: true
});

// With debug: logs request/response info to stderr
const data = await fetchApi('httpbin', 'get', { simple: true, debug: true });
```

## Configuration

### apicli.toml (recommended)

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

### apis.txt (legacy)

Space-separated values with a header. Same variable rules: `$VAR` and `!$VAR`.

```text
service name url method headers body
httpbin get https://httpbin.org/get GET {}
openai chat https://api.openai.com/v1/chat/completions POST "{"Authorization": "Bearer !$API_KEY"}" "{"model": "!$MODEL", "messages": [{"role": "user", "content": "!$PROMPT"}]}"
```

OpenRouter supports optional `$PROVIDER` to prefer a specific provider (e.g. `order: ["openai"]`).
