import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(await readFile(resolve(root, "module.json"), "utf8"));
const packageJson = JSON.parse(await readFile(resolve(root, "package.json"), "utf8"));

assert.equal(manifest.id, "hm3-improved-autocombat");
assert.equal(manifest.type, "module");
assert.equal(manifest.version, packageJson.version, "Manifest and package versions must match.");
assert.match(String(manifest.compatibility.minimum), /^14(?:\.|$)/, "Foundry v14 must be the minimum.");
assert.equal(String(manifest.compatibility.maximum), "14", "Foundry v14 must be the maximum.");

const hm3 = manifest.relationships?.systems?.find((system) => system.id === "hm3");
assert.ok(hm3, "The manifest must require the hm3 system.");
assert.ok(hm3.compatibility?.minimum, "The hm3 relationship must declare a minimum version.");

const libWrapper = manifest.relationships?.requires?.find((module) => module.id === "lib-wrapper");
assert.ok(libWrapper, "The manifest must require lib-wrapper.");
assert.equal(libWrapper.compatibility?.minimum, "1.13.5.1");
assert.equal(manifest.socket, true, "The module socket channel must be enabled.");
assert.match(manifest.url, /^https:\/\/github\.com\/francoroyo\//);
assert.equal(
  manifest.manifest,
  `${manifest.url}/releases/latest/download/module.json`,
  "The update manifest URL must target the latest GitHub release asset."
);
assert.equal(
  manifest.download,
  `${manifest.url}/releases/download/v${manifest.version}/${manifest.id}-v${manifest.version}.zip`,
  "The download URL must target the versioned GitHub release ZIP."
);

for (const path of [
  ...(manifest.esmodules ?? []),
  ...(manifest.styles ?? []),
  ...(manifest.languages ?? []).map((language) => language.path),
  manifest.license,
  manifest.readme
].filter(Boolean)) {
  await access(resolve(root, path));
}

console.log(`Validated ${manifest.title} ${manifest.version}.`);
