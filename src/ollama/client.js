/**
 * Ollama Cloud Client
 * Handles communication with Ollama Cloud API with multi-key support
 */

import {
    OLLAMA_CLOUD_BASE_URL,
    MAX_RETRIES,
    RETRY_DELAY_MS
} from '../constants.js';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';
import { sleep, isNetworkError } from '../utils/helpers.js';
import { convertAnthropicToOllama, convertOllamaToAnthropic } from '../format/converter.js';

/**
 * Try a request with current API key, rotate on failure
 * @param {string} url - API URL
 * @param {Object} options - Fetch options
 * @returns {Promise<Response>} Fetch response
 */
async function fetchWithKeyRotation(url, options, maxAttempts = null) {
    const keys = config.getApiKeys();
    const maxKeyAttempts = maxAttempts || keys.length || 1;
    let lastError;
    
    for (let keyAttempt = 0; keyAttempt < maxKeyAttempts; keyAttempt++) {
        const apiKey = config.getApiKey();
        
        if (!apiKey) {
            throw new Error('No API key configured');
        }
        
        // Update Authorization header with current key
        options.headers = {
            ...options.headers,
            'Authorization': `Bearer ${apiKey}`
        };
        
        logger.debug(`[OllamaClient] Using API key ${config.getCurrentKeyIndex() + 1}/${keys.length}`);
        
        try {
            const response = await fetch(url, options);
            
            // If 401 (auth error), rotate key and retry
            if (response.status === 401) {
                logger.warn(`[OllamaClient] API key ${config.getCurrentKeyIndex() + 1} invalid, rotating...`);
                config.rotateApiKey();
                continue;
            }
            
            // If rate limited (429), rotate key and retry
            if (response.status === 429 && keys.length > 1) {
                logger.warn(`[OllamaClient] Rate limited on key ${config.getCurrentKeyIndex() + 1}, rotating...`);
                config.rotateApiKey();
                // Add small delay before retry
                await sleep(1000);
                continue;
            }
            
            return response;
            
        } catch (error) {
            lastError = error;
            
            // If it's a network error, rotate key and retry
            if (isNetworkError(error) && keys.length > 1) {
                logger.warn(`[OllamaClient] Network error with key ${config.getCurrentKeyIndex() + 1}, rotating...`);
                config.rotateApiKey();
                await sleep(RETRY_DELAY_MS);
                continue;
            }
            
            throw error;
        }
    }
    
    throw lastError || new Error('All API keys exhausted');
}

/**
 * Send a chat message to Ollama Cloud
 * @param {Object} anthropicRequest - Anthropic-format request
 * @param {Object} accountManager - Account manager (for compatibility, not used in Ollama Cloud)
 * @returns {Promise<Object>} Anthropic-format response
 */
export async function sendMessage(anthropicRequest, accountManager = null) {
    const ollamaRequest = convertAnthropicToOllama(anthropicRequest);
    
    const url = `${config.get('ollamaBaseUrl') || OLLAMA_CLOUD_BASE_URL}/chat`;
    const keys = config.getApiKeys();
    
    logger.debug(`[OllamaClient] Sending request to ${url}`);
    logger.debug(`[OllamaClient] Model: ${ollamaRequest.model}`);
    logger.debug(`[OllamaClient] Available keys: ${keys.length}`);
    
    let lastError;
    
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        try {
            const response = await fetchWithKeyRotation(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(ollamaRequest)
            });
            
            if (!response.ok) {
                const errorText = await response.text();
                const statusCode = response.status;
                
                logger.warn(`[OllamaClient] Error ${statusCode}: ${errorText}`);
                
                // Handle rate limiting without key rotation (already handled in fetchWithKeyRotation)
                if (statusCode === 429) {
                    const retryAfter = response.headers.get('retry-after');
                    const waitMs = retryAfter ? parseInt(retryAfter, 10) * 1000 : RETRY_DELAY_MS * (attempt + 1);
                    logger.warn(`[OllamaClient] Rate limited, waiting ${waitMs}ms...`);
                    await sleep(waitMs);
                    continue;
                }
                
                // Handle auth errors (already handled in fetchWithKeyRotation)
                if (statusCode === 401) {
                    throw new Error('authentication_error: All API keys invalid');
                }
                
                // Handle other errors
                throw new Error(`API error ${statusCode}: ${errorText}`);
            }
            
            const data = await response.json();
            return convertOllamaToAnthropic(data, anthropicRequest.model);
            
        } catch (error) {
            logger.warn(`[OllamaClient] Attempt ${attempt + 1} failed:`, error.message);
            
            if (isNetworkError(error) && attempt < MAX_RETRIES - 1) {
                await sleep(RETRY_DELAY_MS);
                continue;
            }
            
            lastError = error;
        }
    }
    
    throw lastError || new Error('Max retries exceeded');
}

/**
 * Send a streaming chat message to Ollama Cloud
 * @param {Object} anthropicRequest - Anthropic-format request
 * @param {Object} accountManager - Account manager (for compatibility)
 * @yields {Object} Anthropic-format SSE events
 */
export async function* sendMessageStream(anthropicRequest, accountManager = null) {
    const ollamaRequest = convertAnthropicToOllama(anthropicRequest);
    ollamaRequest.stream = true;
    
    const url = `${config.get('ollamaBaseUrl') || OLLAMA_CLOUD_BASE_URL}/chat`;
    const keys = config.getApiKeys();
    
    logger.debug(`[OllamaClient] Starting streaming request to ${url}`);
    logger.debug(`[OllamaClient] Model: ${ollamaRequest.model}`);
    logger.debug(`[OllamaClient] Available keys: ${keys.length}`);
    
    let response;
    let keyAttempt = 0;
    
    while (keyAttempt < keys.length) {
        try {
            response = await fetchWithKeyRotation(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(ollamaRequest)
            });
            
            if (response.ok) {
                break;
            }
            
            // If not ok, check if we should retry with another key
            if (response.status === 401 || response.status === 429) {
                keyAttempt++;
                if (keyAttempt < keys.length) {
                    logger.warn(`[OllamaClient] Key ${keyAttempt} failed with ${response.status}, trying next...`);
                    continue;
                }
            }
            
            const errorText = await response.text();
            throw new Error(`API error ${response.status}: ${errorText}`);
            
        } catch (error) {
            if (keyAttempt >= keys.length - 1) {
                throw error;
            }
            keyAttempt++;
            logger.warn(`[OllamaClient] Attempt ${keyAttempt} failed, trying next key...`);
        }
    }
    
    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`API error ${response.status}: ${errorText}`);
    }
    
    if (!response.body) {
        throw new Error('No response body');
    }
    
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let content = '';
    let firstChunk = true;
    
    try {
        while (true) {
            const { done, value } = await reader.read();
            
            if (done) {
                break;
            }
            
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';
            
            for (const line of lines) {
                if (!line.trim() || line.startsWith(':')) continue; // Skip SSE comments
                
                try {
                    const data = JSON.parse(line);
                    
                    if (data.message?.content) {
                        content += data.message.content;
                        
                        // Send content chunk
                        yield {
                            type: 'content_block_delta',
                            delta: {
                                type: 'text_delta',
                                text: data.message.content
                            },
                            index: 0
                        };
                    }
                    
                    if (data.done) {
                        // Send message stop event - content as array
                        yield {
                            type: 'message_stop',
                            message: {
                                id: `msg_${Date.now()}`,
                                type: 'message',
                                role: 'assistant',
                                content: [
                                    {
                                        type: 'text',
                                        text: content
                                    }
                                ],
                                model: anthropicRequest.model,
                                stop_reason: 'end_turn',
                                stop_sequence: null,
                                usage: {
                                    input_tokens: data.prompt_eval_count || 0,
                                    output_tokens: data.eval_count || 0
                                }
                            }
                        };
                    }
                    
                    firstChunk = false;
                } catch (e) {
                    logger.debug(`[OllamaClient] Failed to parse SSE line: ${line}`);
                }
            }
        }
    } finally {
        reader.releaseLock();
    }
}

/**
 * List available models from Ollama Cloud
 * @returns {Promise<Object>} List of models in OpenAI format
 */
export async function listModels() {
    const url = `${config.get('ollamaBaseUrl') || OLLAMA_CLOUD_BASE_URL}/tags`;
    const keys = config.getApiKeys();
    
    logger.debug(`[OllamaClient] Fetching models from ${url}`);
    logger.debug(`[OllamaClient] Available keys: ${keys.length}`);
    
    const response = await fetchWithKeyRotation(url, {
        method: 'GET'
    });
    
    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to list models: ${response.status} - ${errorText}`);
    }
    
    const data = await response.json();
    
    // Convert to OpenAI-compatible format
    return {
        object: 'list',
        data: data.models.map(model => ({
            id: model.name,
            object: 'model',
            created: model.modified_at ? new Date(model.modified_at).getTime() / 1000 : Math.floor(Date.now() / 1000),
            owned_by: 'ollama',
            permission: [],
            root: model.name,
            parent_model: null,
            freeze: false,
            digest: model.digest || null,
            size: model.size || null
        }))
    };
}

/**
 * Check if a model is valid
 * @param {string} modelId - Model ID to check
 * @returns {Promise<boolean>} True if valid
 */
export async function isValidModel(modelId) {
    try {
        const models = await listModels();
        return models.data.some(m => m.id === modelId);
    } catch (error) {
        logger.warn(`[OllamaClient] Failed to validate model ${modelId}:`, error.message);
        return false;
    }
}
