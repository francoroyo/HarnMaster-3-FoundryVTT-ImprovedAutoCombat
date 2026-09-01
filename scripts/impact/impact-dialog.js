import { IMPACT_LIMITS } from "../constants.js";
import { impactFormula, validateImpactInput } from "./impact-state.js";

function contentElement(state) {
  const element = document.createElement("div");
  element.className = "hm3iac-impact-dialog";
  element.innerHTML = `
    <div class="hm3iac-impact-grid">
      <span>Matrix result</span><strong>${state.matrixResult}</strong>
      <span>Recommended dice</span><strong>${state.matrixDice}d6</strong>
      <span>Weapon/range impact</span><strong>${state.baseImpact}</strong>
    </div>
    <div class="form-group">
      <label for="hm3iac-dice">Number of d6</label>
      <input id="hm3iac-dice" name="dice" type="number" min="${IMPACT_LIMITS.MIN_DICE}" max="${IMPACT_LIMITS.MAX_DICE}" step="1" value="${state.matrixDice}" required autofocus>
    </div>
    <div class="form-group">
      <label for="hm3iac-bonus">Additional impact</label>
      <input id="hm3iac-bonus" name="additionalImpact" type="number" min="${IMPACT_LIMITS.MIN_BONUS}" max="${IMPACT_LIMITS.MAX_BONUS}" step="1" value="0" required>
    </div>
    <p class="hint">The base impact is read-only. This roll can be finalized only once.</p>
    <div class="hm3iac-preview"><span>Final structure</span><strong data-impact-preview></strong></div>`;
  return element;
}

export async function promptForImpact(state) {
  const DialogV2 = globalThis.foundry?.applications?.api?.DialogV2;
  if (!DialogV2?.input) throw new Error("Foundry DialogV2.input is unavailable.");
  const content = contentElement(state);
  const updatePreview = (form) => {
    const dice = Number(form?.elements?.dice?.value ?? state.matrixDice);
    const bonus = Number(form?.elements?.additionalImpact?.value ?? 0);
    const output = form?.querySelector?.("[data-impact-preview]");
    if (output) output.textContent = `${state.baseImpact} + (${impactFormula(dice, bonus)})`;
  };
  const result = await DialogV2.input({
    window: { title: "Roll Impact" },
    content,
    modal: true,
    rejectClose: false,
    ok: { label: "Roll Impact", icon: "fas fa-dice-d6" },
    render: (_event, dialog) => {
      const form = dialog.form;
      updatePreview(form);
      form?.addEventListener("input", () => updatePreview(form));
    }
  });
  if (!result) return null;
  const validated = validateImpactInput(result);
  if (!validated.ok) {
    globalThis.ui?.notifications?.warn?.(validated.errors.join(" "));
    return null;
  }
  return { dice: validated.dice, additionalImpact: validated.additionalImpact };
}

