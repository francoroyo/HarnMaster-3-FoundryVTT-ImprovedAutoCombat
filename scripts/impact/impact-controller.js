import {
  MODULE_HOOKS,
  MODULE_ID,
  SOCKET_NAME
} from "../constants.js";
import {
  extractInjuryButton,
  insertImpactPanel,
  makePendingCard,
  replaceImpactPanel,
  stripHm3Impact
} from "./impact-card.js";
import { promptForImpact } from "./impact-dialog.js";
import {
  IMPACT_STATUSES,
  claimState,
  cloneState,
  combatOutcome,
  expectedCards,
  getImpactState,
  impactFlagPath,
  impactFormula,
  isLeaseExpired,
  makePendingState,
  pendingState,
  randomId,
  validateImpactInput,
  validateRoll
} from "./impact-state.js";

const DEFENSE_ACTIONS = new Set(["dodge", "block", "ignore", "counterstrike"]);
const REQUIRED_MACROS = Object.freeze([
  "dodgeResume",
  "blockResume",
  "ignoreResume",
  "meleeCounterstrikeResume"
]);
const WRAPPED_TARGETS = Object.freeze([
  "game.hm3.DiceHM3.rollTest",
  "Roll.prototype.evaluate"
]);
const TEMPLATE_PATH = "systems/hm3/templates/chat/attack-result-card.html";
const SOCKET_PROTOCOL = 1;

function collectionGet(collection, id) {
  return collection?.get?.(id) ?? collectionValues(collection).find((entry) => (entry.id ?? entry._id) === id) ?? null;
}

function collectionValues(collection) {
  if (!collection) return [];
  if (Array.isArray(collection)) return collection;
  if (Array.isArray(collection.contents)) return collection.contents;
  if (typeof collection.values === "function") return Array.from(collection.values());
  return Array.from(collection);
}

function firstActiveGm(game) {
  return collectionValues(game?.users)
    .filter((user) => user?.active && user?.isGM)
    .sort((a, b) => String(a.id).localeCompare(String(b.id)))[0] ?? null;
}

function canModifyMessage(message, user) {
  if (!message || !user) return false;
  if (user.isGM) return true;
  if (typeof message.canUserModify === "function") return message.canUserModify(user, "update");
  return message.author?.id === user.id || message.user?.id === user.id || message.author === user.id;
}

function tokenObject(tokenId) {
  return globalThis.canvas?.scene?.tokens?.get?.(tokenId)?.object
    ?? globalThis.canvas?.tokens?.get?.(tokenId)
    ?? null;
}

function participant(tokenId) {
  const token = tokenObject(tokenId);
  const actor = token?.actor ?? null;
  return {
    tokenId,
    tokenUuid: token?.document?.uuid ?? token?.uuid ?? null,
    actorId: actor?.id ?? null,
    actorUuid: actor?.uuid ?? null
  };
}

function actorForState(state) {
  const actorId = state?.striker?.actorId;
  return collectionGet(globalThis.game?.actors, actorId)
    ?? tokenObject(state?.striker?.tokenId)?.actor
    ?? globalThis.fromUuidSync?.(state?.striker?.actorUuid)
    ?? null;
}

function ownsStriker(state, user) {
  if (!user || !state) return false;
  if (user.isGM) return true;
  const actor = actorForState(state);
  if (!actor) return false;
  if (typeof actor.testUserPermission === "function") {
    const owner = globalThis.CONST?.DOCUMENT_OWNERSHIP_LEVELS?.OWNER ?? 3;
    return actor.testUserPermission(user, owner);
  }
  if (user.id === globalThis.game?.user?.id && typeof actor.isOwner === "boolean") return actor.isOwner;
  return Number(actor.ownership?.[user.id] ?? actor.permission?.[user.id] ?? 0) >= 3;
}

function normalizeRoot(html) {
  return html?.element ?? html?.[0] ?? html ?? null;
}

function messageIdFromButton(button) {
  return button?.closest?.("[data-message-id]")?.dataset?.messageId
    ?? button?.closest?.(".message")?.dataset?.messageId
    ?? null;
}

function serializeRoll(roll) {
  return roll?.toJSON?.() ?? roll;
}

function deserializeRoll(data) {
  if (!data) return null;
  if (data?.dice && typeof data?.total !== "undefined" && typeof data?.toJSON === "function") return data;
  const RollClass = globalThis.Roll;
  if (typeof RollClass?.fromData === "function") return RollClass.fromData(data);
  if (typeof RollClass?.fromJSON === "function") return RollClass.fromJSON(typeof data === "string" ? data : JSON.stringify(data));
  return data;
}

function updateSource(document, changes) {
  if (typeof document?.updateSource === "function") return document.updateSource(changes);
  for (const [key, value] of Object.entries(changes)) {
    if (key.includes(".")) {
      const parts = key.split(".");
      let target = document;
      for (const part of parts.slice(0, -1)) target = target[part] ??= {};
      target[parts.at(-1)] = value;
    } else document[key] = value;
  }
}

function directDiceFormula(roll) {
  const formula = String(roll?.formula ?? roll?._formula ?? "").replace(/\s+/g, "").toLowerCase();
  const match = /^(\d+)d6$/.exec(formula);
  return match ? Number(match[1]) : null;
}

export class ImpactController {
  #activeContext = null;
  #documentListener = null;
  #hooks = [];
  #pendingRequests = new Map();
  #socketListener = null;
  #authorityLocks = new Set();
  #repairing = new Set();
  #diagnostics = { ok: false, installed: false, issues: ["Impact override is not initialized."] };

  constructor({ game = globalThis.game, hooks = globalThis.Hooks, logger, fetchTemplate = globalThis.fetch } = {}) {
    this.game = game;
    this.hooks = hooks;
    this.logger = logger;
    this.fetchTemplate = fetchTemplate;
  }

  get diagnostics() {
    return Object.freeze({ ...this.#diagnostics, issues: Object.freeze([...this.#diagnostics.issues]) });
  }

  async install() {
    if (this.#diagnostics.installed) return true;
    const issues = await this.#compatibilityIssues();
    if (issues.length) {
      this.#diagnostics = { ok: false, installed: false, issues };
      return false;
    }

    try {
      const controller = this;
      globalThis.libWrapper.register(MODULE_ID, WRAPPED_TARGETS[0], function wrappedRollTest(wrapped, ...args) {
        return controller.#observeRollTest(wrapped, args);
      }, "WRAPPER");
      globalThis.libWrapper.register(MODULE_ID, WRAPPED_TARGETS[1], function wrappedEvaluate(wrapped, ...args) {
        return controller.#interceptRollEvaluate(this, wrapped, args);
      }, "WRAPPER");

      this.#hooks.push(["preCreateChatMessage", this.hooks.on("preCreateChatMessage", (...args) => this.#preCreateMessage(...args))]);
      this.#hooks.push(["createChatMessage", this.hooks.on("createChatMessage", (message) => this.#createdMessage(message))]);
      this.#hooks.push(["renderChatMessageHTML", this.hooks.on("renderChatMessageHTML", (...args) => this.#renderMessage(...args))]);
      this.#documentListener = (event) => this.#captureClick(event);
      globalThis.document.addEventListener("click", this.#documentListener, true);
      this.#socketListener = (payload) => this.#onSocket(payload);
      this.game.socket.on(SOCKET_NAME, this.#socketListener);
      this.#diagnostics = { ok: true, installed: true, issues: [] };
      await this.#repairExpiredMessages();
      return true;
    } catch (error) {
      this.logger?.error?.("Unable to install deferred impact override.", error);
      this.#removePartialInstall();
      this.#diagnostics = { ok: false, installed: false, issues: [error.message] };
      return false;
    }
  }

  uninstall() {
    this.#removePartialInstall();
    this.#diagnostics = { ok: true, installed: false, issues: [] };
  }

  getState(messageId) {
    return cloneState(getImpactState(collectionGet(this.game.messages, messageId)));
  }

  canRoll(messageId, user = this.game.user) {
    const message = collectionGet(this.game.messages, messageId);
    const state = getImpactState(message);
    if (!message || !state || state.status !== IMPACT_STATUSES.PENDING || state.error) return false;
    if (!ownsStriker(state, user)) return false;
    return canModifyMessage(message, user) || Boolean(firstActiveGm(this.game));
  }

  async openDialog(messageId) {
    const message = collectionGet(this.game.messages, messageId);
    const state = getImpactState(message);
    if (!message || !state) return null;
    if (!this.canRoll(messageId)) {
      const authority = firstActiveGm(this.game);
      const reason = !ownsStriker(state, this.game.user)
        ? "Only the striking actor's owner or a GM can roll this impact."
        : !authority && !canModifyMessage(message, this.game.user)
          ? "No active GM can update this message. The impact remains pending."
          : "This impact is no longer available to roll.";
      globalThis.ui?.notifications?.warn?.(reason);
      return null;
    }

    const input = await promptForImpact(state);
    if (!input) return null;
    const current = getImpactState(collectionGet(this.game.messages, messageId));
    if (current?.nonce !== state.nonce || current?.status !== IMPACT_STATUSES.PENDING) {
      globalThis.ui?.notifications?.warn?.("This impact changed while the dialog was open.");
      return null;
    }
    return this.#claimRollAndFinalize(messageId, state.nonce, input);
  }

  async #compatibilityIssues() {
    const issues = [];
    const macros = this.game?.hm3?.macros;
    for (const name of REQUIRED_MACROS) {
      if (typeof macros?.[name] !== "function") issues.push(`game.hm3.macros.${name} is unavailable.`);
    }
    if (typeof this.game?.hm3?.DiceHM3?.rollTest !== "function") issues.push("game.hm3.DiceHM3.rollTest is unavailable.");
    if (typeof globalThis.Roll?.prototype?.evaluate !== "function") issues.push("Roll.prototype.evaluate is unavailable.");
    if (typeof globalThis.libWrapper?.register !== "function") issues.push("libWrapper is unavailable.");
    if (!globalThis.document?.addEventListener) issues.push("The browser event surface is unavailable.");
    if (typeof this.game?.socket?.on !== "function" || typeof this.game?.socket?.emit !== "function") {
      issues.push("The native module socket is unavailable.");
    }

    const config = globalThis.CONFIG?.HM3;
    for (const defense of ["dodge", "block", "ignore", "counterstrike"]) {
      if (!config?.meleeCombatTable?.[defense] || typeof config.meleeCombatTable[defense] !== "object") {
        issues.push(`CONFIG.HM3.meleeCombatTable.${defense} is unavailable.`);
      }
    }
    for (const defense of ["dodge", "block", "ignore"]) {
      if (!config?.missileCombatTable?.[defense] || typeof config.missileCombatTable[defense] !== "object") {
        issues.push(`CONFIG.HM3.missileCombatTable.${defense} is unavailable.`);
      }
    }

    try {
      const response = await this.fetchTemplate(TEMPLATE_PATH);
      const source = await response.text();
      for (const marker of ['data-action="injury"', "Attack Impact", 'data-impact="{{totalImpact}}"']) {
        if (!source.includes(marker)) issues.push(`HM3 result template marker '${marker}' is unavailable.`);
      }
    } catch (error) {
      issues.push(`HM3 result template could not be verified: ${error.message}`);
    }
    return issues;
  }

  #removePartialInstall() {
    for (const target of WRAPPED_TARGETS) {
      try { globalThis.libWrapper?.unregister?.(MODULE_ID, target); } catch { /* best effort */ }
    }
    for (const [name, id] of this.#hooks) this.hooks?.off?.(name, id);
    this.#hooks.length = 0;
    if (this.#documentListener) globalThis.document?.removeEventListener?.("click", this.#documentListener, true);
    this.#documentListener = null;
    if (this.#socketListener) this.game?.socket?.off?.(SOCKET_NAME, this.#socketListener);
    this.#socketListener = null;
    this.#activeContext = null;
  }

  async #captureClick(event) {
    const button = event.target?.closest?.("button[data-action]");
    const action = button?.dataset?.action;
    if (!button?.closest?.(".hm3.chat-card")) return;

    if (action === "hm3iac-roll-impact") {
      event.preventDefault();
      event.stopImmediatePropagation();
      const messageId = messageIdFromButton(button);
      if (!messageId) return;
      button.disabled = true;
      try { await this.openDialog(messageId); }
      catch (error) {
        this.logger?.error?.("Impact dialog failed.", error);
        globalThis.ui?.notifications?.error?.(`Impact roll failed: ${error.message}`);
      } finally {
        if (button.isConnected) button.disabled = false;
      }
      return;
    }

    if (!DEFENSE_ACTIONS.has(action)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (this.#activeContext) {
      globalThis.ui?.notifications?.warn?.("Another automated combat resolution is already in progress on this client.");
      return;
    }

    button.disabled = true;
    const data = button.dataset;
    const context = {
      id: randomId(),
      defense: action,
      attackType: action === "counterstrike" ? "melee" : data.weaponType,
      attackTokenId: data.atkTokenId,
      defendTokenId: data.defTokenId,
      weapon: data.weapon,
      aim: data.aim,
      aspect: data.aspect,
      baseImpact: Number(data.impactMod),
      tests: [],
      expectedTestCount: action === "ignore" ? 1 : 2,
      cards: [],
      rollQueue: []
    };
    this.#activeContext = context;
    try {
      await this.#invokeResumeMacro(action, data);
    } catch (error) {
      this.logger?.error?.("HM3 combat resolution failed.", error);
      globalThis.ui?.notifications?.error?.(`HM3 combat resolution failed: ${error.message}`);
    } finally {
      this.#activeContext = null;
      if (button.isConnected) button.disabled = false;
    }
  }

  #invokeResumeMacro(action, data) {
    const common = [data.atkTokenId, data.defTokenId, data.weaponType, data.weapon,
      data.effAml, data.aim, data.aspect, data.impactMod, data.currUser];
    if (action === "counterstrike") {
      return this.game.hm3.macros.meleeCounterstrikeResume(data.atkTokenId, data.defTokenId,
        data.weapon, data.effAml, data.aim, data.aspect, data.impactMod, data.currUser);
    }
    return this.game.hm3.macros[`${action}Resume`](...common);
  }

  async #observeRollTest(wrapped, args) {
    const result = await wrapped(...args);
    const context = this.#activeContext;
    const testData = args[0];
    if (!context || Number(testData?.diceSides) !== 100 || Number(testData?.diceNum) !== 1
      || context.tests.length >= context.expectedTestCount) return result;
    context.tests.push(result);
    if (context.tests.length === context.expectedTestCount) {
      const outcome = combatOutcome(globalThis.CONFIG?.HM3, context);
      if (!outcome) throw new Error("The HM3 combat-table outcome could not be resolved.");
      context.cards = expectedCards(context, outcome).map((card) => this.#decorateCard(context, card));
      context.rollQueue = context.cards.filter((card) => card.matrixDice > 0);
    }
    return result;
  }

  #decorateCard(context, card) {
    const attack = participant(context.attackTokenId);
    const defend = participant(context.defendTokenId);
    const counter = card.side === "counterstrike";
    return {
      ...card,
      attackType: context.attackType,
      defense: context.defense,
      striker: counter ? defend : attack,
      target: counter ? attack : defend,
      weapon: context.weapon,
      aim: context.aim,
      aspect: context.aspect,
      placeholderTotal: null
    };
  }

  async #interceptRollEvaluate(roll, wrapped, args) {
    const context = this.#activeContext;
    const expected = context?.rollQueue?.[0];
    const dice = directDiceFormula(roll);
    if (!expected || dice !== expected.matrixDice) return wrapped(...args);
    context.rollQueue.shift();
    const options = { ...(args[0] ?? {}), minimize: true, maximize: false };
    const placeholder = await wrapped(options);
    expected.placeholderTotal = Number(placeholder.total);
    expected.placeholderRoll = placeholder;
    return placeholder;
  }

  #preCreateMessage(document, data) {
    const context = this.#activeContext;
    if (!context || !context.cards.length) return;
    const content = String(data?.content ?? document?.content ?? "");
    if (!content.includes("hm3 chat-card") || !content.includes("Attack Result") && !content.includes("Counterstrike Result")) return;
    const descriptor = context.cards.shift();
    if (!descriptor || descriptor.matrixDice <= 0) return;

    const sourceRolls = Array.from(data?.rolls ?? document?.rolls ?? []);
    const hasPlaceholder = descriptor.placeholderRoll
      && (sourceRolls.includes(descriptor.placeholderRoll) || Number(descriptor.placeholderTotal) === descriptor.matrixDice);
    try {
      if (!hasPlaceholder) throw new Error("The intercepted impact placeholder was not attached to the result message.");
      descriptor.stateFactory = ({ baseImpact, injury }) => makePendingState({
        striker: descriptor.striker,
        target: descriptor.target,
        weapon: injury.attackWeapon || descriptor.weapon,
        aspect: injury.aspect || descriptor.aspect,
        aim: injury.aim || descriptor.aim,
        attackType: descriptor.attackType,
        defense: descriptor.defense,
        matrixResult: descriptor.matrixResult,
        matrixDice: descriptor.matrixDice,
        baseImpact,
        injury
      });
      const pending = makePendingCard(content, descriptor);
      updateSource(document, {
        content: pending.content,
        rolls: [],
        sound: null,
        style: globalThis.CONST?.CHAT_MESSAGE_STYLES?.OTHER,
        [impactFlagPath()]: pending.state
      });
    } catch (error) {
      const injury = extractInjuryButton(content);
      const safe = stripHm3Impact(content);
      const errorState = makePendingState({
        striker: descriptor.striker,
        target: descriptor.target,
        weapon: descriptor.weapon,
        aspect: descriptor.aspect,
        aim: descriptor.aim,
        attackType: descriptor.attackType,
        defense: descriptor.defense,
        matrixResult: descriptor.matrixResult,
        matrixDice: descriptor.matrixDice,
        baseImpact: 0,
        injury: { label: injury?.label ?? "Calculate Injury" },
        error: error.message
      });
      updateSource(document, {
        content: insertImpactPanel(safe, errorState),
        rolls: [],
        sound: null,
        style: globalThis.CONST?.CHAT_MESSAGE_STYLES?.OTHER,
        [impactFlagPath()]: errorState
      });
      this.logger?.error?.("Blocked an invalid deferred-impact message.", error);
      if (this.game.user?.isGM) globalThis.ui?.notifications?.error?.(`Deferred impact failed safely: ${error.message}`);
    }
  }

  #createdMessage(message) {
    const state = getImpactState(message);
    if (state?.status === IMPACT_STATUSES.PENDING) this.hooks.callAll(MODULE_HOOKS.IMPACT_PENDING, message, cloneState(state));
  }

  #renderMessage(message, html) {
    const state = getImpactState(message);
    if (!state) return;
    const root = normalizeRoot(html);
    const button = root?.querySelector?.('button[data-action="hm3iac-roll-impact"]');
    if (button) {
      const permitted = ownsStriker(state, this.game.user);
      const allowed = this.canRoll(message.id);
      button.style.display = permitted ? "" : "none";
      button.disabled = !allowed || state.status !== IMPACT_STATUSES.PENDING;
      if (permitted && !allowed && state.status === IMPACT_STATUSES.PENDING) {
        button.title = "No active GM or message update authority is available; impact remains pending.";
        if (!button.parentElement?.querySelector?.(".hm3iac-authority-warning")) {
          const warning = globalThis.document.createElement("p");
          warning.className = "hm3iac-authority-warning hint";
          warning.textContent = "No active GM can update this message. Impact remains pending.";
          button.parentElement?.append?.(warning);
        }
      }
    }
    if (isLeaseExpired(state) && this.#isPrimaryGm()) void this.#repairMessage(message);
  }

  async #claimRollAndFinalize(messageId, nonce, input) {
    const validated = validateImpactInput(input);
    if (!validated.ok) throw new Error(validated.errors.join(" "));
    const message = collectionGet(this.game.messages, messageId);
    let grant;
    if (canModifyMessage(message, this.game.user)) {
      if (this.#authorityLocks.has(messageId)) return null;
      this.#authorityLocks.add(messageId);
      try {
        grant = await this.#claimDirect(message, nonce, validated, this.game.user);
      } finally {
        this.#authorityLocks.delete(messageId);
      }
    } else {
      if (!firstActiveGm(this.game)) {
        globalThis.ui?.notifications?.warn?.("No active GM can update this message. The impact remains pending.");
        return null;
      }
      grant = await this.#requestAuthority("claim", { messageId, nonce, input: validated });
    }
    if (!grant?.ok) {
      globalThis.ui?.notifications?.warn?.(grant?.error ?? "The impact roll could not be claimed.");
      return null;
    }

    const formula = impactFormula(validated.dice, validated.additionalImpact);
    const roll = await new globalThis.Roll(formula).evaluate();
    const serialized = serializeRoll(roll);
    let finalized;
    if (canModifyMessage(collectionGet(this.game.messages, messageId), this.game.user)) {
      finalized = await this.#finalizeDirect(collectionGet(this.game.messages, messageId), nonce, grant.claimId,
        validated, roll, serialized, this.game.user);
    } else {
      finalized = await this.#requestAuthority("finalize", {
        messageId,
        nonce,
        claimId: grant.claimId,
        input: validated,
        roll: serialized
      });
    }
    if (!finalized?.ok) {
      globalThis.ui?.notifications?.error?.(finalized?.error ?? "The impact roll could not be finalized.");
      return null;
    }
    await this.#showRoll(roll);
    return finalized.state;
  }

  async #claimDirect(message, nonce, input, user) {
    const state = getImpactState(message);
    const error = this.#validateClaim(message, state, nonce, input, user);
    if (error) return { ok: false, error };
    const claimId = randomId();
    const claimed = claimState(state, { claimId, userId: user.id });
    await message.update({ content: replaceImpactPanel(message.content, claimed), [impactFlagPath()]: claimed });
    return { ok: true, claimId, expiresAt: claimed.claim.expiresAt };
  }

  #validateClaim(message, state, nonce, input, user) {
    if (!message || !state) return "The pending impact message no longer exists.";
    if (state.schema !== 1) return "The pending impact uses an unsupported schema.";
    if (state.nonce !== nonce) return "The pending impact nonce is stale.";
    if (isLeaseExpired(state)) state = pendingState(state);
    if (state.status !== IMPACT_STATUSES.PENDING || state.error) return "This impact has already been claimed or resolved.";
    if (!ownsStriker(state, user)) return "Only the striking actor's owner or a GM can roll this impact.";
    const validated = validateImpactInput(input);
    return validated.ok ? null : validated.errors.join(" ");
  }

  async #finalizeDirect(message, nonce, claimId, input, roll, serialized, user) {
    const state = getImpactState(message);
    if (!message || !state || state.status !== IMPACT_STATUSES.ROLLING) return { ok: false, error: "The impact is not claimed." };
    if (state.nonce !== nonce) return { ok: false, error: "The impact nonce is stale." };
    if (state.claim?.id !== claimId || state.claim?.userId !== user.id) return { ok: false, error: "The impact claim is stale." };
    if (isLeaseExpired(state)) {
      await this.#repairMessage(message);
      return { ok: false, error: "The impact roll lease expired." };
    }
    const validation = validateRoll(roll, input);
    if (!validation.ok) return { ok: false, error: validation.errors.join(" ") };
    const total = Number(state.baseImpact) + Number(roll.total);
    const resolved = {
      ...cloneState(state),
      status: IMPACT_STATUSES.RESOLVED,
      claim: null,
      final: {
        dice: validation.dice,
        additionalImpact: validation.additionalImpact,
        formula: impactFormula(validation.dice, validation.additionalImpact),
        values: validation.values,
        total
      }
    };
    await message.update({
      content: replaceImpactPanel(message.content, resolved),
      [impactFlagPath()]: resolved,
      rolls: [serialized],
      sound: null,
      style: globalThis.CONST?.CHAT_MESSAGE_STYLES?.ROLL
    });
    this.hooks.callAll(MODULE_HOOKS.IMPACT_RESOLVED, message, cloneState(resolved), roll);
    return { ok: true, state: cloneState(resolved) };
  }

  async #requestAuthority(action, data) {
    const requestId = randomId();
    const payload = { protocol: SOCKET_PROTOCOL, type: `${action}-request`, requestId, userId: this.game.user.id, ...data };
    const promise = new Promise((resolve) => {
      const timeout = globalThis.setTimeout(() => {
        this.#pendingRequests.delete(requestId);
        resolve({ ok: false, error: "The GM authority request timed out." });
      }, 10_000);
      this.#pendingRequests.set(requestId, (response) => {
        globalThis.clearTimeout(timeout);
        resolve(response);
      });
    });
    this.game.socket.emit(SOCKET_NAME, payload);
    return promise;
  }

  #onSocket(payload) {
    if (payload?.protocol !== SOCKET_PROTOCOL) return;
    if (payload.type?.endsWith("-response") && payload.userId === this.game.user.id) {
      const resolve = this.#pendingRequests.get(payload.requestId);
      if (resolve) {
        this.#pendingRequests.delete(payload.requestId);
        resolve(payload);
      }
      return;
    }
    if (!this.#isPrimaryGm() || !payload.type?.endsWith("-request")) return;
    void this.#handleAuthorityRequest(payload);
  }

  async #handleAuthorityRequest(payload) {
    const messageId = payload.messageId;
    if (this.#authorityLocks.has(messageId)) {
      this.#respond(payload, { ok: false, error: "Another impact operation is already in progress." });
      return;
    }
    this.#authorityLocks.add(messageId);
    try {
      const user = collectionGet(this.game.users, payload.userId);
      const message = collectionGet(this.game.messages, messageId);
      if (payload.type === "claim-request") {
        const result = await this.#claimDirect(message, payload.nonce, payload.input, user);
        this.#respond(payload, result);
      } else if (payload.type === "finalize-request") {
        const roll = deserializeRoll(payload.roll);
        const result = await this.#finalizeDirect(message, payload.nonce, payload.claimId, payload.input, roll, payload.roll, user);
        this.#respond(payload, result);
      }
    } catch (error) {
      this.#respond(payload, { ok: false, error: error.message });
    } finally {
      this.#authorityLocks.delete(messageId);
    }
  }

  #respond(request, result) {
    const kind = request.type.replace("-request", "-response");
    this.game.socket.emit(SOCKET_NAME, {
      protocol: SOCKET_PROTOCOL,
      type: kind,
      requestId: request.requestId,
      userId: request.userId,
      ...result
    });
  }

  #isPrimaryGm() {
    return Boolean(this.game.user?.isGM && firstActiveGm(this.game)?.id === this.game.user.id);
  }

  async #showRoll(roll) {
    if (this.game.dice3d?.showForRoll) {
      await this.game.dice3d.showForRoll(roll, this.game.user, true);
      return;
    }
    const src = globalThis.CONFIG?.sounds?.dice;
    if (src) await globalThis.foundry?.audio?.AudioHelper?.play?.({ src, autoplay: true, loop: false }, true);
  }

  async #repairExpiredMessages() {
    if (!this.#isPrimaryGm()) return;
    const messages = collectionValues(this.game.messages);
    await Promise.all(messages.filter((message) => isLeaseExpired(getImpactState(message))).map((message) => this.#repairMessage(message)));
  }

  async #repairMessage(message) {
    if (!message || this.#repairing.has(message.id)) return;
    const state = getImpactState(message);
    if (!isLeaseExpired(state)) return;
    this.#repairing.add(message.id);
    try {
      const restored = pendingState(state);
      await message.update({ content: replaceImpactPanel(message.content, restored), [impactFlagPath()]: restored });
    } finally {
      this.#repairing.delete(message.id);
    }
  }
}
