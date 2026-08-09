# Error-Handling: Full Blast Radius & a Principled Taxonomy

Date: 2026-08-08 (migration closeout; design baseline: 2026-08-07)
Status: completed migration / closeout (implementation and observed verification recorded below; the original design rationale is retained as provenance)
Scope: The original inventory covers kernel / action registry, HTTP routes, answer engine SSE, and market-terminal CLI. This closeout covers the shipped non-2xx HTTP + CLI migration; answer SSE, HTTP-200 domain outcomes, and HTML/page contracts remain intentionally separate.

> Method: four read-only scouts mapped every error production/consumption site per layer
> (ScoutKernelErrors, ScoutHttpRoutes, ScoutAnswerEngine, ScoutCliErrors). File:line refs below
> are from those maps; anything not directly observed is marked `[INFERENCE]`.

## 0. 2026-08-08 migration closeout

**Disposition:** The RFC 9457 / `google.rpc.Code` boundary migration described by
this record shipped on 2026-08-08. This section is the implementation closeout;
sections 1–7 retain the 2026-08-07 blast-radius analysis and design rationale.
Counts below are time-stamped observed runs, not a claim that the shared tree is
currently globally green.

### Shipped non-2xx contract

Every migrated non-2xx HTTP boundary now returns an RFC 9457 Problem Details
object with this shape (members after `status` are conditional where noted):

```json
{
  "type": "about:blank",
  "title": "Invalid argument",
  "status": 400,
  "detail": "Invalid query parameter.",
  "instance": "/api/businesses?limit=-1",
  "kind": "INVALID_ARGUMENT",
  "code": "invalid_query_parameter",
  "reason": "invalid_query_parameter",
  "retryable": false
}
```

`type`, `title`, `status`, `kind`, and stable `code` are canonical members;
`detail`, `instance`, `reason`, `retryable`, and route-specific extensions are
included only when supplied. The concrete ownership is:

- `src/lib/errors.ts` owns `PROBLEM_KINDS`, status/title defaults,
  `ProblemInput`/`ProblemDetails`, `buildProblem`, and
  `operationResultToProblem`.
- `src/lib/server/problem.ts` is the HTTP projection seam. It always forces
  `Content-Type: application/problem+json` and `Cache-Control: no-store`.
  Caller headers may add `Retry-After`, `WWW-Authenticate`, `Vary`, or `Allow`,
  but cannot override those two reserved headers.
- `kind` is the closed canonical classification owned by `src/lib/errors.ts`:
  google.rpc.Code-aligned values plus the declared HTTP-specific kinds and the
  explicit repository extension `no_data`; `code` is the stable machine token
  owned by the producing route/domain/kernel contract. `reason` is optional
  explanatory data, not a second classification vocabulary. The status-derived
  fallback is centralized in `kindForStatus`, not inferred from prose.
- `no_data` remains a successful HTTP-200 domain outcome and is not accepted as
  a non-2xx Problem Details kind by the CLI.

### Boundary seams and migrated surfaces

- Shared route helpers (`jsonError`, rate limiting, and route action boundaries)
  now project through `problem`; customer-request, registry/business/search and
  slug validation, storefront, notification, sandbox/provider-host, WorkTree,
  routing-kernel retirement, OAuth/.well-known WBA, and MCP boundaries use the
  same non-2xx wire contract.
- `src/lib/server/method-guard.ts` owns RFC 9457 405 responses and `Allow`.
  Explicit handlers on API routes prevent wrong methods from falling through to
  an HTML SPA response. `src/routes/api.$.ts` owns the `/api/**` catch-all 404.
- The residual query/slug validation paths are explicit at
  `src/routes/api.businesses.ts` and `src/routes/api.businesses.$slug.ts`.
  The formerly divergent WorkTree, routing-kernel retirement, WBA directory,
  and sandbox/provider-host envelopes now use `problem`; OAuth and MCP wrong
  methods/auth boundaries likewise use the method guard/problem seams.
- `tools/ae/lib/output.ts` owns `CliFailure` and `requireOk`: a non-2xx
  `application/problem+json` response becomes a typed failure with canonical
  `kind`, stable `code`, and an actionable message. `tools/ae/cli.ts` catches
  argument and command failures and emits the stable JSON envelope
  `{ kind, code, message, detail?, exitCode }` without a stack. Remote problem
  bodies are not dumped to human stderr; non-string remote detail is discarded
  in favor of the title, and the message is whitespace-collapsed. The MCP
  action catch returns the generic `Action failed.` text rather than exposing
  `error.message`.

### Blind re-audit corrections

The first blind re-audit found residuals rather than accepting the initial
migration as uniform. The subsequent correction pass closed: registry
query/slug validation; WorkTree, routing-kernel retirement, WBA, and sandbox
non-2xx envelopes; OAuth/MCP/wrong-method fallthrough; raw MCP exception
messages; and CLI parse/remote-detail leakage. The source seams above are the
closeout evidence for those corrections. HTTP-200 domain result contracts were
not rewritten as if they were transport failures (see exclusions below).

### Observed verification evidence

Observed on 2026-08-08:

- Initial canonical-model/focused gate: **6 files, 55 tests passed**.
- Residual-correction gate: **8 files, 39 tests passed**, plus targeted
  registry validation **5 passed / 16 skipped**.
- Final post-fix boundary gate (after concurrent DTO drift): **8 files, 37
  tests passed**, plus selected registry negative cases **4 passed / 16
  skipped**.
- Blind API fuzz: **61/61 known API routes** returned 405 Problem Details for
  wrong methods and the API catch-all returned 404. Later live probes observed
  an overlong slug → 400, OAuth authorize/metadata wrong methods → 405 with
  `Allow`, MCP wrong method → 405 with `Allow`, registry invalid
  `limit`/`mode` → 400, WorkTree unknown action → 404, sandbox auth failure →
  401 with a challenge, and an intact normal API request → 200.
- The latest broad run observed **459/483 files** and **3314/3402 tests**
  passing. The remaining failures were in concurrent DTO, Customer Request,
  import-gate, graph, money, and UI work. Current money WIP prevents CLI
  subprocess startup (`moneyRefSchema` / `compareExactAmounts`); that is a
  verification limitation, not an RFC 9457 migration defect.

### Intentional exclusions

- HTTP-200 domain outcomes, including `no_data` and typed action/provider
  outcomes, remain their existing contracts. A domain refusal/error represented
  as a successful protocol result is not silently relabelled as Problem Details.
- HTML page success/routes, discovery text success, and SSR/page rendering stay
  page contracts. This closeout concerns non-2xx API/CLI boundaries, not a
  replacement of all HTML responses.
- Answer SSE remains its typed `AnswerEvent`/error-event contract. It is not
  forced into an `application/problem+json` body or a CLI envelope.

### Maintenance contract

New non-2xx HTTP routes MUST return `problem(...)` (or a shared helper that
delegates to it), choose a canonical `kind` and stable producer-owned `code`,
and add only necessary extension fields. Every route MUST register explicit
wrong-method handlers where the router could otherwise fall through; `/api`
paths MUST remain covered by the catch-all. New CLI consumers MUST use
`callJson` + `requireOk` and throw `CliFailure` for local validation/domain
translation, leaving `tools/ae/cli.ts` as the sole renderer. No new ad-hoc
`{ error }`, `{ kind: 'refused' }`, raw exception, compatibility envelope, or
speculative second taxonomy is permitted at these boundaries.

---

## 1. Historical TL;DR (2026-08-07 baseline)

The design-time snapshot found **no shared error boundary model** beyond the
kernel's `OperationExecuteResult` union
(`src/modules/capability-execution/operation-execute.functions.ts`).
Everything else was a partial duplicate or a parallel vocabulary:

- **HTTP routes** — ~7 coexisting JSON error vocabularies, no central envelope
  (`ScoutHttpRoutes`).
- **CLI** — one `CliFailure(string, exitCode)` + a central catch, but a large
  set of "render-error-as-data" paths that exited 0 (`ScoutCliErrors`).
- **Action registry** — loose `ActionResult = { kind } & Record`
  (`src/modules/common/action.ts`).
- **Answer engine SSE** — typed `{ type: 'error', code, copyId }`, closed code
  set (`ScoutAnswerEngine`).

This diagnosis is retained as provenance for the migration's blast radius. The
closeout above records the shipped shared boundary seams; it supersedes this
baseline wherever the baseline says that an envelope or gap still exists.

---

## 2. 2026-08-07 baseline by layer (provenance)
The inventory below is the pre-migration snapshot from the four scouts. It
explains why the migration touched these layers; it is not a statement that
the listed legacy non-2xx envelopes remain after the closeout.

### 2.1 Kernel / capability-execution (the one typed root)
- `OperationExecuteResult` discriminted union `ok | refused | error` — source of truth
  (`src/modules/capability-execution/operation-execute.functions.ts`).
  - `refused` carries `reason`; `error` carries `code` + `reason`. Refusal reasons and error codes
    are **closed enums**.
- Mirrored by a duplicate zod `executeOutputSchema` in `src/modules/capability-execution/operation-execute.actions.ts`
  (the `defineAction` output validation). TS union vs zod schema drift risk.
- Fail-closed gates (keyless credential `'none'`, `http-json:v1` GET, not-x402, HTTPS-only, schema,
  input-size) return **typed refusals** here.
- **Gap:** `src/modules/capability-execution/seed-supply.ts` silently `continue`-drops
  non-executable / x402 / shape-note ops instead of refusing with a typed reason (the derived
  catalog path).
- **Parallel vocab:** `src/modules/action-invocation/dynamic-published-contract.ts` has its own
  `published_operation_succeeded | ... | refused | invalid_evidence` result — distinct from
  `OperationExecuteResult` (`ScoutKernelErrors`).
- `src/modules/actions/index.ts`: 40+ actions; `operationExecuteAction` threads the union
  through. `ActionResult` (the action-run contract) is loose.
- `src/modules/capability-execution/public.ts` and `index.ts` are byte-identical duplicate
  re-export surfaces (`ScoutKernelErrors`).

### 2.2 HTTP routes (the largest blast radius)
TanStack Start / React Router file routes returning `Response` directly — **not Express, no error
middleware, no central envelope** (`ScoutHttpRoutes`).

At least ~7 JSON error vocabularies coexist:
| Vocabulary | Example shape | Where |
|---|---|---|
| `{ error: <code> }` | `{error:'rate_limited'}` 429 | `src/lib/server/json-error.ts`, `rate-limit.ts`, customer-request boundary, OAuth |
| `{ kind:'refused', reason }` | `{kind:'refused', reason:'unsupported_query_parameter'}` 400 | `api.businesses.ts`, `customer-request-agent-api.ts`, `sandbox-capability-provider.ts`, `stripe-webhook`, `api.v1.requests.$requestRef.options.ts` 405 |
| `{ kind:'error', code, reason, retryable }` | — | `notification-dispatch.ts`, `storefront.enrich.ts` |
| `{ kind:'refused', code, reason }` | — | `business-tool-api.ts` |
| `{ kind:'not_found'\|'method_not_allowed'\|'refused'\|'provider_host_error' }` | — | `sandbox-route-provider-host.ts` |
| `{ ok:false, reason }` | — | `observability.funnel.ts` |
| `{ kind:'not_found', code, reason }` | — | `$slug.ucp.ts` |

- Non-JSON surfaces: discovery files (llms/robots/sitemap/SKILL/ucp) encode errors in **HTTP
  status only** (`src/lib/http/discovery-response.ts`); SSR pages render **HTML 500** on uncaught
  throws; the framework emits `Only HTML requests are supported here` for page routes
  (`src/lib/http/agent-content-negotiation.ts`).
- `src/router.tsx`: only a default 404 HTML component; **no custom error boundary**.
- Strongest existing shared seam: `{ error: <code> }` via `src/lib/server/json-error.ts` /
  `customer-request-route-action-api.ts` / `no-store-response.ts`.

### 2.3 Answer engine SSE (already typed)
- `AnswerEvent` union incl. `{ type:'error', code, copyId }` — `src/modules/answer/answer-synthesizer.ts`.
- Code producers (`ScoutAnswerEngine`):
  - `answer_turn_failed` (`turn-orchestrator.ts`, `turns/agent.ts`)
  - gate codes: `empty_prose`, `grounding_failed`, `epistemic_vocabulary`, `injection_upgrade`,
    `unsupported_provider_claim` (`answer-gate.ts`)
  - `answer_turn_persist_failed`, `budget_exceeded`, thread codes
    `thread_not_found/thread_forbidden/thread_turn_limit` (`turn-guard.ts`)
  - `AnswerToolUseAgentError`: `unavailable/prose_failed/tool_unavailable/request_failed`
- Stream shape: `thread? -> work-step* -> plan -> ... -> complete | error`.

### 2.4 Market-terminal CLI (`tools/ae/**`)
- One central `main()` catch owns exit codes + the `--json` envelope
  `{ kind:'error', exitCode, message }` (`cli.ts`).
- `CliFailure(message, exitCode=1)` is the intended single thrown type + `requireOk` throws it on
  non-2xx (`lib/output.ts`).
- **Two `--json` pollution gaps**: `parseArgs` flag errors are uncaught (exit 1, plaintext
  regardless of `--json`); the `action operation.execute` write-refusal path prints prose that
  leaks into `--json` (`ScoutCliErrors`).
- **Pervasive "render-error-as-data" (exit 0)**: `request.ts` reports HTTP status as data,
  `import/enrich/discover/journey` render error/unavailable/stall bodies and exit 0 — never throw.
  So a scripted `--json` consumer sees `exit 0` with an "error" body (misclassified success).
- `run` adapts `OperationExecuteResult` and adds a `noData` marker for matched-nothing shells.
- `study` classifies `grounded/partial/no_live_value`; `compare` folds the union into `FeedRun`.

---

## 3. Historical target: one threaded taxonomy (not a bolt-on)

The design target was to define one code space at the deepest typed root and
project it through every boundary. The shipped implementation realizes that
target for migrated non-2xx HTTP and CLI boundaries through the seams in
section 0; it intentionally does not rewrite HTTP-200 domain outcomes or the
typed answer SSE protocol.

### 3.0 Gold-standard anchoring (NOT hand-rolled)

The taxonomy must be anchored to existing standards, not a bespoke enum. Adopting a spec is not
adding a dependency — RFC 9457 and `google.rpc.Code` are conventions; the only `code`/enum asserts
are labels over the repo's existing types.

| Concern | Standard | How it applies here |
|---|---|---|
| HTTP error envelope | **RFC 9457 Problem Details** `{ type, title, status, detail, instance }` + extension members, `application/problem+json` (obsoletes RFC 7807, same wire shape) | Normalize the ~7 route vocabularies onto it. Our `code`, `reason`, `kind` ride as extension members. `status` = HTTP status. |
| Failure `kind` lattice | **Google API Error Model / `google.rpc.Code`** canonical enum | `kind` := canonical code, not a bespoke 11-value enum. Reduces maintenance to a spec. |
| stable machine `code` | **Stripe-style** typed error `code` strings | The kernel refusal/error codes and SSE gate codes (e.g. `unsupported_provider_claim`) are already stable tokens — reuse as `code`. |
| typed domain result | **Result pattern** (`neverthrow`/`oxide`/`effect`) | The kernel's `OperationExecuteResult = ok \| refused \| error` union already is this — idiomatic vanilla TS. Keep; no library needed. |

Canonical-code mapping (the old bespoke `kind` → `google.rpc.Code`):
`usage`/`validation` → `INVALID_ARGUMENT` (or `FAILED_PRECONDITION`) · `not_found` → `NOT_FOUND` ·
`forbidden` → `PERMISSION_DENIED` · `unauthenticated` → `UNAUTHENTICATED` · `too_many`/`budget_exceeded`
→ `RESOURCE_EXHAUSTED` · `network`/`unavailable` → `UNAVAILABLE` · `internal`/`contract` → `INTERNAL` ·
`refused` → `PERMISSION_DENIED`/`FAILED_PRECONDITION`.
The ONE repo-native case the canonical codes cannot express is `no_data` ("no value", not a
failure) — it remains a domain extension member, distinct from error kinds.

### 3.1 Core error model (historical design sketch; shipped ownership is in section 0)
```ts
// `kind` is a google.rpc.Code (canonical), NOT a bespoke enum.
type AeError = {
  kind: CanonicalCode        // INVALID_ARGUMENT | NOT_FOUND | ... | (repo extension) | 'no_data'
  code: string               // stable machine token (kernel refusal/error code, SSE gate code)
  message: string            // one actionable human line
  httpStatus?: number        // derived from kind; default mapping
  detail?: unknown           // structured extra (missing-field names, retryable, instance/ref)
}
```
- **Additive, not a rewrite:** existing closed enums (kernel refusal/error codes, SSE gate codes)
  become the `code` vocabulary; `kind` is `google.rpc.Code` (the standard lattice) so CLI + HTTP +
  CLI classify without string-matching `code`.
- **HTTP projection = RFC 9457:** `{ type, title, status, detail, instance }` with
  `kind`/`code`/`reason` as extension members, media type `application/problem+json`.
- `no_data` is a **distinct non-error kind** (already started in `run`) so `ok` / `no-value` /
  `failure` are three unambiguous outcomes across every surface.

### 3.2 Projection mappers (historical design sketch; shipped seams are in section 0)
- `operationResultToAeError(OperationExecuteResult): AeError` — one place converts the kernel
  union; kills the hand-rolled translation in `run`/`compare`/`study`.
- `aeErrorToHttp(status, body)` / `httpErrorToAeError(status, body)` — one HTTP envelope + one
  consumer-side classifier for the CLI's `callJson`.
- `sseErrorToAeError(AnswerEvent['error']): AeError` — maps SSE codes to the shared kind.
- CLI renderer reads `AeError`: `--json` → `{ kind, exitCode, code, message, detail }` (stable,
  every command); human → `message` on stderr, no raw dumps. Central in `cli.ts` catch; kill the
  per-command prose strings.

### 3.3 What each layer actually changes
The table that follows is the design-time change inventory and risk estimate;
the shipped seams and observed scope are the authoritative account in section
0, not this forecast.
| Layer | Change | Size / risk |
|---|---|---|
| Kernel | Expose canonical code enums; map cone `seed-supply` silent-drops → typed refusals; optionally consolidate `dynamic-published-contract` vocab | small, additive |
| HTTP routes | Normalize ~7 envelopes → 1 (`{ kind, code, reason?, message? }`); shared route error helper; add top-level error boundary / JSON 500 | **largest** (~20 files) |
| Answer engine SSE | Already typed; add `code` classification into shared kind (no behavior change) | small |
| CLI | `CliFailure(kind, {code,...})`; one renderer; convert render-as-data exit-0 paths to proper kinds/exit codes; fix 2 `--json` gaps (args parse, actions write-refusal) | ~18 files |
| Process | Route boundary tests (imports) + per-envelope assertions updated for the single shape | test churn |

---

## 4. Historical migration path (phased plan; closeout supersedes status)
These bullets are the 2026-08-07 phased plan retained for provenance. They are
not open work items; the final disposition is in section 0 and section 7.

- **Phase 0 — taxonomy + shared types, no behavior change.** Add `src/lib/errors.ts`, the
  `AeError` model, and the three projection mappers as **pure functions**; unit-test the mappers.
  Nothing consumes them yet → zero blast radius. This is where the decision is locked.
- **Phase 1 — kernel.** Expose canonical codes; make `seed-supply` refuse loudly (typed) instead
  of silently dropping; align `dynamic-published-contract` onto the shared kind. Small, additive.
- **Phase 2 — HTTP routes.** Introduce the shared route error helper next to `json-error.ts`;
  normalize the ~7 vocabularies to one envelope; add a JSON 500 boundary so uncaught throws stop
  returning HTML to API callers. Touches ~20 route/lib files (the big one — do in sub-slices by
  route family). Peer update: the CLI's `requireOk` starts consuming `{kind,code}`.
- **Phase 3 — CLI.** Thread `AeError` through `CliFailure`; one renderer + stable `--json`
  envelope; convert the render-as-data exit-0 paths; fix the two `--json` gaps.
- **Phase 4 — answer engine.** Add SSE→shared-kind classification; verify CLI/HTTP translate the
  same way, so `answer_turn_failed` / `unsupported_provider_claim` etc. surface as one consistent
  message everywhere.

---

## 5. Decisions (historical open questions → closeout disposition)

The questions below were open on 2026-08-07. Their rationale is retained, but
they are no longer unowned implementation decisions.

1. **HTTP envelope — resolved.** Adopt RFC 9457 Problem Details
   (`{type,title,status,detail,instance}` plus extensions and
   `application/problem+json`). `kind` uses the `google.rpc.Code`-aligned
   subset plus explicit HTTP/repository extensions; stable `code` and optional
   `reason` are extensions. The standard replaces the bespoke
   `{error}`/`{kind}` wrappers.
2. **`no_data` — resolved as a domain outcome.** It is a distinct repository
   extension for "no value", remains HTTP 200, and is not a non-2xx failure.
3. **`dynamic-published-contract` versus `OperationExecuteResult` —
   intentionally separate.** They remain separate consumer contracts because
   unifying them could break published-operation proof semantics. Shared
   boundary projection does not merge their internal result unions or codes.
4. **Normalization breadth — resolved by route family.** The shared
   `problem`/`methodNotAllowed` seams were applied across the customer-request,
   registry/business, storefront, sandbox/provider-host, WorkTree,
   routing-retirement, OAuth/.well-known, MCP, notification, and related API
   families. No compatibility envelope was retained.
5. **API fallthrough/500 boundary — resolved for API boundaries.** Explicit
   method handlers plus `src/routes/api.$.ts` prevent wrong-method and unknown
   `/api` requests from becoming successful HTML. HTML page routes and their
   page-rendering contract remain intentionally separate; this is not a claim
   that every uncaught page exception is Problem Details.

---

## 6. Blast-radius tally (historical planning inventory)

- `src/lib/server/*`: `json-error.ts`, `no-store-response.ts`, `rate-limit.ts`,
  `customer-request-route-action-api.ts`, `customer-request-agent-api.ts`,
  `customer-request-oauth-api.ts`, `customer-request-browser-api.ts`, `notification-dispatch.ts`,
  `business-tool-api.ts`, `sandbox-capability-provider.ts`, `sandbox-route-provider-host.ts`.
- `src/routes/*`: `api.businesses.ts`, `api.answer.turn.ts`, `api.storefront.enrich.ts`,
  `api.observability.funnel.ts`, `api.v1.requests.$requestRef.options.ts`, `$slug.ucp.ts`,
  `router.tsx`, discovery routes.
- `src/modules/**`: `capability-execution/*` (kernel), `action-invocation/dynamic-published-contract.ts`,
  `actions/index.ts`, `money/internal/stripe-webhook.ts`, `answer/**` + `answer-thread/**` (SSE).
- `tools/ae/**`: `cli.ts`, `lib/{output,args}.ts`, `commands/**` (16 files).
- Tests: imports/route-boundary + per-route envelope assertions.

The conditional below records the original planning trade-off, not a remaining
option: the HTTP layer was the expensive half and the part most likely to
change the opaque 500/wrong-method experience. The closeout confirms that the
HTTP boundary was included rather than skipped.

---

## 7. Historical recommendation and final disposition

The original recommendation was to do **Phase 0** first: add the shared
`src/lib/errors.ts` model and pure projections onto RFC 9457 / `google.rpc.Code`,
unit-test them, then phase outward by layer and route family. That rationale
still explains the implementation order and why the migration is not a
bolt-on.

**Final disposition:** Phase 0 and the outward HTTP/CLI boundary migration are
complete. The canonical model, forced HTTP headers, method guard/API catch-all,
CLI `CliFailure`/`requireOk`, residual corrections, and observed evidence are
recorded in section 0. The answer SSE and HTTP-200 domain contracts remain
separate by deliberate decision; no compatibility layer or speculative future
phase is implied.
