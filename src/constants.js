/**
 * Constants and defaults
 */

export const DEFAULT_PORT = 8080;
export const DEFAULT_HOST = '0.0.0.0';
export const OLLAMA_CLOUD_BASE_URL = 'https://ollama.com/api';
export const OLLAMA_CLOUD_V1_URL = 'https://ollama.com/v1';

// Request body limit (10MB)
export const REQUEST_BODY_LIMIT = '10mb';

// Default model
export const DEFAULT_MODEL = 'qwen3-coder-next';

// Anthropic API defaults
export const DEFAULT_MAX_TOKENS = 4096;
export const DEFAULT_TEMPERATURE = 0.7;
export const DEFAULT_TOP_P = 0.9;

// Rate limiting
export const MAX_RETRIES = 3;
export const RETRY_DELAY_MS = 1000;
export const REQUEST_TIMEOUT_MS = 120000; // 2 minutes
