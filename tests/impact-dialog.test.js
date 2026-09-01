import test from "node:test";
import assert from "node:assert/strict";
import { promptForImpact } from "../scripts/impact/impact-dialog.js";

test("shows a live formula preview and returns validated input", async () => {
  const saved = { document: globalThis.document, foundry: globalThis.foundry, ui: globalThis.ui };
  const output = { textContent: "" };
  let inputListener;
  const form = {
    elements: { dice: { value: "2" }, additionalImpact: { value: "0" } },
    querySelector: () => output,
    addEventListener(_name, callback) { inputListener = callback; }
  };
  globalThis.document = { createElement: () => ({ className: "", innerHTML: "" }) };
  globalThis.foundry = {
    applications: {
      api: {
        DialogV2: {
          input: async (options) => {
            options.render(null, { form });
            assert.equal(output.textContent, "4 + (2d6)");
            form.elements.dice.value = "3";
            form.elements.additionalImpact.value = "-2";
            inputListener();
            assert.equal(output.textContent, "4 + (3d6 - 2)");
            return { dice: 3, additionalImpact: -2 };
          }
        }
      }
    }
  };
  globalThis.ui = { notifications: { warn() {} } };
  try {
    assert.deepEqual(await promptForImpact({ matrixResult: "A*2", matrixDice: 2, baseImpact: 4 }), {
      dice: 3,
      additionalImpact: -2
    });
  } finally {
    Object.assign(globalThis, saved);
  }
});

test("canceling or submitting out-of-bounds data produces no roll input", async () => {
  const saved = { document: globalThis.document, foundry: globalThis.foundry, ui: globalThis.ui };
  let result = null;
  let warnings = 0;
  globalThis.document = { createElement: () => ({ className: "", innerHTML: "" }) };
  globalThis.foundry = { applications: { api: { DialogV2: { input: async () => result } } } };
  globalThis.ui = { notifications: { warn() { warnings += 1; } } };
  const state = { matrixResult: "A*2", matrixDice: 2, baseImpact: 4 };
  try {
    assert.equal(await promptForImpact(state), null);
    result = { dice: 21, additionalImpact: 0 };
    assert.equal(await promptForImpact(state), null);
    assert.equal(warnings, 1);
  } finally {
    Object.assign(globalThis, saved);
  }
});

