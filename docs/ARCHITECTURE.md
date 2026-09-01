# Architecture

## Goals

This module applies a narrow override to automated impact timing while leaving the `hm3` system authoritative for documents, attack and defense tests, combat matrices, weapon breakage, tactical results, and injury creation.

The initial architecture follows the HarnMaster combat sequence:

1. Attack declaration
2. Defense declaration
3. Skill tests and modifiers
4. Combat result lookup
5. Strike delivery and injury follow-up

## Runtime boundaries

```text
Foundry v14
  -> HarnMaster 3 system (documents, rolls, chat, combat tables)
       -> game.hm3.macros.*Resume
            -> capture-scoped libWrapper observation
                 -> deferred impact result card
                 -> owner/GM roll dialog
                 -> native module socket authority
                 -> HM3-compatible injury action
```

`scripts/integration/hm3-adapter.js` bridges HM3 lifecycle events. `scripts/impact/impact-controller.js` owns the targeted override, authority protocol, and lifecycle integration. Pure impact state and card transformations live beside it and are independently tested.

The module capture-stops HM3's Dodge, Block, Ignore, and Counterstrike button listener, then calls the same public resume macro. While that one resolution is active, libWrapper observes HM3's d100 results and consults `CONFIG.HM3` to identify the exact expected direct `Nd6` impact roll. The wrapper evaluates that roll minimized only as a temporary structural placeholder. `preCreateChatMessage` removes the placeholder roll, sound, impact output, and injury action before the message is persisted.

Unrelated rolls pass through untouched. In particular, standalone damage, shock and endurance checks, and block weapon-damage `3d6` rolls are outside the expected impact queue.

## Upstream compatibility baseline

The project was initialized against Valcorin's `master` commit `56c34df6e6a36e7459dbe763cbc90bf604246519` and system version `1.6.13`. The adapter currently relies on:

- `game.hm3.macros.weaponAttack`
- `game.hm3.macros.missileAttack`
- `hm3.onMeleeAttack` and `hm3.onMissileAttack`
- `hm3.onMeleeCounterstrikeResume`, `hm3.onDodgeResume`, `hm3.onBlockResume`, and `hm3.onIgnoreResume`
- injury, shock, stumble, and fumble post-roll hooks
- `game.hm3.DiceHM3.rollTest`
- `CONFIG.HM3.meleeCombatTable` and `CONFIG.HM3.missileCombatTable`
- the HM3 attack-result template's impact and injury markers
- libWrapper `1.13.5.1+`

Run `npm run check` whenever the compatibility baseline or manifest changes.

## Public API

After Foundry's `init` hook, the API is available at:

```js
game.modules.get("hm3-improved-autocombat").api
```

The API exposes diagnostics, a bounded session event history, event subscriptions, attack entry points, pure modifier helpers, and `impacts.getState`, `impacts.canRoll`, and `impacts.openDialog`. API-breaking changes require incrementing `API_VERSION` in `scripts/constants.js`.

Pending state is stored under `flags.hm3-improved-autocombat.impact`. A direct message owner can claim and finalize locally. Otherwise, the primary active GM validates actor ownership and grants a 30-second lease over the module socket. The first valid claim wins. Expired claims are restored to pending on startup and render. A resolved impact is immutable and stores its formula, selected dice count, modifier, individual d6 results, and final total.

## Design rules

- The deferred-impact feature is controlled by the module enable setting and tested.
- Do not persist Actor or Item changes from the impact override.
- Keep rule calculations pure and independently testable.
- Keep DOM interception capture-scoped to the four HM3 defense actions and the module's own impact action.
- Do not copy rulebook prose or tables into this repository.
