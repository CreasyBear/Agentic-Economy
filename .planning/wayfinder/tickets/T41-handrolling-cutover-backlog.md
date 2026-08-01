# T41 — Hand-rolling cutover backlog

Labels: `wayfinder:task` (AFK, mechanical). **Status: first pass CLOSED 2026-08-01** — 13 of 17 items
landed or refused with evidence. The 4 remaining items change durable or public contracts and are
re-scoped to [T42](T42-durable-and-public-contract-swaps.md). Map: [Framework](../MAP-framework.md).
Ran ahead of its T37 dependency: the tree was still dirty and red, so each slice was proved against
a pinned pre-existing-failure baseline instead of a green one.

## Question

Apply the ranked backlog from the whole-repo hand-rolling audit
([donor hunt, tranche 3](../../research/2026-08-01-framework-kernel-donor-hunt.md#tranche-3--whole-repo-hand-rolling-audit-2026-08-01)),
in order, one commit per item, so the adopt-first rule holds for the code that already exists rather
than only for code not yet written.

Seventeen items, ~700 lines removable. Four carry BEHAVIOUR-RISK and need a decision before the swap:

1. **Workpool/workflow for route lease + dispatch** — changes durable job identity, retry timing and
   lease expiry. Needs a state/wire migration plan, not a swap.
2. **Convex `.paginate()` for registry and money-ledger pagination** — registry cursors are public.
3. **`structuredClone` for `JSON.parse(JSON.stringify(…))`** — `structuredClone` preserves `undefined`
   keys that JSON cloning drops, and these values feed `canonicalDigest`.
4. **`cn`/`clsx` for manual class strings** — `tailwind-merge` changes class precedence.

The remaining thirteen are pure: duplicate-helper consolidation (`isRecord` ×17, `deepFreeze` ×10,
Base64 codecs ×5, `RuntimeDocument` accessors ×5, `serviceAssertion` ×3, `csrfArgs` ×2,
`stableUnique` ×4), `node:util.parseArgs`, `node:fs/promises.glob`, `console.table`, `withIndex`
instead of full-table scans, Zod for the hand-written transport validator, and `nanoid` for the
modulo-biased OAuth user-code RNG.

Two items stay blocked on a toolchain change: `Object.groupBy`/`Map.groupBy` need `lib: ES2024`
(the lib was raised ES2022 → ES2023 in this session, which unlocked `findLast`/`toSorted`).

One item is a founder decision, not a refactor: **two divergent `slugify` implementations**
(`catalog/internal/publish.ts:401`, `storefront/internal/import-draft.ts:487`). Slugs are persisted
and public, so unifying them changes live URLs.

## Method

Each item is one commit with the focused suite for the files it touches. Where a swap is not provably
pure, prove it the way `composeRequestActions` was proved: a differential fuzz comparing old and new
implementations over randomized inputs, run before the commit, result recorded on this ticket.

## Resolution — first pass executed 2026-08-01 by seven parallel subagents

Orchestrated as one batch with a shared contract: each agent owned a disjoint file list, was forbidden
from touching `package.json` or running any project-wide check, and had to label every change either
**(a) provably pure** or **(b) behaviour-affecting**. Kind (b) shipped only with a differential fuzz
or not at all. Every API claim required a citation — a `.d.ts` path, a doc URL, or a repo file:line.
Main ran the project-wide validation once at the end.

### Landed

| Slice | Change | Proof |
| --- | --- | --- |
| `IsRecordConsolidation` | 10 private `isRecord` guards → canonical `@/modules/common/is-record`; `isJsonObject` wrapper collapsed; `notification-outbox/dispatch-request` untrusted body → Zod `safeParse` | 20k-case differential on the dispatch parser, 0 mismatches. `decision-map`'s array-accepting guard traced to every producer (`decision-map-store.ts:98-105,180-199`, `session-ownership.ts:11-13`, `convex-source.ts:90-101`) proving no array is reachable |
| `DeepFreezeConsolidation` | 10 private `deepFreeze` copies → canonical helper; 2 now-redundant casts removed | 20k-case differential vs all four old variants, 0 mismatches; mutual-cycle A↔B check shows the 4 recurse-first copies **never terminated** on a cycle |
| `ZodAndNanoid` | HTTP/MCP/x402 transport validator → Zod v4 `strictObject` + `superRefine`; OAuth user code → `nanoid` `customAlphabet` | 20k randomized configs (valid / unknown-key / out-of-bounds / duplicate-query / malformed) + 15 hand-built edges: 20,015 agreements, 0 mismatches. Rule-by-rule map recorded |
| `ConvexNativeAdoption` | 3 full-table `indexStatus` scans → `withIndex('by_target_status', …)`; 5 duplicated `RuntimeDocument` accessor sets, 3 `isRecord`, `serviceAssertion` ×3, `csrfArgs` ×2 → shared exports | Index quoted from `src/modules/registry/internal/schema.ts:148`; `collect()+find` deliberately retained since the schema proves no uniqueness |
| `StructuredCloneSwap` | 6 `JSON.stringify` origin comparisons → `stableStringify`; `cloneJsonValue` → `structuredClone` | Per-site producer provenance: at all six, one side is JSON-reconstituted from a snapshot or port read, so key order was never guaranteed — the old comparison could refuse an **equal** origin. Latent bug fixed, not a semantics change |
| `ClassNameCn` | 43 manual class strings → `cn`/`cva` | 83-case + 14-case harnesses; SSR smoke through `renderToStaticMarkup`; 39 byte-identical, 1 justified collapse (compiled Tailwind v4.3.1 to prove `hidden` already beat `flex` in the cascade), 3 left alone |
| `ToolsNativeAdoption` | recursive `readdir` walk → `node:fs/promises` `glob` | 955 files compared across four roots, `onlyOld=0`/`onlyGlob=0`; second differential proved export-name resolution unaffected by ordering; Node floor v22.0.0 checked against CI's `node-version: '22'` |

### Correctly refused

- `tools/ae/lib/output.ts` → `console.table`: **BLOCKED**. `table` returns `void` and six CLI commands
  call it for its padded human output; `console.table` emits box borders and an `(index)` column.
  Before/after samples recorded. Refusing on evidence was the right answer.
- 4 of 10 `structuredClone` sites: the snapshot type admits `ActionContext`, which permits `Request`
  and callbacks; `structuredClone` **throws** `DataCloneError` on those where JSON cloning silently
  drops them. `index.ts:28` also left — its public signature admits explicitly-`undefined` optionals,
  and those values reach `canonicalDigest`. Follow-up: narrow the signature, then the swap is provable.
- 4 boundary `isRecord` guards left in place, each with the schema that should own the payload named.
  A half-migrated trust boundary is worse than an honest one.

### One gate deliberately updated

`tests/imports/capability-contract-boundaries.test.ts` pins capability-contract's exact import list.
Adding `@/modules/common/deep-freeze` broke it. The allowlist already sanctions
`@/modules/common/canonical-digest` and `stable-hash`, so the new import is the same class of
dependency; the allowlist was updated **consciously** rather than the import being backed out.

### Verification (Main, after merging all seven)

`tsc --noEmit` clean outside the deleted `examples/`; `npm run lint` clean; `npm run build` passes;
Convex codegen bundles; 2723 passing in unit + ui-contract + seo + types with the same 7 pre-existing
failures; `test:imports` failure set **byte-identical** to committed HEAD; integration 43/203,
identical to pre-session. No new failure anywhere.

### Still open

Workpool/workflow for route lease + dispatch, and Convex `.paginate()` for registry and money-ledger
cursors — both change durable or public contracts and still need a migration decision, not a swap.
The two divergent `slugify` implementations remain a founder call. `Object.groupBy` still needs ES2024.
