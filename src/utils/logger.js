/**
 * Logger utility with colored output
 */

class Logger {
    constructor() {
        this.debugEnabled = false;
        this.colors = {
            reset: '\x1b[0m',
            red: '\x1b[31m',
            green: '\x1b[32m',
            yellow: '\x1b[33m',
            blue: '\x1b[34m',
            magenta: '\x1b[35m',
            cyan: '\x1b[36m',
            gray: '\x1b[90m'
        };
    }

    setDebug(enabled) {
        this.debugEnabled = enabled;
    }

    isDebugEnabled() {
        return this.debugEnabled;
    }

    log(...args) {
        console.log(...args);
    }

    info(message, ...args) {
        console.log(`${this.colors.cyan}[INFO]${this.colors.reset} ${message}`, ...args);
    }

    success(message, ...args) {
        console.log(`${this.colors.green}[SUCCESS]${this.colors.reset} ${message}`, ...args);
    }

    warn(message, ...args) {
        console.warn(`${this.colors.yellow}[WARN]${this.colors.reset} ${message}`, ...args);
    }

    error(message, ...args) {
        console.error(`${this.colors.red}[ERROR]${this.colors.reset} ${message}`, ...args);
    }

    debug(message, ...args) {
        if (this.debugEnabled) {
            console.log(`${this.colors.gray}[DEBUG]${this.colors.reset} ${message}`, ...args);
        }
    }
}

export const logger = new Logger();
export default logger;
