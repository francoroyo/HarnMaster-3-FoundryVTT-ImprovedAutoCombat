import { MODULE_ID, SETTINGS } from "./constants.js";

function isDebugEnabled() {
  try {
    return Boolean(globalThis.game?.settings?.get(MODULE_ID, SETTINGS.DEBUG_LOGGING));
  } catch {
    return false;
  }
}

function write(method, ...args) {
  globalThis.console?.[method]?.(`${MODULE_ID} |`, ...args);
}

export const logger = Object.freeze({
  debug(...args) {
    if (isDebugEnabled()) write("debug", ...args);
  },
  info(...args) {
    write("info", ...args);
  },
  warn(...args) {
    write("warn", ...args);
  },
  error(...args) {
    write("error", ...args);
  }
});

