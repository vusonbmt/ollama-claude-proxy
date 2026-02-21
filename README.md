# Ollama Claude Proxy

An **Anthropic-compatible API proxy** for **Ollama Cloud** - Use Ollama Cloud models with Claude Code CLI and any tool expecting Anthropic Messages API format.

[![CI/CD](https://github.com/vusonbmt/ollama-claude-proxy/actions/workflows/ci-cd.yml/badge.svg)](https://github.com/vusonbmt/ollama-claude-proxy/actions)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/node/v/ollama-claude-proxy)](https://nodejs.org)

## Features

- **Anthropic-compatible API** - Works with Claude Code CLI, OpenClaw, and any tool expecting Anthropic format
- **Streaming support** - Full SSE streaming for real-time responses
- **Multiple API Keys** - Support for multiple Ollama Cloud API keys with automatic rotation
- **Model Mapping** - Map Claude model names to Ollama Cloud models
- **Easy Configuration** - Via config.json or environment variables

## How It Works

```
┌──────────────────┐     ┌─────────────────────┐     ┌────────────────────────────┐
│   Claude Code    │────▶│  This Proxy Server  │────▶│  Ollama Cloud             │
│   (Anthropic     │     │  (Anthropic →       │     │  (ollama.com/api)         │
│    API format)   │     │   Ollama Cloud)     │     │                           │
└──────────────────┘     └─────────────────────┘     └────────────────────────────┘
```

## Prerequisites

- **Node.js** 18 or later
- **Ollama Cloud API Key(s)** - Get one at https://ollama.com/settings/keys

## Quick Start

### 1. Clone and Install

```bash
git clone https://github.com/vusonbmt/ollama-claude-proxy.git
cd ollama-claude-proxy
npm install
```

### 2. Configure API Key(s)

Create a `config.json` file:

```json
{
  "port": 8080,
  "host": "0.0.0.0",
  "ollamaBaseUrl": "https://ollama.com/api",
  "apiKeys": [
    "YOUR_OLLAMA_API_KEY_1",
    "YOUR_OLLAMA_API_KEY_2"
  ],
  "defaultModel": "qwen3-coder-next",
  "modelMapping": {
    "claude-opus-4-6-thinking": "glm-5",
    "claude-sonnet-4-5-thinking": "minimax-m2.5",
    "claude-haiku-3-5": "qwen3-coder-next"
  },
  "debug": false
}
```

Or use environment variables:

```bash
# Single key
export OLLAMA_API_KEY=your_key_here

# Multiple keys (comma-separated)
export OLLAMA_API_KEY=key1,key2,key3
```

### 3. Start the Proxy

```bash
npm start
```

### 4. Configure Claude Code

**Windows:** `%USERPROFILE%\.claude\settings.json`
**macOS/Linux:** `~/.claude/settings.json`

```json
{
  "env": {
    "ANTHROPIC_AUTH_TOKEN": "test",
    "ANTHROPIC_BASE_URL": "http://localhost:8080",
    "ANTHROPIC_MODEL": "glm-5",
    "ANTHROPIC_DEFAULT_OPUS_MODEL": "glm-5",
    "ANTHROPIC_DEFAULT_SONNET_MODEL": "minimax-m2.5",
    "ANTHROPIC_DEFAULT_HAIKU_MODEL": "qwen3-coder-next"
  }
}
```

### 5. Run Claude Code

```bash
claude
```

## Also Works with OpenCode!

OpenCode already supports Ollama Cloud directly. You can use it without this proxy!

### Using OpenCode with Ollama Cloud

```bash
# Set your Ollama API key
set OLLAMA_API_KEY=your_api_key_here

# Run OpenCode with Ollama Cloud model
opencode -m ollama/minimax-m2.5:cloud
opencode -m ollama/glm-5:cloud
opencode -m ollama/kimi-k2.5:cloud
```

Or set environment variable globally:
```bash
# Windows
setx OLLAMA_API_KEY your_api_key_here

# Linux/macOS
export OLLAMA_API_KEY=your_api_key_here
```

### Available Ollama Cloud Models in OpenCode

- `ollama/glm-5:cloud`
- `ollama/kimi-k2.5:cloud`
- `ollama/minimax-m2.5:cloud`

## Configuration

### config.json Options

| Option | Type | Description | Default |
|--------|------|-------------|---------|
| `port` | number | Server port | `8080` |
| `host` | string | Bind address | `0.0.0.0` |
| `ollamaBaseUrl` | string | Ollama API URL | `https://ollama.com/api` |
| `apiKeys` | array | Array of API keys | `[]` |
| `defaultModel` | string | Default model | `qwen3-coder-next` |
| `modelMapping` | object | Model name mappings | `{}` |
| `debug` | boolean | Enable debug logs | `false` |

### Environment Variables

| Variable | Description |
|----------|-------------|
| `PORT` | Server port |
| `HOST` | Bind address |
| `OLLAMA_API_KEY` | API key(s), comma-separated for multiple |
| `OLLAMA_BASE_URL` | Override Ollama URL |
| `DEFAULT_MODEL` | Default model |
| `DEBUG` | Enable debug logs |

### Model Mapping

Map Claude models to Ollama Cloud models:

```json
{
  "modelMapping": {
    "claude-opus-4-6-thinking": "glm-5",
    "claude-sonnet-4-5-thinking": "minimax-m2.5",
    "claude-haiku-3-5": "qwen3-coder-next"
  }
}
```

## API Endpoints

### POST /v1/messages

Anthropic Messages API endpoint.

```bash
curl -X POST http://localhost:8080/v1/messages \
  -H "Content-Type: application/json" \
  -d '{
    "model": "qwen3-coder-next",
    "messages": [{"role": "user", "content": "Hello!"}],
    "max_tokens": 1024,
    "stream": false
  }'
```

### GET /v1/models

List available models.

```bash
curl http://localhost:8080/v1/models
```

### GET /health

Health check.

```bash
curl http://localhost:8080/health
```

## Available Models

| Model | Size | Description |
|-------|------|-------------|
| `qwen3-coder-next` | 81B | Coding-focused, agentic |
| `qwen3.5` | 397B | Vision-language |
| `minimax-m2.5` | 230B | Productivity & coding |
| `glm-5` | 756B | Advanced coding |
| `deepseek-v3.2` | 688B | Reasoning & agent |
| `kimi-k2.5` | 1.1T | Native multimodal |

Full list: https://ollama.com/search?c=cloud

## Docker

```bash
# Build
docker build -t ollama-claude-proxy .

# Run
docker run -p 8080:8080 \
  -v $(pwd)/config.json:/app/config.json \
  ollama-claude-proxy
```

## Development

```bash
# Install dependencies
npm install

# Run in development mode
npm run dev

# Run tests
npm test
```

## License

MIT License - See [LICENSE](LICENSE) for details.
