/**
 * Configuration Management
 * Loads from config.json or environment variables
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Default configuration
const DEFAULT_CONFIG = {
    port: 8080,
    host: '0.0.0.0',
    ollamaBaseUrl: 'https://ollama.com/api',
    apiKey: null, // Will use OLLAMA_API_KEY env var
    apiKeys: [], // Array of API keys for rotation
    defaultModel: 'qwen3-coder-next',
    modelMapping: {},
    debug: false
};

class Config {
    constructor() {
        this.config = { ...DEFAULT_CONFIG };
        this.currentKeyIndex = 0;
        this.loadConfig();
    }

    loadConfig() {
        // Try to load from config.json
        const configPath = path.join(process.cwd(), 'config.json');
        
        if (fs.existsSync(configPath)) {
            try {
                const fileConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
                this.config = { ...DEFAULT_CONFIG, ...fileConfig };
                
                // Support both apiKey (single) and apiKeys (array)
                if (this.config.apiKey && !this.config.apiKeys?.length) {
                    this.config.apiKeys = [this.config.apiKey];
                }
            } catch (error) {
                console.error('Failed to load config.json:', error.message);
            }
        }

        // Override with environment variables
        if (process.env.PORT) {
            this.config.port = parseInt(process.env.PORT, 10);
        }
        if (process.env.HOST) {
            this.config.host = process.env.HOST;
        }
        if (process.env.OLLAMA_BASE_URL) {
            this.config.ollamaBaseUrl = process.env.OLLAMA_BASE_URL;
        }
        if (process.env.OLLAMA_API_KEY) {
            // Support comma-separated API keys
            const keys = process.env.OLLAMA_API_KEY.split(',').map(k => k.trim()).filter(Boolean);
            this.config.apiKeys = keys;
        }
        if (process.env.ANTHROPIC_API_KEY) {
            const keys = process.env.ANTHROPIC_API_KEY.split(',').map(k => k.trim()).filter(Boolean);
            this.config.apiKeys = keys;
        }
        if (process.env.DEFAULT_MODEL) {
            this.config.defaultModel = process.env.DEFAULT_MODEL;
        }
        if (process.env.DEBUG === 'true') {
            this.config.debug = true;
        }
    }

    get(key) {
        return this.config[key];
    }

    // Get current API key with rotation
    getApiKey() {
        const keys = this.config.apiKeys || [];
        if (keys.length === 0) {
            return null;
        }
        return keys[this.currentKeyIndex % keys.length];
    }

    // Get all API keys
    getApiKeys() {
        return this.config.apiKeys || [];
    }

    // Rotate to next API key
    rotateApiKey() {
        const keys = this.config.apiKeys || [];
        if (keys.length > 1) {
            this.currentKeyIndex = (this.currentKeyIndex + 1) % keys.length;
            console.log(`[Config] Rotated to API key ${this.currentKeyIndex + 1}/${keys.length}`);
        }
        return this.getApiKey();
    }

    // Get current key index
    getCurrentKeyIndex() {
        return this.currentKeyIndex;
    }

    get all() {
        return { ...this.config };
    }
}

export const config = new Config();
export default config;
