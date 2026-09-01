import { API_VERSION } from "./constants.js";
import {
  aimModifier,
  calculateEffectiveMasteryLevel,
  normalizeAimZone,
  outnumberingModifier,
  physicalPenaltyModifier,
  proneOpponentModifier
} from "./combat/modifiers.js";

export function createApi({ tracker, getAdapter, getImpacts = () => null }) {
  return Object.freeze({
    version: API_VERSION,

    get diagnostics() {
      const adapter = getAdapter()?.diagnostics() ?? { ok: false, issues: ["Adapter is not ready."] };
      const impactOverride = getImpacts()?.diagnostics ?? { ok: false, installed: false, issues: ["Impact override is not ready."] };
      return Object.freeze({ ...adapter, impactOverride });
    },

    get events() {
      return tracker.snapshot();
    },

    clearEvents() {
      tracker.clear();
    },

    onWorkflowEvent(listener) {
      return tracker.subscribe(listener);
    },

    startMeleeAttack(options) {
      return getAdapter().startMeleeAttack(options);
    },

    startMissileAttack(options) {
      return getAdapter().startMissileAttack(options);
    },

    rules: Object.freeze({
      aimModifier,
      calculateEffectiveMasteryLevel,
      normalizeAimZone,
      outnumberingModifier,
      physicalPenaltyModifier,
      proneOpponentModifier
    }),

    impacts: Object.freeze({
      getState(messageId) {
        return getImpacts()?.getState(messageId) ?? null;
      },
      openDialog(messageId) {
        return getImpacts()?.openDialog(messageId) ?? Promise.resolve(null);
      },
      canRoll(messageId, user) {
        return getImpacts()?.canRoll(messageId, user) ?? false;
      }
    })
  });
}
