/**
 * Ollama Cloud Client — OpenAI-compatible interface
 * Handles /v1/chat/completions requests from OpenCode and other OpenAI-compatible tools
 */

import {
  OLLAMA_CLOUD_BASE_URL,
  MAX_RETRIES,
  RETRY_DELAY_MS,
} from "../constants.js";
import { config } from "../config.js";
import { logger } from "../utils/logger.js";
import { sleep, isNetworkError } from "../utils/helpers.js";
import {
  convertOpenAIToOllama,
  convertOllamaToOpenAI,
  convertOllamaStreamToOpenAI,
} from "../format/converter.js";

/**
 * Fetch with API key rotation (shared logic)
 */
async function fetchWithKeyRotation(url, options) {
  const keys = config.getApiKeys();
  const maxAttempts = keys.length || 1;
  let lastError;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const apiKey = config.getApiKey();
    if (!apiKey) throw new Error("No API key configured");

    options.headers = {
      ...options.headers,
      Authorization: `Bearer ${apiKey}`,
    };

    logger.debug(
      `[OpenAIClient] Using API key ${config.getCurrentKeyIndex() + 1}/${keys.length}`,
    );

    try {
      const response = await fetch(url, options);

      if (response.status === 401) {
        logger.warn(
          `[OpenAIClient] Key ${config.getCurrentKeyIndex() + 1} invalid, rotating...`,
        );
        config.rotateApiKey();
        continue;
      }

      if (response.status === 429 && keys.length > 1) {
        logger.warn(
          `[OpenAIClient] Rate limited on key ${config.getCurrentKeyIndex() + 1}, rotating...`,
        );
        config.rotateApiKey();
        await sleep(1000);
        continue;
      }

      return response;
    } catch (error) {
      lastError = error;
      if (isNetworkError(error) && keys.length > 1) {
        logger.warn(`[OpenAIClient] Network error, rotating key...`);
        config.rotateApiKey();
        await sleep(RETRY_DELAY_MS);
        continue;
      }
      throw error;
    }
  }

  throw lastError || new Error("All API keys exhausted");
}

/**
 * Send a non-streaming OpenAI-format chat completion request.
 * @param {Object} openaiRequest - OpenAI-format request body
 * @returns {Promise<Object>} OpenAI-format response
 */
export async function sendOpenAIMessage(openaiRequest) {
  const ollamaRequest = convertOpenAIToOllama(openaiRequest);
  ollamaRequest.stream = false;

  const url = `${config.get("ollamaBaseUrl") || OLLAMA_CLOUD_BASE_URL}/chat`;
  logger.debug(`[OpenAIClient] POST ${url} model=${ollamaRequest.model}`);

  let lastError;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const response = await fetchWithKeyRotation(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(ollamaRequest),
      });

      if (!response.ok) {
        const errorText = await response.text();
        const statusCode = response.status;

        if (statusCode === 429) {
          const retryAfter = response.headers.get("retry-after");
          const waitMs = retryAfter
            ? parseInt(retryAfter, 10) * 1000
            : RETRY_DELAY_MS * (attempt + 1);
          logger.warn(`[OpenAIClient] Rate limited, waiting ${waitMs}ms...`);
          await sleep(waitMs);
          continue;
        }

        if (statusCode === 401)
          throw new Error("authentication_error: All API keys invalid");
        throw new Error(`API error ${statusCode}: ${errorText}`);
      }

      const data = await response.json();
      return convertOllamaToOpenAI(data, openaiRequest.model);
    } catch (error) {
      logger.warn(
        `[OpenAIClient] Attempt ${attempt + 1} failed:`,
        error.message,
      );

      if (isNetworkError(error) && attempt < MAX_RETRIES - 1) {
        await sleep(RETRY_DELAY_MS);
        continue;
      }

      lastError = error;
    }
  }

  throw lastError || new Error("Max retries exceeded");
}

/**
 * Stream an OpenAI-format chat completion.
 * Yields OpenAI chat.completion.chunk objects.
 *
 * @param {Object} openaiRequest - OpenAI-format request body
 * @yields {Object} OpenAI streaming chunk
 */
export async function* sendOpenAIMessageStream(openaiRequest) {
  const ollamaRequest = convertOpenAIToOllama(openaiRequest);
  ollamaRequest.stream = true;

  const url = `${config.get("ollamaBaseUrl") || OLLAMA_CLOUD_BASE_URL}/chat`;
  logger.debug(
    `[OpenAIClient] Stream POST ${url} model=${ollamaRequest.model}`,
  );

  const keys = config.getApiKeys();
  let response;
  let keyAttempt = 0;

  while (keyAttempt < Math.max(keys.length, 1)) {
    try {
      response = await fetchWithKeyRotation(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(ollamaRequest),
      });

      if (response.ok) break;

      if (response.status === 401 || response.status === 429) {
        keyAttempt++;
        if (keyAttempt < keys.length) {
          logger.warn(
            `[OpenAIClient] Key ${keyAttempt} failed (${response.status}), trying next...`,
          );
          continue;
        }
      }

      const errorText = await response.text();
      throw new Error(`API error ${response.status}: ${errorText}`);
    } catch (error) {
      if (keyAttempt >= keys.length - 1) throw error;
      keyAttempt++;
      logger.warn(
        `[OpenAIClient] Attempt ${keyAttempt} failed, trying next key...`,
      );
    }
  }

  if (!response || !response.ok) {
    const errorText = (await response?.text()) || "No response";
    throw new Error(`API error: ${errorText}`);
  }

  if (!response.body) throw new Error("No response body");

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (!line.trim() || line.startsWith(":")) continue;

        try {
          const data = JSON.parse(line);
          const chunk = convertOllamaStreamToOpenAI(data, openaiRequest.model);
          if (chunk) yield chunk;
        } catch {
          logger.debug(`[OpenAIClient] Failed to parse stream line: ${line}`);
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}
