/**
 * Helper utilities
 */

/**
 * Sleep for specified milliseconds
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise<void>}
 */
export function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Check if response is a network error
 * @param {Error} error - Error to check
 * @returns {boolean}
 */
export function isNetworkError(error) {
    const message = error.message || '';
    return (
        message.includes('ECONNREFUSED') ||
        message.includes('ENOTFOUND') ||
        message.includes('ETIMEDOUT') ||
        message.includes('socket hang up') ||
        message.includes('fetch failed')
    );
}

/**
 * Parse error message to extract status code
 * @param {string} text - Error text
 * @returns {number|null}
 */
export function parseStatusCode(text) {
    const match = text.match(/"status":\s*(\d+)|HTTP[\/\s](\d+)/i);
    if (match) {
        return parseInt(match[1] || match[2], 10);
    }
    return null;
}

/**
 * Get current timestamp in ISO format
 * @returns {string}
 */
export function getTimestamp() {
    return new Date().toISOString();
}

/**
 * Format duration in milliseconds to human readable
 * @param {number} ms - Duration in milliseconds
 * @returns {string}
 */
export function formatDuration(ms) {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    if (ms < 3600000) return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
    return `${Math.floor(ms / 3600000)}h ${Math.floor((ms % 3600000) / 60000)}m`;
}
