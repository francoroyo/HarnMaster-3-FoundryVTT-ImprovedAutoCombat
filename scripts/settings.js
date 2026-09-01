import { MODULE_ID, SETTINGS } from "./constants.js";

export function registerSettings(game = globalThis.game) {
  game.settings.register(MODULE_ID, SETTINGS.ENABLED, {
    name: "HM3IAC.Settings.Enabled.Name",
    hint: "HM3IAC.Settings.Enabled.Hint",
    scope: "world",
    config: true,
    type: Boolean,
    default: true,
    requiresReload: true
  });

  game.settings.register(MODULE_ID, SETTINGS.DEBUG_LOGGING, {
    name: "HM3IAC.Settings.DebugLogging.Name",
    hint: "HM3IAC.Settings.DebugLogging.Hint",
    scope: "client",
    config: true,
    type: Boolean,
    default: false
  });
}

