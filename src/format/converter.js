/**
 * Format Converter
 * Converts between Anthropic and Ollama formats
 */

import {
  DEFAULT_MAX_TOKENS,
  DEFAULT_TEMPERATURE,
  DEFAULT_TOP_P,
} from "../constants.js";

/**
 * Convert Anthropic request to Ollama format
 * @param {Object} anthropicRequest - Anthropic-format request
 * @returns {Object} Ollama-format request
 */
export function convertAnthropicToOllama(anthropicRequest) {
  const { model, messages, max_tokens, temperature, top_p, tools, system } =
    anthropicRequest;

  // Build messages array
  const ollamaMessages = [];

  // Add system message if present
  if (system) {
    ollamaMessages.push({
      role: "system",
      content: typeof system === "string" ? system : system[0]?.text || "",
    });
  }

  // Convert messages
  for (const msg of messages) {
    const role =
      msg.role === "user"
        ? "user"
        : msg.role === "assistant"
          ? "assistant"
          : "user";

    // Handle content - can be string or array
    if (typeof msg.content === "string") {
      ollamaMessages.push({ role, content: msg.content });
    } else if (Array.isArray(msg.content)) {
      // Handle content blocks
      let content = "";
      for (const block of msg.content) {
        if (block.type === "text") {
          content += block.text;
        } else if (block.type === "tool_use") {
          // Ollama doesn't support tool_use in the same way
          // Convert to a text representation
          content += `[tool_call: ${block.name}(${JSON.stringify(block.input)})]`;
        } else if (block.type === "tool_result") {
          content += `[tool_result: ${block.content}]`;
        }
      }
      if (content) {
        ollamaMessages.push({ role, content });
      }
    }
  }

  // Build options
  const options = {};
  if (temperature !== undefined) options.temperature = temperature;
  if (top_p !== undefined) options.top_p = top_p;
  if (max_tokens !== undefined) options.num_predict = max_tokens;

  // Build request
  const ollamaRequest = {
    model: model,
    messages: ollamaMessages,
    stream: false,
    options,
  };

  return ollamaRequest;
}

/**
 * Convert Ollama response to Anthropic format
 * @param {Object} ollamaResponse - Ollama-format response
 * @param {string} model - Model name
 * @returns {Object} Anthropic-format response
 */
export function convertOllamaToAnthropic(ollamaResponse, model) {
  const { message, done, prompt_eval_count, eval_count } = ollamaResponse;

  // Handle different response structures
  let content = "";
  if (message) {
    if (typeof message.content === "string") {
      content = message.content;
    } else if (message.content && typeof message.content === "object") {
      // For thinking models - get content from the object
      content =
        message.content.content ||
        message.content.text ||
        message.content ||
        "";
    } else if (typeof message === "string") {
      content = message;
    }
  }

  // Claude Code expects content as an array of text blocks
  return {
    id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    type: "message",
    role: "assistant",
    content: [
      {
        type: "text",
        text: content,
      },
    ],
    model: model,
    stop_reason: done ? "end_turn" : null,
    stop_sequence: null,
    usage: {
      input_tokens: prompt_eval_count || 0,
      output_tokens: eval_count || content.length || 0,
    },
  };
}

/**
 * Convert Ollama streaming chunk to Anthropic SSE event
 * @param {Object} chunk - Ollama streaming chunk
 * @param {string} model - Model name
 * @returns {Object|null} Anthropic-format event or null to skip
 */
export function convertOllamaStreamToAnthropic(chunk, model) {
  if (chunk.message?.content !== undefined) {
    return {
      type: "content_block_delta",
      delta: {
        type: "text_delta",
        text: chunk.message.content,
      },
      index: 0,
    };
  }

  if (chunk.done) {
    return {
      type: "message_stop",
      message: {
        id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        type: "message",
        role: "assistant",
        content: "",
        model: model,
        stop_reason: "end_turn",
        stop_sequence: null,
        usage: {
          input_tokens: chunk.prompt_eval_count || 0,
          output_tokens: chunk.eval_count || 0,
        },
      },
    };
  }

  return null;
}

/**
 * Convert Anthropic tools to Ollama format (limited support)
 * @param {Array} tools - Anthropic tools array
 * @returns {Object|null} Ollama-compatible tools or null
 */
export function convertToolsToOllama(tools) {
  // Ollama has limited tool support - convert to JSON schema if possible
  if (!tools || tools.length === 0) return null;

  // Note: Ollama's tool calling support varies by model
  // This is a best-effort conversion
  return null;
}

// ─── OpenAI ↔ Ollama ───────────────────────────────────────────────────────

/**
 * Convert OpenAI /v1/chat/completions request to Ollama format.
 * OpenAI format: { model, messages, stream, temperature, top_p, max_tokens, tools }
 * Ollama format: { model, messages, stream, options: { temperature, top_p, num_predict } }
 *
 * @param {Object} openaiRequest - OpenAI-format request body
 * @returns {Object} Ollama-format request
 */
export function convertOpenAIToOllama(openaiRequest) {
  const { model, messages, temperature, top_p, max_tokens, stream } =
    openaiRequest;

  // Ollama messages use the same shape as OpenAI (role + content string),
  // but content may be an array of content parts — flatten to string.
  const ollamaMessages = (messages || []).map((msg) => {
    let content = "";
    if (typeof msg.content === "string") {
      content = msg.content;
    } else if (Array.isArray(msg.content)) {
      content = msg.content
        .map((part) => {
          if (part.type === "text") return part.text;
          if (part.type === "image_url")
            return `[image: ${part.image_url?.url || ""}]`;
          return "";
        })
        .join("");
    }
    return { role: msg.role, content };
  });

  const options = {};
  if (temperature !== undefined) options.temperature = temperature;
  if (top_p !== undefined) options.top_p = top_p;
  if (max_tokens !== undefined) options.num_predict = max_tokens;

  return {
    model,
    messages: ollamaMessages,
    stream: stream || false,
    options,
  };
}

/**
 * Convert Ollama non-streaming response to OpenAI chat completion format.
 *
 * @param {Object} ollamaResponse - Ollama response body
 * @param {string} model - Model name to echo back
 * @returns {Object} OpenAI-format chat completion
 */
export function convertOllamaToOpenAI(ollamaResponse, model) {
  const { message, done, prompt_eval_count, eval_count } = ollamaResponse;

  let content = "";
  if (message) {
    if (typeof message.content === "string") {
      content = message.content;
    } else if (message.content && typeof message.content === "object") {
      content = message.content.content || message.content.text || "";
    }
    // Handle thinking models (kimi-k2.5, glm-5, etc.)
    // Combine thinking with content if thinking exists
    if (message.thinking) {
      content = message.thinking + (content ? "\n\n" + content : "");
    }
  }

  return {
    id: `chatcmpl-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [
      {
        index: 0,
        message: {
          role: "assistant",
          content,
        },
        finish_reason: done ? "stop" : null,
      },
    ],
    usage: {
      prompt_tokens: prompt_eval_count || 0,
      completion_tokens: eval_count || 0,
      total_tokens: (prompt_eval_count || 0) + (eval_count || 0),
    },
  };
}

/**
 * Convert a single Ollama streaming chunk to an OpenAI SSE chat.completion.chunk.
 * Returns null when the chunk should be skipped.
 *
 * @param {Object} chunk - Parsed Ollama stream JSON line
 * @param {string} model - Model name
 * @returns {Object|null} OpenAI-format streaming chunk or null
 */
export function convertOllamaStreamToOpenAI(chunk, model) {
  const id = `chatcmpl-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  if (chunk.done) {
    // Final chunk — signal stop
    return {
      id,
      object: "chat.completion.chunk",
      created: Math.floor(Date.now() / 1000),
      model,
      choices: [
        {
          index: 0,
          delta: {},
          finish_reason: "stop",
        },
      ],
    };
  }

  const msg = chunk.message;
  if (!msg) return null;

  // Handle thinking models - output thinking in delta.content
  let text = "";
  if (msg.content) {
    text =
      typeof msg.content === "string"
        ? msg.content
        : msg.content.content || msg.content.text || "";
  }
  if (msg.thinking) {
    text = msg.thinking + (text ? "\n\n" + text : "");
  }

  if (!text) return null;

  return {
    id,
    object: "chat.completion.chunk",
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [
      {
        index: 0,
        delta: {
          role: "assistant",
          content: text,
        },
        finish_reason: null,
      },
    ],
  };
}
