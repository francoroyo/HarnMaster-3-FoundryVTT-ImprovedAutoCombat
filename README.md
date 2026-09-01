# HarnMaster 3: Improved Auto-Combat

A Foundry Virtual Tabletop v14 module that adds deferred, editable impact rolls to the automated combat workflow in [Valcorin's HarnMaster 3 system](https://github.com/valcorin/HarnMaster-3-FoundryVTT).

HM3 remains authoritative for attack and defense tests, combat-table lookup, weapon breakage, tactical advantage, fumbles, stumbles, and injury creation. On a successful automated strike, this module replaces the immediate impact roll with a **Roll Impact** action. The striker's owner or a GM can review the matrix dice, change the number of d6, add an impact modifier, and finalize the roll once.

## Requirements

- Foundry Virtual Tabletop `14.365` or newer within the v14 generation
- HarnMaster 3 system `1.6.13` or newer
- [libWrapper](https://github.com/ruipin/fvtt-lib-wrapper) `1.13.5.1` or newer (required)

## Installation

In Foundry's **Add-on Modules** setup screen, choose **Install Module** and paste this manifest URL:

```text
https://github.com/francoroyo/HarnMaster-3-FoundryVTT-ImprovedAutoCombat/releases/latest/download/module.json
```

Foundry will install the matching release ZIP and offer future updates through the same URL.

## Development setup

No third-party runtime or development dependencies are required. With Node.js 20 or newer:

```sh
npm test
npm run validate
npm run check
```

For local Foundry testing, place or link this repository at:

```text
<Foundry user data>/Data/modules/hm3-improved-autocombat
```

Restart Foundry, enable **HarnMaster 3: Improved Auto-Combat** in an HM3 world, and inspect the module's diagnostics from the browser console:

```js
game.modules.get("hm3-improved-autocombat").api.diagnostics
```

## Runtime API

```js
const api = game.modules.get("hm3-improved-autocombat").api;

api.onWorkflowEvent((event) => console.log(event));
await api.startMeleeAttack({ item: weaponItem, token });
console.table(api.events);

const state = api.impacts.getState(messageId);
if (api.impacts.canRoll(messageId)) await api.impacts.openDialog(messageId);
```

The native module socket lets an actor owner ask the primary active GM to update a result message the player cannot modify. The GM validates ownership and grants a 30-second one-shot lease before any dice are rolled. If no update authority is available, the result remains pending.

At startup, the module checks HM3's public macro surface, combat-table shapes, and result-card markers. If these checks fail, only the deferred-impact override is disabled and normal HM3 autocombat continues.

See [Architecture](docs/ARCHITECTURE.md) for integration details.

## Legal notice

This is an unofficial fan project. Harn, HarnMaster, and HarnWorld are trademarks or copyrighted works of their respective owners. This repository contains no HarnMaster rulebook text, artwork, or game tables and requires users to own the relevant rules and install the separate HM3 Foundry system.
