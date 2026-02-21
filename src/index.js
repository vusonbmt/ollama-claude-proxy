/**
 * Ollama Cloud Proxy
 * Entry point - starts the proxy server
 */

import app from './server.js';
import { DEFAULT_PORT, DEFAULT_HOST } from './constants.js';
import { logger } from './utils/logger.js';
import { config } from './config.js';

// Parse command line arguments
const args = process.argv.slice(2);
const isDebug = args.includes('--debug') || process.env.DEBUG === 'true';

// Initialize logger and devMode
logger.setDebug(isDebug);

if (isDebug) {
    config.config.debug = true;
    logger.debug('Developer mode enabled');
}

const PORT = config.get('port') || DEFAULT_PORT;
const HOST = config.get('host') || DEFAULT_HOST;

const server = app.listen(PORT, HOST, () => {
    const address = server.address();
    const boundHost = typeof address === 'string' ? address : address.address;
    const boundPort = typeof address === 'string' ? null : address.port;

    console.clear();

    const border = '║';
    const align = (text) => text + ' '.repeat(Math.max(0, 60 - text.length));
    const align4 = (text) => text + ' '.repeat(Math.max(0, 58 - text.length));

    const apiKeys = config.getApiKeys();
    const apiKeyStatus = apiKeys.length > 0 ? `${apiKeys.length} key(s)` : 'NOT SET';
    const baseUrl = config.get('ollamaBaseUrl') || 'https://ollama.com/api';
    const defaultModel = config.get('defaultModel') || 'qwen3-coder-next';

    logger.log(`
╔══════════════════════════════════════════════════════════════╗
║           Ollama Cloud Proxy Server v1.0.0                   ║
╠══════════════════════════════════════════════════════════════╣
║                                                              ║
║  Server and WebUI running at: http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}          ║
║  Bound to: ${boundHost}:${boundPort}                                          ║
║                                                              ║
║  Status:                                                     ║
║    ${align4(`✓ API Keys: ${apiKeyStatus}`)}${border}
║    ${align4(`✓ Ollama Base URL: ${baseUrl}`)}${border}
║    ${align4(`✓ Default Model: ${defaultModel}`)}${border}
║                                                              ║
║  Endpoints:                                                  ║
║    POST /v1/messages         - Anthropic Messages API         ║
║    GET  /v1/models           - List available models          ║
║    GET  /health              - Health check                  ║
║                                                              ║
║  Usage with Claude Code:                                     ║
║    export ANTHROPIC_BASE_URL=http://localhost:${PORT}          ║
║    export ANTHROPIC_API_KEY=your_api_key                     ║
║    claude                                                    ║
║                                                              ║
║  Environment Variables:                                      ║
║    PORT                Server port (default: 8080)           ║
║    HOST                Bind address (default: 0.0.0.0)       ║
║    OLLAMA_API_KEY     Comma-separated API keys               ║
║    OLLAMA_BASE_URL    Override Ollama Cloud URL              ║
║    DEFAULT_MODEL      Default model to use                    ║
║                                                              ║
║  Configuration:                                             ║
║    Create config.json to customize settings                  ║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝
  `);

    if (apiKeys.length === 0) {
        logger.warn('WARNING: No API keys configured. Set them via environment variable or config.json');
    }

    logger.success(`Server started successfully on port ${PORT}`);
    if (isDebug) {
        logger.warn('Running in DEVELOPER mode - verbose logs enabled');
    }
});

// Graceful shutdown
const shutdown = () => {
    logger.info('Shutting down server...');
    server.close(() => {
        logger.success('Server stopped');
        process.exit(0);
    });

    setTimeout(() => {
        logger.error('Could not close connections in time, forcefully shutting down');
        process.exit(1);
    }, 10000);
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
