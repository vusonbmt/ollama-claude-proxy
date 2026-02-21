/**
 * Express Server - Anthropic-compatible API
 * Proxies to Ollama Cloud
 */

import express from 'express';
import cors from 'cors';
import { sendMessage, sendMessageStream, listModels, isValidModel } from './ollama/client.js';
import { config } from './config.js';
import { REQUEST_BODY_LIMIT, DEFAULT_MODEL } from './constants.js';
import { logger } from './utils/logger.js';

const app = express();

// Disable x-powered-by header for security
app.disable('x-powered-by');

// Middleware
app.use(cors());
app.use(express.json({ limit: REQUEST_BODY_LIMIT }));

/**
 * Parse error message to extract error type, status code, and user-friendly message
 */
function parseError(error) {
    let errorType = 'api_error';
    let statusCode = 500;
    let errorMessage = error.message;

    if (error.message.includes('401') || error.message.includes('authentication_error')) {
        errorType = 'authentication_error';
        statusCode = 401;
        errorMessage = 'Authentication failed. Please check your OLLAMA_API_KEY.';
    } else if (error.message.includes('429') || error.message.includes('rate_limit')) {
        errorType = 'rate_limit_error';
        statusCode = 429;
        errorMessage = 'Rate limit exceeded. Please wait before retrying.';
    } else if (error.message.includes('invalid_request_error')) {
        errorType = 'invalid_request_error';
        statusCode = 400;
    }

    return { errorType, statusCode, errorMessage };
}

// Request logging middleware
app.use((req, res, next) => {
    const start = Date.now();

    res.on('finish', () => {
        const duration = Date.now() - start;
        const status = res.statusCode;
        const logMsg = `[${req.method}] ${req.originalUrl} ${status} (${duration}ms)`;

        if (status >= 500) {
            logger.error(logMsg);
        } else if (status >= 400) {
            logger.warn(logMsg);
        } else {
            logger.debug(logMsg);
        }
    });

    next();
});

// Health check endpoint
app.get('/health', async (req, res) => {
    try {
        const apiKey = config.get('apiKey');
        res.json({
            status: 'ok',
            timestamp: new Date().toISOString(),
            ollamaCloud: {
                configured: !!apiKey,
                baseUrl: config.get('ollamaBaseUrl') || 'https://ollama.com/api'
            }
        });
    } catch (error) {
        logger.error('[API] Health check failed:', error);
        res.status(503).json({
            status: 'error',
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

// List models endpoint (OpenAI-compatible format)
app.get('/v1/models', async (req, res) => {
    try {
        // Check API key
        const apiKey = config.get('apiKey');
        if (!apiKey) {
            return res.status(401).json({
                error: {
                    message: 'API key required. Set OLLAMA_API_KEY environment variable.',
                    type: 'authentication_error',
                    code: 'missing_api_key'
                }
            });
        }

        const models = await listModels();
        res.json(models);
    } catch (error) {
        logger.error('[API] Error listing models:', error);
        const { errorType, statusCode, errorMessage } = parseError(error);
        res.status(statusCode).json({
            error: {
                type: errorType,
                message: errorMessage
            }
        });
    }
});

// Count tokens endpoint - not implemented
app.post('/v1/messages/count_tokens', (req, res) => {
    res.status(501).json({
        type: 'error',
        error: {
            type: 'not_implemented',
            message: 'Token counting is not implemented.'
        }
    });
});

// Main messages endpoint - Anthropic Messages API compatible
app.post('/v1/messages', async (req, res) => {
    try {
        // Check API keys
        const apiKeys = config.getApiKeys();
        if (apiKeys.length === 0) {
            return res.status(401).json({
                type: 'error',
                error: {
                    type: 'authentication_error',
                    message: 'API key required. Set OLLAMA_API_KEY environment variable or apiKeys in config.json.'
                }
            });
        }

        const {
            model,
            messages,
            stream,
            system,
            max_tokens,
            tools,
            tool_choice,
            thinking,
            top_p,
            top_k,
            temperature
        } = req.body;

        // Resolve model
        let requestedModel = model || config.get('defaultModel') || DEFAULT_MODEL;
        
        // Check model mapping (supports both simple string and object format)
        const modelMapping = config.get('modelMapping') || {};
        if (modelMapping[requestedModel]) {
            const targetModel = modelMapping[requestedModel];
            const mapped = typeof targetModel === 'string' ? targetModel : targetModel.mapping;
            logger.info(`[Server] Mapping model ${requestedModel} -> ${mapped}`);
            requestedModel = mapped;
        }

        // Validate required fields
        if (!messages || !Array.isArray(messages)) {
            return res.status(400).json({
                type: 'error',
                error: {
                    type: 'invalid_request_error',
                    message: 'messages is required and must be an array'
                }
            });
        }

        // Build request
        const request = {
            model: requestedModel,
            messages,
            max_tokens: max_tokens || 4096,
            stream: stream || false,
            system,
            tools,
            tool_choice,
            thinking,
            top_p,
            top_k,
            temperature
        };

        logger.info(`[API] Request for model: ${request.model}, stream: ${!!stream}`);

        if (stream) {
            // Handle streaming response
            try {
                res.status(200);
                res.setHeader('Content-Type', 'text/event-stream');
                res.setHeader('Cache-Control', 'no-cache');
                res.setHeader('Connection', 'keep-alive');
                res.setHeader('X-Accel-Buffering', 'no');
                res.flushHeaders();

                const generator = sendMessageStream(request);
                
                for await (const event of generator) {
                    if (event.type === 'message_stop') {
                        // Send final message event
                        res.write(`event: message_start\ndata: ${JSON.stringify({
                            type: 'message_start',
                            message: event.message
                        })}\n\n`);
                        
                        // Send stop event
                        res.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
                    } else if (event.type === 'content_block_delta') {
                        // Send content chunk
                        res.write(`event: content_block_start\ndata: ${JSON.stringify({
                            type: 'content_block_start',
                            index: 0,
                            content_block: { type: 'text', text: '' }
                        })}\n\n`);
                        
                        res.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
                        
                        res.write(`event: content_block_stop\ndata: ${JSON.stringify({
                            type: 'content_block_stop',
                            index: 0
                        })}\n\n`);
                    }
                }
                
                res.end();

            } catch (error) {
                logger.error('[API] Stream error:', error);
                const { errorType, errorMessage } = parseError(error);

                if (!res.headersSent) {
                    return res.status(500).json({
                        type: 'error',
                        error: {
                            type: errorType,
                            message: errorMessage
                        }
                    });
                }

                res.write(`event: error\ndata: ${JSON.stringify({
                    type: 'error',
                    error: { type: errorType, message: errorMessage }
                })}\n\n`);
                res.end();
            }

        } else {
            // Handle non-streaming response
            const response = await sendMessage(request);
            res.json(response);
        }

    } catch (error) {
        logger.error('[API] Error:', error);

        const { errorType, statusCode, errorMessage } = parseError(error);

        if (res.headersSent) {
            res.write(`event: error\ndata: ${JSON.stringify({
                type: 'error',
                error: { type: errorType, message: errorMessage }
            })}\n\n`);
            res.end();
        } else {
            res.status(statusCode).json({
                type: 'error',
                error: {
                    type: errorType,
                    message: errorMessage
                }
            });
        }
    }
});

// Catch-all for unsupported endpoints
app.use('*', (req, res) => {
    res.status(404).json({
        type: 'error',
        error: {
            type: 'not_found_error',
            message: `Endpoint ${req.method} ${req.originalUrl} not found`
        }
    });
});

export default app;
