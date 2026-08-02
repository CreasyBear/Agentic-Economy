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

## Second pass — waves 2-5, executed 2026-08-01 by 31 parallel subagents

Same contract as the first pass, with three operating rules added after a scout burned 156 tool calls
and yielded nothing: a hard "stop investigating at 40 calls and write your result" checkpoint, an
explicit "partial delivered beats complete undelivered", and a named list of pre-existing failures so
agents stop chasing other people's red. Every agent yielded after that change.

### Landed

| Slice | Change | Proof |
| --- | --- | --- |
| SSE wire protocol | Private 12-variant `AnswerEvent` frame + `eventsource-parser` + 5 duplicated `parseStream` helpers → AI SDK `createUIMessageStream` / `readUIMessageStream` | Round-trip contract test through the real encoder/decoder; 24 call sites converted; zero hand-rolled stream parsers remain in `src`, `tests`, `tools` |
| `isRecord` / `stableUnique` | 6 + 4 private copies → canonical helpers | 20k-array differential; two `stableUnique` copies sorted with `localeCompare` and two preserved insertion order, so the canonical helper was made order-preserving with explicit sorts added at the two sorted call sites |
| Identifiers | 5 `Math.random().toString(36)` sites → one `@/modules/common/random-id` on `nanoid` `customAlphabet` | 100k samples/site, 0 format-regex mismatches, 0 collisions. Old suffix was length-unstable (`{0,6}`, trailing zeros dropped) and non-uniform; fixed width is a strict improvement |
| `registry.ts` pagination | Bespoke cursor/total/hasMore → Convex native `.paginate()` | Public slug-cursor semantics preserved; Convex's opaque `continueCursor` deliberately not exposed |
| Sandbox capability schema | Hand-built JSON Schema + parallel validator → one `z.strictObject` + `convertSchemaToJsonSchema` | 3,000 cases / 22 profiles: 0 mismatches on schema bytes, decisions, error ids, key order, freeze |
| `z.json()` | 4 recursive redacted-payload validators → 1 shared guard | 40,000 cases, 0 mismatches |
| Snapshot verifier | Shape layer → `z.strictObject` for exact-key nodes, `z.looseObject` for lenient ones | 10,000 cases, 0 decision **and** 0 reason mismatches. Safe only because the original input is retained and `safeParse` is used as a boolean, so stripped data never reaches `canonicalDigest` |
| Transport observation | Manual parser → Zod strict object | 10,000 cases, 12 intentional bug-fix rejections (see below) |
| Timeout composition | 4 hand-rolled `AbortController`+`setTimeout`+`Promise.race` blocks → one `@/modules/common/transport-timeout` runner | 6,000/site interpreter+semantic and 5,000/site harness: 0 mismatches, 0 late deadlines |
| Parity guards | 8 `JSON.stringify` equality comparisons → `stableStringify` | Per-shape differentials; 3 sites left inert with comments |
| `toSorted` / `findLast` / `Set` | 12 copy-then-sort sites, 1 reverse-index loop, 4 boolean-object membership maps | Mechanical; ES2023 |
| Timestamps | ~20 sites bypassing the pinned formatter → `formatTimestamp` plus 5 new named policy variants | Before/after string table per site |
| Typed links | 10 manual query-string builders → `<Link>` in route modules, `linkOptions` + serializer on leaf anchors | 10,008-case URL differential |
| Eval SSE parser | Last hand-rolled stream parser → `parseJsonEventStream` | 10,008 cases, 0 mismatches; all 9 latency metrics preserved |
| MCP data lines | Manual `data:` scanning → `parseJsonEventStream` | Content-type gate and first-matching-response-id behaviour preserved |

### Two security defects found and fixed

Both are the same class — a secret compared with plain `!==`, which short-circuits on the first
differing byte and leaks length plus matching prefix. Both now use the repo's existing
`constantTimeStringEqual`, **not** `node:crypto.timingSafeEqual`: route modules are reachable from the
generated client route tree, so a top-level `node:` import throws during hydration.

- `src/lib/server/sandbox-capability-provider.ts:450` — bearer key on the sandbox provider.
- `src/modules/notification-outbox/internal/dispatch-request.ts:12` — shared bearer secret behind two
  internet-reachable dispatch routes (`api.notification.resend-dispatch`, `api.notification.novu-dispatch`).

A read-only sweep of the surrounding classes found everything else already correct: guest-session
cookie HMAC via `crypto.subtle.verify`, Svix constant-time, every audited public Convex function gated,
exact-match `redirect_uri` with mandatory PKCE S256, and every user-influenced outbound fetch wired
through `network-guard` with a DNS pre-check and rebinding-safe lookup. It independently re-derived the
**P0 public OAuth persistence functions** already recorded in `CONCERNS.md:21,31`.

### Two coercion defects, opposite verdicts — deliberately

`String(value)` membership checks accept single-element arrays (`String(['http']) === 'http'`) and boxed
strings. Two agents hit this independently and resolved it differently, which is correct:

- **Rejected** in `route-transport-runtime.ts` — the mis-shaped value reaches `canonicalDigest` at
  `route-execution/journal/integrity.ts:91-93`, so a `transport: ['http']` row produces different durable
  evidence than the equivalent string. The near-miss that hid it: `` `transport:${['http']}` `` interpolates
  to `transport:http`, identical to the correct value, so it looks right exactly where a human would look.
- **Preserved** in `dynamic-published-snapshot-verifier.ts` — that verifier retains the original input and
  uses the parse only as a boolean, so no boxed value can reach a digest. Recorded as a latent defect.

Same bug, different blast radius, different answer.

### Correctly refused

| Refused | Evidence |
| --- | --- |
| `graphology` for `customer-request/legacy-v1.ts` cycle detection | 5,752 / 10,008 mismatches. `hasCycle` returns a boolean and cannot express the old DFS's *event precedence* — a cycle in an earlier-reachable component versus a later missing reference. The agent built the replacement twice, globally and inline, and both diverged; it refused rather than shipping |
| `structuredClone` (10 sites total) | 0 mismatches on real shapes but 528-549 / 1,000 once type-admitted values are injected. `ActionContext` permits `Request` and callbacks; `host-projection.ts:92,105` canonical-digests immediately after cloning, so preserving `undefined` would move a persisted digest |
| Reusing the capability HTTP schema in `customerRequestV2PreparationEgressActionPorts.ts` | 11 / 12,000, diverging in **both** directions: 2 the Convex path accepts and the shared schema rejects (double-slash reconciliation paths), 9 the reverse (GET-query, POST-cancellation). Two different contracts sharing a field list. Also needed a widened public seam for one caller. The double-slash acceptance is a latent regex defect worth fixing deliberately |
| Native-only `AbortSignal.timeout` at `customer-request/interpreter.ts` | Its own test injects a signal-ignoring transport (`interpreter.test.ts:48-54`). Native-only would have left 931 promises unsettled and 1,013 late deadline violations. The race is load-bearing; the shared runner keeps it |
| 5 of 7 Convex index-scan rewrites | `.order('desc')` reverses the entire index key including the trailing `_creationTime`, flipping tie selection: 2,564 / 3,153 / 3,843 mismatches on latest-attempt, latest-manifest, owner-newest, and 5,972 / 6,040 on the exact-key sites. Both adopted sites use `by_target_status` specifically because its column order *reproduces* the old ordering |
| ES2024 (`Object.groupBy`, `Map.groupBy`, `Promise.withResolvers`) | Vite 8 baseline is Chrome 111 / Safari 16.4 (`node_modules/vite/dist/node/index.d.ts:2067-2070`), no polyfill configured, Convex deployed-runtime support unproven. `lib` stays ES2023. Closes T42 item 4 |
| `@convex-dev/agent` | Peer-requires `ai@^6.0.35`; repo is on `ai@7.0.44`. Cannot install. The headline "19k lines of hand-rolled orchestration" is mostly domain logic around an already-adopted SDK — `answer-tool-use-agent.ts` uses `generateText` + `stepCountIs` |
| A schema for `customer-request/semantic-interpreter.ts` | 504 / 1,000 mismatches |
| `toSorted` for 7 harness sorts | Declined by Main, not the agent: those sort arrays freshly produced by `filter`/`map`, so the swap removes no copy and buys no safety — churn in files others are editing |

### Live defects found but NOT fixed — these need a decision, not a refactor

1. **Three-way run-status disagreement.** `run-collector.ts:513-544` returns `ok` unless *every* status is
   `skipped`; `run-loop.ts:745-768` and `run-viewer-projection.ts:532-575` return `skipped` whenever any
   is skipped. All other status pairs agree. Reachable on a routine path: `retrieval-first.ts:70-117`
   seeds a complete tool call, `turns/agent.ts:81-100` records a `skipped` recovery worklog, and
   `answer-run-summary.ts:80-97` feeds both into one collector — a shape an existing fixture already has
   (`tests/unit/answer-thread/answer-run-summary.test.ts:15-32`). The admin viewer therefore shows run
   status `ok` at the top while a phase row shows `skipped`. **Consolidating the three implementations is
   BLOCKED behind choosing a precedence** — deduping would silently pick a winner.
2. **Inquiry availability projection has diverged three ways.** On a no-admission target,
   `route-readbacks.ts:461-548` and `discovery/internal/offering-manifest.ts:138` withdraw the AE path and
   *overwrite* disclosure copy; `registry/public-inquiry-projection.ts:272` withdraws the AE path and
   *preserves the original stored disclosures*. Same input, different words shown to a customer.
3. **Deterministic IDs without uniqueness enforcement.** `attemptId` and `eventId` are generated
   deterministically with read-before-insert, but no schema declares a unique index
   (`discovery/internal/schema.ts:100-125`, `observability/internal/schema.ts:34-57`), so duplicate rows
   are possible where the code assumes they are not. This is what forced two of the index-scan refusals.

### Verification

`tsc --noEmit` clean across every file this pass touched; `npm run lint` clean; `npm run build` passes;
198 files / 1,355 tests green across all affected areas. Cumulative footprint at time of writing:
**~180 files, roughly +2,400 / −2,600.** The tree reached a fully green `tsc --noEmit` (exit 0) for the
first time this session before a concurrent session's in-flight `study` / `work-tree` / `sandbox-supply`
work reopened errors in *its* files only.

Not committed: `src/routes/api.answer.turn.ts` imports `@/lib/server/rate-limit`, which the concurrent
session has not yet tracked. Committing now would produce a HEAD that does not compile.


## Third pass — wave 6 test, tool, and harness cutover, executed 2026-08-01

The unread test/tool audit was executed as ten bounded slices. Nine landed; the React 19 slice
correctly refused both candidates. The final harness worker stalled after landing half its edit, so
Main cancelled it, inspected the partial state, completed the second extraction, and ran the
acceptance checks directly.

### Landed

| Slice | Change | Proof |
| --- | --- | --- |
| Test oracle | Deleted `legacyGroupModelsByProvider`, which reimplemented production inside its own test; replaced it with a literal expected provider/model structure | Both a one-provider mutation and a reversed-order mutation made the test fail; final 4/4 pass |
| OpenRouter test protocol | Deleted five local server/response/request-reader helpers from `answer-tool-use-agent.test.ts`; reused `tests/helpers/openrouter-contract-server.ts` | 12/12 focused tests pass; request, response, environment, and usage-field drift checked explicitly |
| Deploy-smoke URLs | Five `parseHttpsUrl` and five `resolvePath` copies → `tests/helpers/deployed-smoke.ts` | HTTPS, malformed URL, localhost, port, query, root/trailing-slash, and provider-specific diagnostics preserved; build and lint pass (live deployment smoke remains environment-gated) |
| Evidence CLI arguments | Six positional `process.argv` parsers → the existing `tools/ae/lib/args.ts` parser | No-argument before/after probes retained identical text and exit 1 for all six commands |
| Evidence fixture | Three Set/digest issuer-verifiers → `createDevelopmentEvidenceVerifier` | 2,000 randomized cases per old site, 0 valid-contract mismatches. Migration exposed and fixed a latent canonical-fixture defect: digest material is now projected to the nine production fields rather than spreading an existing digest or unknown field |
| Convex test fixtures | Five empty source-state builders → typed per-surface wrappers; three published-owner builders → `publishedBusinessOwner` | Field-drift table preserved every intentional omission; no shared mutable state; discovery/registry 153/153 plus publication, security, claim, and registry focused suites pass |
| jsdom dialog setup | Three descriptor snapshot/polyfill/restore copies → explicit `tests/setup/jsdom-dialog.ts` import | 12/12 together and each suite alone pass; Node import without `HTMLDialogElement` passes |
| Environment stubs | Seven `restoreEnv` families → Vitest `vi.stubEnv` / `vi.unstubAllEnvs` | Vitest declarations/runtime traced for both `process.env` and `import.meta.env`; fixed five real `VITE_CONVEX_URL` leak paths where an assertion could throw before inline restoration |
| Harness duration | Answer summary and admin viewer timing loops → neutral `modules/common/tool-duration` helper | Formula preserved at both boundaries (`timings` versus `timings ?? []`); harness + answer-thread 153/153 |
| Harness phase events | Public `phase()` and private `runPhase()` duplicate started/completed/failed blocks → one private event wrapper | Distinct orchestration remains intact: only public `phase()` calls `startRun()`/`withRunGuards`; only private `runPhase()` calls `runPhaseHandler` |

### Correctly refused or left owned

- `useActionState` for `AeCreditTopUpPanel` and `AeFindMyBusiness`: React queues repeated action
  dispatches, while both existing handlers reject re-entry through `pending`; rejected-action error
  propagation also differs. Adopting it would change rapid-submit and failure semantics or retain the
  manual lock it was meant to remove.
- Harness dominant status remains deliberately duplicated. Collector says `ok` for mixed
  `ok`+`skipped`; loop and viewer say `skipped`. The shape is reachable. Consolidation is blocked on
  the product precedence decision recorded above.
- AI SDK `generateText.timeout` could replace one plan-proposal attempt signal composition, but the
  saving is one line and timeout/caller-abort precedence was not differentially proved. The semantic
  model fallback ladder remains application-owned; SDK transport retries cannot replace it.

### Verification

- `npm run typecheck`, `npm run lint`, `npm run check:convex-codegen`, and `npm run build`: pass.
- Full unit run: 375/377 files pass. The only failures are the two already pinned baselines:
  `development-host-parity.test.ts` (`dynamic_published_snapshot_semantics_invalid`) and
  `project-records.test.ts` (missing pre-session research file).
- Affected integration run: 5/6 files pass. The remaining four failures are all in
  `customer-request-v2-multi-capability-route.test.ts` and were reproduced with the fixture change
  stashed out: credential authorization, source-owned preparation, and two inquiry/clarification
  expectations.
- Types 4/4, SEO 27/27, and UI contract 1/1 pass.
- The private-import gate reports 17 existing/concurrent module-internal imports, none through the
  new neutral harness helper. The broader import suite remains red in unrelated capability-supply,
  decision/work-tree, and MCP source work; the TypeScript-standards scan likewise names none of the
  wave-6 files.

## Fourth pass — wave 7 adopt-first cutover, executed 2026-08-01

Ten parallel cutover slices landed. Two stalled UI workers were replaced with bounded retry workers;
the retries edited only their assigned UI files. The pass stayed inside proven implementation seams:
protocol bytes, product precedence, persisted identifiers, authorization rules, and public copy were
not generalized.

### Landed cutovers

- **Native platform/common machinery.** `emit-snapshot-events.ts` now uses
  `Promise.withResolvers`; strict stable-value copies use `structuredClone`; emission-guard capacity
  eviction uses `Map` insertion order without parallel order arrays; the project-spine Convex schema
  uses `literalUnion`; CPM calls `addBusinessDays` directly; observability readback uses the canonical
  server config; and the always-true customer-record availability/provider layer was deleted.
- **Capability and protocol adapters.** Development x402 fixtures use
  `encodePaymentRequiredHeader` after source-level byte-equivalence inspection. Shipping uses the
  canonical `base64Codec`; response factories use native `Response.json`; and repeated collection
  implementations in action invocation, candidate/query graphs, registry, storefront,
  imported-commitment, inquiries, and shipping now use `uniqueSorted` or `stableUnique`.
- **Snapshot integrity regression fixed.** The Zod-backed dynamic-published verifier computed
  `paymentRowsValid` but omitted it from the final conjunction, so tampered invocation/payee/payment
  rows could restore as accepted. The final result now requires both payment rows and authorization
  events to validate; the existing 13-case tamper matrix and two-provider conformance matrix pass.
- **Answer/eval boundaries.** Promptfoo configuration is parsed with `yaml` and validated by a
  loose Zod schema instead of the local line parser. Answer-source readers delegate to their
  canonical Zod/public seams while preserving malformed-row fallbacks and public error codes. The
  pure tool-summary reader moved out of the action-running module so Convex projections do not pull
  Node-only action/storefront dependencies into the isolate bundle. The follow-up route validates
  providers through `AnswerSourceSchema`.
- **Public barrels and duplicate parsers.** Catalog, business, registry, and discovery public
  barrels directly re-export named implementations rather than import/rebinding `*Impl` aliases.
  Notification-outbox payload readers and the route-journal bounded JSON reader now delegate to the
  canonical operator/common implementations. Two redundant alias files were deleted:
  `src/modules/answer/layout-profile.ts` and `src/modules/customer-request/problem-tracking.ts`.
  The narrow `src/modules/answer/projection.ts` seam was retained: deleting it and importing the
  broad answer barrel made Convex codegen resolve Node-only storefront/Undici dependencies.
- **Native file discovery.** Thirty-two exact recursive test scanners were replaced by sorted
  `node:fs` `globSync` calls while retaining roots, extensions, absolute-path shape, hidden-file
  behavior, and symlink-file exclusion.
- **Test fixtures.** Sixteen Convex suites now share the existing normalized
  `tests/helpers/convex-fixtures.ts` module map. Three deferred helpers use
  `Promise.withResolvers`; four capability-contract consumers share the canonical `objectSchema`;
  and repeated default jsdom `ResizeObserver`, `matchMedia`, and `scrollIntoView` setup moved to the
  shared platform setup. Suite-specific media behavior stayed local.
- **React/Radix primitives.** Privacy delegates panel semantics to `TabsContent`; Terms uses one
  single/collapsible `Accordion`; route disclosure delegates open/ARIA state to `Collapsible`; and
  `AeSelectField` uses canonical `SelectGroup` composition without mirrored open/focus/scroll state.
  The disclosure content remains force-mounted only because existing behavior requires closed detail
  to stay in the DOM; Radix state plus `hidden` keeps it inaccessible while closed.
- **Dead UI aliases and focus state.** Unused `file-tree.tsx` and one-use
  `model-selector.tsx` were deleted. `AeThreadSidebar` uses Dialog/Command primitives directly, and
  real-trigger Dialog/Sheet callers now rely on Radix focus restoration and title semantics.
  External-trigger/chat-scroll focus bridges were retained.
- **Network guard.** Hand-written IPv4/IPv6 parsing, CIDR arithmetic, mapped-address decoding, and
  membership checks were replaced by `node:net` `BlockList` plus `isIP`. Hostname policy, two-phase
  DNS/rebinding defense, all-address rejection, and callback error contracts remain application
  owned.
- **Bounded Convex reads.** Engine-plan exact reads use the compound index; three turn guards use
  `take(26)`; first-row cases use ordered/indexed `first()`; and operation-key/funnel-event exact
  paths use existing indexes. No query now reads an unbounded collection merely to select one row or
  enforce the 25-turn cap.
- **Development compatibility.** Graphology's ESM class method is mis-transformed by Vite 8's
  dependency optimizer into an invalid reserved-word function during `serve`. A serve-only,
  dependency-scoped transform rewrites that one method to the equivalent computed method name.
  The CJS-entry alias was tested and rejected because it breaks Vite SSR with `require is not
  defined`.

### Correctly refused or left owned

- `supplied-quote.actions.ts` keeps explicit duplicate rejection; selecting the first duplicate
  would change an integrity contract.
- The `auditEvents` exact lookup remains correlation-scoped. `eventId` is not schema-unique, so a
  first-row index lookup could patch a different row.
- `AeSelectField` keeps its hidden input/name path; replacing it with Radix `name` could change form
  serialization and event behavior.
- Customer-record loading behavior, externally triggered focus restoration, chat scrolling, custom
  media-query fixtures, DNS rebinding checks, and route-disclosure DOM persistence remain owned
  behavior rather than primitive/library machinery.
- The narrow answer projection seam is a runtime bundle boundary, not a cosmetic barrel. Its first
  deletion attempt failed `check:convex-codegen`; restoring it and extracting pure tool-summary
  parsing removed the Node-only dependency chain from Convex's isolate graph.
- The three decision-gated defects from the second pass remain open: run-status precedence,
  no-admission disclosure-copy precedence, and deterministic attempt/event IDs without uniqueness
  enforcement.

### Verification

- `npm run typecheck`, `npm run lint`, `npm run check:convex-codegen`, and `npm run build`: pass.
- Full unit run: 376/377 files pass. The only remaining failure is the pinned
  `development-host-parity.test.ts` baseline
  (`dynamic_published_snapshot_semantics_invalid` while validating the host packet).
- The five directly affected UI suites pass: 65/65 tests across route disclosure, customer request
  workspace, owner offering editor, offering surfaces, and operator-shell chrome.
- Browser smoke on `/terms` proves one accordion item starts expanded, trigger activation collapses
  it and hides its panel, focus remains on the trigger, and Chromium reports zero runtime
  exceptions.
- React Doctor remains 77/100 before and after the UI pass. Its 134 repository-wide findings are
  unchanged in score and remain outside this cutover.
- `npm run test:imports` remains red on five assertions in capability-supply boundaries,
  route-mandate mutation thinness, previous-planning imports, and backup imports. The scanner
  migration itself completed and these assertions report live boundary violations rather than
  traversal errors.
- The final full integration command is not green: 34/39 files and 235/245 tests pass. Its ten
  failures are in `answer-turn-empty-state.test.ts`,
  `customer-request-v2-application-path.test.ts`,
  `customer-request-v2-multi-capability-route.test.ts`,
  `customer-request-v2-aggregate-persistence.test.ts`, and `developer-discovery.test.ts`.
  No broader integration-baseline claim is made for those failures; the focused contracts above are
  the acceptance evidence for wave 7.

## Fifth pass — wave 8 rationalisation, executed 2026-08-02

Fourteen read-only scouts ran the ponytail-audit charter (delete/yagni/dup/stdlib/native/shrink)
over disjoint slices of the whole repository; thirteen workers landed the evidence-backed cuts
under the T41 contract (no package.json edits, no mid-flight project-wide checks, importer grep
re-verified before every deletion, conscious architectural-gate updates listed per slice).
Emphasis shifted from stdlib/native substitution (exhausted in waves 1-7) to dead code,
single-implementation port collapse, and duplicate consolidation — hand-rolled code now
concentrates on domain policy, not base functionality.

### Landed (~5,700 lines removed)

- **Dead deletions:** async-durable tracer facade + port + async-only tests (~1,150);
  9 dormant tools/eval commands incl. `run-live-api-study.ts` (~1,734); orphan
  `credential-runtime`, `invokeRegisteredRouteTransport` wrapper, gardener model transport,
  unreachable run-viewer disabled-source builders, 4 uncalled harness/study source wrappers,
  collector/replay/CPM/frontier compatibility aliases, 4 dead `internal/validators.ts` modules,
  `moneyStripe.ts` setup-only actions + provider-transfer port branch, `money.functions.ts`,
  v1 sandbox option contract, legacy-v1 state/projection island, `summarizeOfferingAccess`,
  `VisibilityContract`, dead barrel re-exports across inquiries/application/capability-supply.
- **Single-host port collapse (inquiries/outbox):** `InquirySourceStatePorts`,
  `NotificationOutboxSourceStatePorts`, `InquiryNotificationPorts`, and the outbox operator-port
  indirection deleted; hosts call load/persist/command functions directly; operator-thinness
  gate consciously re-pinned to direct host wiring (~455).
- **Convex duplicate consolidation:** V2 write ports compose `customerRequestV2ReadPorts(ctx)`
  (~201); shared route-execution snapshot mappers/lookups in
  `customerRequestRouteExecutionSnapshots.ts` (~329) plus shared open-projection and
  evaluation-binding helpers; one persisted BusinessSupplyProjection decoder in
  `businessSupplyProjectionSnapshot.ts` replacing three copies (~326, boundary error identities
  preserved by prefix); capability offering/binding row mappers shared by four ports (~196).
- **Shared helpers:** `common/json-pointer.ts` (3 hand-written readers), `common/matching-csrf.ts`
  (×3), `contract-ref-key.ts` (×3), quote projection shell, submitted-inquiry receipt builder,
  parameterized inquiry row reader (×3 families), journey/funnel event names single-sourced in
  observability literals, jsonError/no-store/status-mapper/list-search route seams, ProviderFacts
  + offeringPathLabel, operator stringSearch, notification badge map (held-variant divergence
  preserved as an explicit option, flagged for product decision).
- **Test rationalisation:** 6 inline jsdom fixtures → shared setup; `ownerAdmin`,
  `convexTestWithWorkers`, `modelResponse`, `postJsonRequest` helpers; hand-built OpenRouter
  payload → `openRouterToolResponse` (~215).

### Correctly refused, with evidence

- Admission vs runtime transport-config schema unification: rule-by-rule comparison found real
  divergence (duplicate-pointer checks, x402 currency `/^[A-Z]{3}$/` vs bounded nonblank,
  trim-transform vs trim-validate). Two contracts, not one.
- The three development x402 mock runtimes: observer/lost-response/identity behaviors differ;
  a parameterized factory would be behaviour-affecting.
- dev-seed vs eval registry-seed generators: TSX differential showed 68/100 common slugs and 45
  firstRequestMode mismatches.
- Graphology de-adoption in `route-plan-generation.ts` (scout proposal rejected — adopt-first).
- `devSeed.resetDevData`/`seedCallableOffering`/`seedHealthyPublications`: live `npx convex run`
  CLI entrypoints (session-log evidence).
- `provider-integrations/shipping`: recorded Phase 3B second-provider evidence; founder decision.
- `VisibilityTargetTypeValues` narrowing (durable contract) and Fact/Metric → AeOperatorFactGrid
  (material markup change) refused.

### Main-integration fixes after the parallel pass

- Shared `requireDispatch` was keyed by `dispatchRef` but the cancel path passed an `attemptRef`;
  added `requireDispatchByAttempt` reproducing the old `by_attemptRef` lookup (caught by the
  multi-capability integration suite, 32/32 after fix).
- Barrel deletions tripped the private-import gate at five convex hosts; resolved by public-seam
  re-exports plus a new isolate-safe `external-run/convex.ts` (the module's `public.ts` re-exports
  the Clerk-tainted TanStack source layer and cannot enter the Convex bundle).
- `v2-read-thinness` gate refined: read-mapper names may be imported from ReadPorts, never
  redefined in WritePorts.
- Concurrent-session repairs (their in-flight files, validated by their own tests): external-run
  type errors fixed by moving to generated Convex builders (`externalRuns.test.ts` 10/10);
  `demandCaptureAction` restored to the action registry after an accidental drop.

### Verification

`npm run test:all` exit 0 on 2026-08-02: typecheck, Convex codegen, unit 374 files / 2,687 tests,
integration 39 files / 244 tests, types, imports, ts-standards, seo 29, ui-contract, and the
production build all pass in one composite run.

## Sixth pass — wave 9 gold-standard AI SDK v7 / Convex-component integration, executed 2026-08-02

Founder directive updated the eval-stack bet toward full library adoption. Three librarians
(AI SDK v7 from installed d.ts/docs, @convex-dev/agent from npm/GitHub, workflow/workpool from
installed source) plus five flow/divergence scouts fed six discrete cutover workers. A maintained
architectural map now lives at `.planning/codebase/PROMPT-DATA-FLOW.md` (three end-to-end
prompt/data-flow traces, library-adoption boundary, entropy ledger A1-A9/B1-B6/C1-C4), linked
from ARCHITECTURE.md with an update rule.

### Landed

- **Answer tool loop consolidated to one `generateText`** with `tools` + `output:
  Output.object(AnswerProseSchema)`: custom stop condition defers `isStepCount(4)`/budget once so
  `prepareStep` runs a final tool-less (`activeTools: []`) structured step; separate prose request
  and manual JSON-substring extraction deleted (~21 net lines); contract server now shape-checks
  json_schema/tool rounds, routing on request shape (not call index) so multi-turn suites work.
- **v7 canon in the agent**: `stepCountIs`→`isStepCount`, `onStepFinish`→`onStepEnd`, cacheWrite
  usage mapped into harness records, failed model requests now append to returned accounting
  (previously written to a throwaway array), harness `runModel` gets the real request seq (C2).
- **Semantic transport structured output**: `createOpenRouterJsonTransport` uses
  `Output.object({schema, name})` + `structuredOutputs: true`, v7 `timeout:` replacing manual
  `AbortSignal.timeout/any`, typed `result.output` seam; SDK TimeoutError/NoObjectGeneratedError
  bridged into the existing provider/invalid_json/shape/kind taxonomy (~244 scoped lines removed).
  Post-parallel fix: the first wire schema was stricter than the old parse-then-normalize path;
  restored tolerance with `z.looseObject` + optional arrays so `normalizeSemanticProposal` +
  `proposalSchema` keep exact old acceptance/failure behavior, and patched 3 integration files'
  fixtures (`finish_reason: 'stop'`).
- **Entropy fixes** (map ledger): A2 plan toolPolicy threaded into the agent (one budget source);
  A4 prompt tool list derived from ANSWER_READ_TOOL_IDS; A5 missing-function write fallback graph
  deleted; A7 stale AnswerSynthesizer abstraction cut; A8 unsupported turns project truthfully;
  B2 dead markAccepted machine + 6 test callsites deleted (`accepted` kept as historical schema
  literal); B3 refresh finalAttempt divergence proven deliberate (fe50518d) and documented;
  B6 legacy `leased` projection branch deleted.

### Blocked / refused, with evidence

- **@convex-dev/agent: BLOCKED.** Latest 0.6.4 peers `ai ^6.0.35` + `@ai-sdk/provider-utils
  ^4.0.6` (registry packument, all prereleases checked); source hard guard `AssertAISDKv6`
  (`src/client/types.ts:47-53`); v7 support is draft PRs get-convex/agent#305/#306/#307 (#306
  blocked on @convex-dev/rag). No install/override/fork. Documented fallback (official
  docs.convex.dev/agents/workflows): AI SDK in internalActions orchestrated by WorkflowManager.
  Migration sketch recorded in PROMPT-DATA-FLOW.md for when a v7 release lands.
- **Workpool for cancellation/readiness scheduler hops: REFUSED.** Native `ctx.scheduler`
  scheduled actions are documented at-most-once/no-retry (convex scheduler.ts:22-25) — exactly
  the current semantics; workpool adds component state for zero gain (route pool defaults
  `retryActionsByDefault: true`, a behavior change). `convex/projectSpine.ts` audited clean
  against workflow 0.4.4 canon (no onComplete `error` typo, deterministic handlers, bounded step
  data).
- workflow 0.4.4 / workpool 0.4.9 confirmed latest on npm; installed README's onComplete snippet
  has two typos (`kind === 'error'` vs actual `failed`; `context.name` vs `for`) — recorded so
  future migrations copy source, not README.

### Verification

`npm run test:all` exit 0 on 2026-08-02 (~12:52): typecheck clean repo-wide, Convex codegen,
unit 375 files / 2,703 tests, integration 39 files / 244 tests, types, imports, ts-standards,
seo, ui-contract, production build — one composite run. Concurrent-session work-tree/study churn
produced transient typecheck noise during the wave; settled before the final gate.