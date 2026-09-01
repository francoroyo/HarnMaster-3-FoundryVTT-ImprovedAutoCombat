import { createApi } from "./api.js";
import { CombatWorkflowTracker } from "./combat/workflow-tracker.js";
import { MODULE_HOOKS, MODULE_ID, SETTINGS } from "./constants.js";
import { Hm3Adapter } from "./integration/hm3-adapter.js";
import { ImpactController } from "./impact/impact-controller.js";
import { logger } from "./logger.js";
import { registerSettings } from "./settings.js";

const tracker = new CombatWorkflowTracker();
let adapter = null;
let impacts = null;
const api = createApi({ tracker, getAdapter: () => adapter, getImpacts: () => impacts });

Hooks.once("init", () => {
  registerSettings();

  const module = game.modules.get(MODULE_ID);
  if (module) module.api = api;

  logger.info("Initializing.");
});

Hooks.once("ready", async () => {
  adapter = new Hm3Adapter({ game, hooks: Hooks, tracker, logger });
  const diagnostics = adapter.diagnostics();

  if (!diagnostics.ok) {
    logger.error("Compatibility check failed.", diagnostics.issues);
    if (game.user?.isGM) {
      ui.notifications.error(`${MODULE_ID}: ${diagnostics.issues.join(" ")}`);
    }
    return;
  }

  if (game.settings.get(MODULE_ID, SETTINGS.ENABLED)) {
    adapter.install();
    impacts = new ImpactController({ game, hooks: Hooks, logger });
    const installed = await impacts.install();
    if (!installed) {
      logger.error("Deferred impact override disabled.", impacts.diagnostics.issues);
      if (game.user?.isGM) {
        ui.notifications.error(`${MODULE_ID}: deferred impact override disabled. ${impacts.diagnostics.issues.join(" ")}`);
      }
    }
  }
  Hooks.callAll(MODULE_HOOKS.READY, api);
  logger.info(`Ready with HarnMaster 3 ${diagnostics.systemVersion}.`);
});
