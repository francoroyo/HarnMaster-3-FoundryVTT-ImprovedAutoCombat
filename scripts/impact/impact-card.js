import { IMPACT_STATUSES, impactFormula } from "./impact-state.js";

export const PANEL_START = "<!-- hm3iac-impact-start -->";
export const PANEL_END = "<!-- hm3iac-impact-end -->";

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function extractInjuryButton(content) {
  const matches = String(content).matchAll(/<button\b[^>]*data-action=["']injury["'][^>]*>[\s\S]*?<\/button>/gi);
  const match = matches.next().value?.[0] ?? null;
  if (!match) return null;

  const attributes = {};
  for (const attr of match.matchAll(/data-([\w-]+)=["']([^"']*)["']/gi)) {
    attributes[attr[1].toLowerCase()] = attr[2];
  }
  const label = match.replace(/^<button\b[^>]*>/i, "").replace(/<\/button>$/i, "").trim();
  return { html: match, attributes, label };
}

export function stripHm3Impact(content) {
  let result = String(content);
  result = result.replace(/<div class=["']card-content center["']>\s*<span class=["']label["']>Addl Weapon Impact:<\/span>[\s\S]*?<\/div>/i, "");
  result = result.replace(/<div class=["']card-content["']>\s*<div class=["']flexcol flex-center["']>[\s\S]*?Attack Impact[\s\S]*?<\/div>\s*<\/div>/i, "");
  result = result.replace(/<button\b[^>]*data-action=["']injury["'][^>]*>[\s\S]*?<\/button>/gi, "");
  return result;
}

export function renderImpactPanel(state) {
  let body;
  if (state.error) {
    body = `<p class="hm3iac-error"><strong>Impact deferred with an error.</strong><br>${escapeHtml(state.error)}</p>`;
  } else if (state.status === IMPACT_STATUSES.RESOLVED) {
    const final = state.final;
    const signed = final.additionalImpact > 0 ? ` + ${final.additionalImpact}`
      : final.additionalImpact < 0 ? ` - ${Math.abs(final.additionalImpact)}` : "";
    body = `
      <div class="hm3iac-impact-grid">
        <span>Impact dice</span><strong>${escapeHtml(final.values.join(" + "))}</strong>
        <span>Total structure</span><strong>${number(state.baseImpact)} + (${escapeHtml(final.values.join(" + "))}${signed}) = ${number(final.total)}</strong>
      </div>
      <div class="card-buttons">
        <button data-action="injury" data-visible-actor-id="${escapeHtml(state.injury.visibleActorId)}"
          data-token-id="${escapeHtml(state.injury.tokenId)}" data-atk-token-id="${escapeHtml(state.injury.atkTokenId)}"
          data-attack-weapon="${escapeHtml(state.injury.attackWeapon)}" data-aim="${escapeHtml(state.injury.aim)}"
          data-aspect="${escapeHtml(state.injury.aspect)}" data-impact="${number(final.total)}">${escapeHtml(state.injury.label)}</button>
      </div>`;
  } else if (state.status === IMPACT_STATUSES.ROLLING) {
    body = `<p class="hm3iac-rolling"><i class="fas fa-spinner fa-spin"></i> Impact roll claimed; waiting for dice.</p>`;
  } else {
    body = `
      <div class="hm3iac-impact-grid">
        <span>Matrix result</span><strong>${escapeHtml(state.matrixResult)}</strong>
        <span>Recommended roll</span><strong>${number(state.matrixDice)}d6</strong>
        <span>Base impact</span><strong>${number(state.baseImpact)}</strong>
      </div>
      <div class="card-buttons">
        <button data-action="hm3iac-roll-impact" data-visible-actor-id="${escapeHtml(state.striker.actorId)}"
          data-impact-nonce="${escapeHtml(state.nonce)}"><i class="fas fa-dice-d6"></i> Roll Impact</button>
      </div>`;
  }
  return `${PANEL_START}<section class="hm3iac-impact-panel" data-impact-status="${escapeHtml(state.status)}">${body}</section>${PANEL_END}`;
}

export function insertImpactPanel(content, state) {
  const panel = renderImpactPanel(state);
  const closingCard = String(content).lastIndexOf("</div>");
  if (closingCard < 0) return `${content}${panel}`;
  return `${content.slice(0, closingCard)}${panel}${content.slice(closingCard)}`;
}

export function replaceImpactPanel(content, state) {
  const expression = new RegExp(`${PANEL_START}[\\s\\S]*?${PANEL_END}`);
  if (!expression.test(String(content))) throw new Error("Pending impact panel marker was not found.");
  return String(content).replace(expression, renderImpactPanel(state));
}

export function makePendingCard(content, descriptor) {
  const injuryButton = extractInjuryButton(content);
  if (!injuryButton) throw new Error("HM3 injury button marker was not found.");
  const impact = Number(injuryButton.attributes.impact);
  if (!Number.isFinite(impact)) throw new Error("HM3 impact total is invalid.");
  const baseImpact = impact - Number(descriptor.placeholderTotal);
  const attrs = injuryButton.attributes;
  const injury = {
    visibleActorId: attrs["visible-actor-id"] ?? descriptor.target.actorId,
    tokenId: attrs["token-id"] ?? descriptor.target.tokenId,
    atkTokenId: attrs["atk-token-id"] ?? descriptor.striker.tokenId,
    attackWeapon: attrs["attack-weapon"] ?? descriptor.weapon,
    aim: attrs.aim ?? descriptor.aim,
    aspect: attrs.aspect ?? descriptor.aspect,
    label: injuryButton.label
  };
  const state = descriptor.stateFactory({ baseImpact, injury });
  return {
    baseImpact,
    injury,
    state,
    content: insertImpactPanel(stripHm3Impact(content), state)
  };
}

export function previewText(baseImpact, dice, additionalImpact) {
  return `${number(baseImpact)} + (${impactFormula(dice, additionalImpact)})`;
}
