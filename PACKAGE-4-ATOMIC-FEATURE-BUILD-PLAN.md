# Package 4 atomic feature-build plan — OSS Formance amendment

**Status:** substantially implemented; release verification and production activation remain gated

**Scope:** Package 4A–4H, delivered as ten sequential, independently reviewable PRs

**Product authority:** [`PRODUCT.md`](./PRODUCT.md)

**Architecture context:** [`IMPLEMENTATION_ROADMAP.md`](./IMPLEMENTATION_ROADMAP.md)

**Supersedes:** the custom Convex journal, balance-projection, and automated-reconciliation sections of the previous Package 4 plan

**Prepared:** 2026-09-02

## Progress reconciliation — 2026-09-05

The delivery design below is retained unchanged; its original future-tense
tasks are not a current inventory of missing implementation. Package 4 source
was integrated in `7865a0803` on 2026-09-03 and is present at `main`
`987cdec5085c207eb6b9024b66ef4a20de8a3da0`. The current working tree contains
additional uncommitted funding, webhook and infrastructure changes, whose
deployment status must be read separately.

[Package 4 release evidence](./docs/guides/package-4-release-evidence.md)
records the dated local suites, real Formance checks and hosted Stripe sandbox
funding of exactly AUD 5.000000. It explicitly leaves managed-x402
success/refusal/recovery, refund/replay, documents and signed close, protocol
parity, strict environment recovery and the external Base Sepolia canary open.
[Deployment maturity](./docs/operations/deployment-maturity.md) records later
partial deployments and operating blockers. None of those checks was rerun for
this documentation reconciliation. Package 4 is not closed and production
funding/mainnet effects remain gated.

## 1. Outcome

Package 4 closes one recoverable sandbox managed-x402 purchase for an Australian
business:

```text
settled Account AUD funding
  -> compact Operation search
  -> caller-specific inspection and expiring Commitment
  -> Formance-native Account + Agent budget + exposure + treasury reservation
  -> official CDP/x402 paid retry
  -> completed | pending | refused | outcome_unknown
  -> Calls, Usage, Spend, documents and signed financial close
```

The central change is financial authority:

```text
Convex
  Principal + Account + Package 3 authority
  Commitment + Invocation + submission fence + recovery
  Call evidence + document snapshot + operator control case
                         |
                         v
existing Node Action boundary
  official Formance SDK only
                         |
                         v
Formance Community Edition
  Gateway -> Ledger + Numscript -> PostgreSQL
  bookings + balances + reservations + reversals + monetary idempotency
```

Formance is the only product-ledger authority. Convex does not independently
calculate or persist an authoritative balance, spend total, budget balance,
treasury capacity, Provider payable, or journal posting.

This is a clean no-user replacement. There is no legacy transfer, dual write,
shadow balance, compatibility API, synthetic backfill, or fallback ledger.

## 2. Locked decisions

These are implementation inputs, not choices left to a PR author.

| Area | Locked decision |
| --- | --- |
| Formance edition | Community Edition only. No Enterprise dependency in Package 4. |
| Initial modules | Ledger, Numscript and Gateway. Payments is not deployed until a maintained Community connector replaces a real provider responsibility without custom middleware. |
| Financial truth | Formance owns bookings, balances, reservations, reversals and monetary idempotency. |
| Product truth | Convex owns Account/Principal mapping, policy, authority, Commitment, Invocation, x402 submission state, delivery evidence and recovery. |
| Provider integrations | Keep the official Stripe, CDP and x402 packages. Do not build a Formance Generic Connector or duplicate their clients. |
| Reconciliation | Exact-reference verification per command plus a human-signed daily close. AE stores evidence and discrepancy cases; it does not implement dataset matching or drift algorithms. |
| Non-critical reads | Owner pages may use a timestamped Convex snapshot of an official Formance read. Snapshots are display-only and never authorize a consequence. |
| Outage behavior | Financial entry fails closed. Search and non-financial reads remain available. Possible writes recover by exact Formance reference; no offline write queue and no Convex fallback. |
| Local/CI | Pinned official Docker images and disposable PostgreSQL. |
| Synthetic VPS pilot | Ledger, worker, Gateway and PostgreSQL may share one VPS only while balances are fixtures and production effects are disabled. |
| Real money | Formance services may remain on the VPS, but PostgreSQL must move to a managed service with point-in-time recovery before activation. |
| Secure ingress | Cloudflare Tunnel plus Access service tokens. Formance ports are never exposed directly. Tailscale may be used for human operations only. |
| Stable release line | Stack BOM `v3.2.10`, Ledger `v2.4.12`, Gateway `v2.3.1`, TypeScript SDK source release `v7.0.0`, PostgreSQL 16. Ledger v3 alpha is excluded. |
| Exactness envelope | Six-decimal units must remain safe integers at the official SDK boundary. Hard refusal above `9,007,199,254,740,991` units; vendor/architecture review at A$1 billion cumulative flow through any shared six-decimal account. |
| Commercial topology | AE is the buyer-facing Seller. The customer AUD sale and corporate USDC Provider cost are separate legs linked by one Call. |
| Recovery | Possible external dispatch returns `outcome_unknown` and only status/reconciliation continuations. |
| Production | Funding and mainnet settlement remain disabled until Australian policy approvals, managed-database controls, recovery proof and operational sign-off are current. |

## 3. Governing documents and first-hand references

### Repository authority

| Source | Controls implementation |
| --- | --- |
| [`PRODUCT.md`](./PRODUCT.md) | AE owns bounded market authority and commercial closure, not general identity, custody, payment or accounting infrastructure. |
| [`AGENTS.md`](./AGENTS.md) | Minimum sufficient change, direct inspection, dirty-tree protection and narrow proof. |
| [`IMPLEMENTATION_ROADMAP.md`](./IMPLEMENTATION_ROADMAP.md) | Package sequencing and the 4A–4H maturity destination. |
| [`CONTEXT.md`](./CONTEXT.md) | Meanings of Account, Agent Principal, Commitment, Invocation, Call and commercial closure. |
| [`convex/_generated/ai/guidelines.md`](./convex/_generated/ai/guidelines.md) | Convex Node Actions, validators, transactions, indexes, pagination and generated-code rules. |
| [`research/PACKAGE-4-AUSTRALIAN-PREPAID-LEDGER-REGULATORY-PERIMETER.md`](./research/PACKAGE-4-AUSTRALIAN-PREPAID-LEDGER-REGULATORY-PERIMETER.md) | Australian launch red lines, approval families and evidence perimeter. |
| [`research/PACKAGE-4-OPERATIONS-RECONSTRUCTION-RESEARCH.md`](./research/PACKAGE-4-OPERATIONS-RECONSTRUCTION-RESEARCH.md) | Evidence provenance and reconstruction boundaries. |
| [`docs/adr/0001-principal-reseller-commercial-topology.md`](./docs/adr/0001-principal-reseller-commercial-topology.md) | Buyer Charge and upstream Provider obligation remain separate. |

### Formance evidence and official mechanisms

| Source | Required use |
| --- | --- |
| Spike branch `codex/package4-formance-spike`, commits `18b16d1a0..15b1b2e99` | Executable adoption evidence: exactness envelope, native bookings, contention, recovery, pagination, backup/restore and upgrade. |
| [Formance Stack `v3.2.10`](https://github.com/formancehq/stack/releases/tag/v3.2.10) | Maintained component BOM. Enable only Community Ledger and Gateway. |
| [Ledger `v2.4.12`](https://github.com/formancehq/ledger/releases/tag/v2.4.12) | Stable product-ledger server; no v3 prerelease. |
| [Official TypeScript SDK `v7.0.0`](https://github.com/formancehq/formance-sdk-typescript/releases/tag/v7.0.0) | The only application client. No raw HTTP, generated fork, interceptor or response parser. |
| [Ledger schemas and templates](https://docs.formance.com/modules/ledger/working-with/ledger-schema) | Strict immutable schema plus named Numscript templates. |
| [Idempotency](https://docs.formance.com/modules/ledger/working-with/idempotency) | Stable key and reference on every monetary command. |
| [Atomic bulk](https://docs.formance.com/modules/ledger/working-with/bulk-processing) | One all-or-nothing reservation across AUD and USDC transactions. |
| [Filtering and pagination](https://docs.formance.com/modules/ledger/working-with/filtering-queries) | Official indexed/cursor reads; no direct PostgreSQL product reads. |
| [Self-hosting overview](https://docs.formance.com/deploy/overview) | Community module and production topology boundary. |
| [Official Helm deployment](https://docs.formance.com/deploy/self-hosted/demo/quick-start) | Kubernetes packaging and versioned Stack resources. The bundled demo database is never production. |
| [Cloudflare Tunnel](https://developers.cloudflare.com/tunnel/) and [service tokens](https://developers.cloudflare.com/cloudflare-one/access-controls/service-credentials/service-tokens/) | Maintained private ingress and machine authentication for Convex-to-VPS traffic. |

Stripe, CDP, x402, Clerk, Convex and Australian sources from the previous plan
remain governing for their respective boundaries. Formance does not replace
Stripe SCA, CDP signing, x402 transport, Clerk authority or Australian advice.

## 4. What already exists and evidence established

The isolated spike reached `ADOPT` without changing the Package 4 worktree.

| Proof | Result |
| --- | --- |
| Official SDK in Node 22 and supported Convex Node runtime | Passed inside the bounded safe-integer range. |
| Named schema templates and strict schema enforcement | Passed. |
| Correct AUD buyer leg and separate USDC Provider leg | Passed. |
| Atomic contention | Exactly 10 of 100 contenders won capacity for 10; no partial bulk. |
| Idempotency and exact-reference recovery | Passed across response loss and process/service restart. |
| Pagination | 10,000 bookings traversed through native cursors. |
| PostgreSQL backup/restore | Official `pg_dump`/`pg_restore` plus Ledger migration preserved schema, balances, references and replay. |
| Upgrade | `v2.4.11 -> v2.4.12` rehearsal passed. |
| Diagnostics | Health/metrics passed; secret-shaped log scan was clean. |
| Original worktree | Manifest hash remained `1d00104ce935329732fd37a029be61152f14f189e9469ea7f93debd02461e12b`. |

Existing application seams are treated explicitly:

| Existing code or flow | Treatment |
| --- | --- |
| Package 3 `ConsequenceAuthorityBoundary` and Clerk proof | Reuse unchanged for authority-increasing financial controls. |
| Funding, Commitment, Invocation, attempt, idempotency and correlation identities | Reuse as the cross-system command and recovery identities. |
| `convex/moneyAccountFunding.ts` Stripe lifecycle | Preserve PaymentIntent/SCA/webhook behavior; replace its journal write with Formance booking. |
| `convex/moneyManagedCall.ts` and `moneyManagedCallLifecycle.ts` | Preserve proven ordering and recovery cases; replace financial mutation/projection work with named Formance transactions. |
| `convex/moneyJournal.ts`, `src/modules/money/internal/balanced-journal.ts` and four Package 4 journal/projection tables | Delete after the verified no-user cutover; do not port the implementation. |
| `convex/moneyReconciliation.ts` automated matcher/run state | Delete; retain only explicit command verification and operator-owned control-case semantics. |
| Existing CDP signer, x402 parser and possibly-submitted fence | Reuse directly; Formance does not sign or dispatch x402. |
| Existing Convex workpool and File Storage document path | Reuse for bounded snapshot/render jobs, never as financial authority. |
| Existing operator shell, tables, inline states and recovery hierarchy | Reuse; add timestamp/stale semantics without a new dashboard system. |

PR 0 must promote the spike evidence into this branch and rerun it against the
current BOM because the spike Gateway pin was older. The Ledger and SDK pins
remain the proved versions.

The official SDK tag is not currently published to npm. The spike produced a
content-addressed package from the signed upstream source release without
editing SDK code. Application adoption may use that artifact only after PR 0
reproduces its hash and records its upstream commit, license and build command.
It must be replaced by the official registry artifact when Formance publishes
the same release.

## 5. Repository patterns to reuse

| Requirement | Required repository pattern |
| --- | --- |
| Human authority | Package 3 `ConsequenceAuthorityBoundary`; no money-specific authority gateway. |
| Durable commands | Existing funding, Commitment, Invocation, attempt, idempotency and correlation identities. |
| External action order | Existing prepare mutation -> Node Action -> finalize/reconcile mutation pattern. |
| x402 safety | Existing possibly-submitted fence, official x402 parser and CDP signer. |
| Secrets | Existing deployment validation and secret lifecycle; no token in Convex rows, logs, DOM or fixtures. |
| Background work | Existing Convex workpool for documents and bounded control jobs; no new queue. |
| UI | Existing operator shell, tables, page states, inline status and recovery hierarchy. |
| Tests | Existing Vitest, Convex and Playwright infrastructure. No new framework. |
| Schema removal | Existing bounded Convex migration pattern: compatibility deployment, allowlisted cleanup, verification, strict removal deployment. |

The minimum new application seam is:

```text
convex/moneyFormanceActions.ts       Node-only internal/public Actions
src/modules/money/internal/formance/ official SDK client factory
                                      supported-range guard
                                      closed template calls
ops/formance/                         pinned upstream config + declarative overlays
```

Do not add a generic ledger port, repository, ORM, posting model, balance
calculator, projection engine, saga framework or provider connector framework.
Funding and managed Calls are the two real callers; they share only the SDK
client, reference rules and closed booking contract.

## 6. Authority and data ownership

| Fact | Authority | Convex may store |
| --- | --- | --- |
| Account AUD available/reserved balance | Formance | Last observed amount, observation time and Formance reference, explicitly non-authoritative. |
| Agent Principal budget capacity/consumption | Formance | Policy identity, window and observed snapshot only. |
| Legal-customer exposure capacity | Formance | Legal-customer binding and observed snapshot only. |
| Corporate USDC available/reserved capacity | Formance | Custody observation reference and observed snapshot only. |
| Provider payable/settled amount | Formance | Provider obligation domain state and Formance transaction references. |
| Funding command and Stripe PaymentIntent | Convex/Stripe | Command state, PaymentIntent reference, evidence digest and Formance settlement reference. |
| Commitment and Invocation | Convex | Complete domain state and material digests. |
| x402 submission and delivery | Convex/provider | Attempt, submission fence, payment/delivery evidence and Formance refs. |
| Journal transactions/postings/balances | Formance | References only; never copied as authoritative rows. |
| Daily close comparison | Human control using official sources | Frozen evidence refs/digests, reviewer, time, outcome and discrepancy case. |
| Tax/accounting document | AE frozen document snapshot | Formance source refs, policy/template versions, digest and rendered file. |

No source may infer success from another source's availability. A Formance
reservation does not prove x402 dispatch; an x402 settlement does not prove
valid delivery; a Convex Call does not prove a Formance booking.

## 7. Formance product-ledger contract

### 7.1 Pinned Community stack

Initial pins:

```text
Stack BOM          v3.2.10
Ledger             v2.4.12
Gateway            v2.3.1
TypeScript SDK     v7.0.0 signed-source artifact
PostgreSQL         16
Node               22
```

All container images are pinned by digest. Experimental flags, automatic
upgrades, direct service exposure and Ledger v3 alpha are disabled.

Only Gateway, Ledger API, Ledger worker and PostgreSQL run. Payments, Auth,
Wallets, Flows, Reconciliation, Webhooks, Console and Search do not run.

### 7.2 Strict schema and account families

Install one immutable schema version before accepting a write. Dynamic path
segments are canonical SHA-256-shaped digests, not user labels or PII.

Approved families include:

```text
ae:account:<accountDigest>:aud:available
ae:account:<accountDigest>:aud:reserved
ae:agent:<principalDigest>:aud:budget:available
ae:agent:<principalDigest>:aud:budget:reserved
ae:legal-customer:<customerDigest>:aud:exposure:available
ae:legal-customer:<customerDigest>:aud:exposure:reserved
ae:processor:<processorDigest>:aud:clearing
ae:revenue:aud:sales
ae:tax:aud:gst
ae:treasury:<poolDigest>:usdc:available
ae:treasury:<poolDigest>:usdc:reserved
ae:provider:<providerDigest>:usdc:payable
ae:provider:<providerDigest>:usdc:settled
ae:call:<callDigest>:aud:reserved
ae:call:<callDigest>:usdc:committed
ae:control:<controlDigest>:<asset>
```

The schema refuses unknown families, assets, malformed digests, free-form
accounts and unsupported exponents. `AUD/6` is the internal customer/pricing
asset. USDC uses the official network exponent.

### 7.3 Named Numscript templates

Only immutable named templates are callable:

- `FUNDING_SETTLED`
- `FUNDING_REVERSED`
- `CALL_RESERVED_AUD`
- `CALL_RESERVED_USDC`
- `CALL_RELEASED_AUD`
- `CALL_RELEASED_USDC`
- `BUYER_SALE_SETTLED`
- `BUYER_ADJUSTED`
- `TREASURY_CAPACITY_SYNCED`
- `PROVIDER_OBLIGATION_ACCRUED`
- `PROVIDER_SETTLED`
- `PROVIDER_REVERSED`

The AUD reservation covers Account funds, Agent Principal budget and
legal-customer exposure. The USDC reservation covers corporate treasury and
the pending Provider obligation. Both transactions are submitted in one
native atomic bulk request.

Buyer AUD never flows directly into a Provider AUD payable. One immutable Call
reference and closed metadata digest link the AUD sale and USDC cost.

### 7.4 Request policy

Every write uses:

- exact schema version;
- named template;
- stable Formance transaction reference derived from the existing command;
- stable idempotency key;
- canonical fixed-string variables;
- closed digest-only metadata;
- stable `machine` interpreter;
- `force` absent;
- SDK automatic write retry disabled.

Free-form Numscript, direct posting payloads, raw HTTP, `rawResponse`, response
interceptors, custom JSON parsing, direct PostgreSQL product reads and error-
message parsing are forbidden.

### 7.5 Exactness envelope

The official SDK currently decodes amounts through JavaScript `number`.
Therefore the integration must:

1. accept only canonical integer strings at AE boundaries;
2. prove `Number.isSafeInteger` before SDK submission and after every monetary
   SDK response;
3. convert a safe SDK integer immediately back to its canonical string;
4. refuse zero where a positive amount is required, negatives, decimals,
   exponent drift and values above `9,007,199,254,740,991` units;
5. observe shared-account cumulative volumes through official SDK reads;
6. suspend new financial entry and open a vendor/architecture review at A$1
   billion cumulative six-decimal flow through any shared account.

Do not shard accounts merely to postpone the SDK limit. Remove the restriction
only after an official installable SDK supports exact strings or bigint and
passes the committed spike matrix unchanged.

### 7.6 Formance Payments decision

Payments Community Edition is not part of initial Package 4. Its Generic
Connector requires AE-owned provider middleware, while Formance lists
maintained prebuilt Stripe/digital-asset connectors outside the selected OSS
scope. Running the service without a fitting connector adds PostgreSQL,
Temporal and operational burden without replacing a responsibility.

A later ADR may admit Payments only when a maintained Community connector:

- supports the exact provider and required lifecycle;
- removes existing AE integration code rather than duplicating it;
- preserves existing Stripe SCA or CDP/x402 authority;
- passes exactness, idempotency, recovery and secret-redaction tests; and
- introduces no Generic Connector middleware.

That ADR is not a Package 4 completion dependency.

## 8. Public product contracts retained

The previous Package 4 machine contract remains authoritative:

- `pricing:v3` only;
- compact `registry.operations.search` with one to three candidates;
- authenticated `operation.inspect({ operationRef, input })`;
- an expiring caller-bound Commitment;
- `operation.invoke({ commitmentRef, idempotencyKey })`;
- closed results: `completed | pending | refused | outcome_unknown`;
- at most one machine continuation and one optional owner handoff;
- version-aware status with `afterVersion`;
- no invoke continuation after possible dispatch.

A managed-x402 Commitment binds:

- Account and Agent Principal;
- Operation reference and revision;
- normalized-input digest;
- authority and policy generations;
- live x402 requirement digest;
- executable FX evidence;
- exact AUD and USDC units;
- Account, Agent, legal-exposure and treasury ceilings;
- Formance schema/template versions;
- expiry and status-readback reference.

Public inspection exposes buyer authority, price, budget, balance, readiness,
material unknowns and expiry. It never exposes treasury balances, account paths
or Formance infrastructure details.

## 9. Cross-system transaction protocol

No distributed transaction is claimed. Existing durable command state plus
Formance reference/idempotency provide deterministic convergence.

### 9.1 Funding

```text
Convex prepare mutation
  resolve Account + policy + command identity

Action
  create/reuse Stripe PaymentIntent through the official Stripe SDK
  wait for verified Stripe settlement observation

Convex mutation
  mark command ready_to_book

Node Action
  call FUNDING_SETTLED through official Formance SDK
  stable reference + idempotency

Convex finalize mutation
  attach Formance transaction reference
  mark funding settled
  refresh display-only Account snapshot
```

Response loss recovers by exact Formance reference. A conflicting request under
the same identity refuses. Stripe reversal posts `FUNDING_REVERSED`; prior
records are never edited.

### 9.2 Inspection

```text
resolve Operation + authority + policy in Convex
read live Account/Agent/exposure/treasury capacity from Formance
inspect live x402 requirement with official package
obtain executable FX evidence
persist one expiring Commitment in Convex
```

No Commitment is issued from a stale display snapshot.

### 9.3 Invocation and reservation

```text
Convex prepare mutation
  revalidate caller + Commitment + Operation + authority + policy
  admit/replay Invocation and create durable Formance bulk reference

Node Action
  re-read required Formance balances
  submit atomic=true, parallel=false, continueOnFailure=false
    CALL_RESERVED_AUD
    CALL_RESERVED_USDC

Convex reservation-finalize mutation
  attach exact Formance transaction references
  mark Invocation reserved

Convex mutation
  persist possibly-submitted x402 fence

Action
  sign with official CDP SDK
  perform official x402 paid retry

Actions + mutations
  completed: settle buyer sale and Provider cost, then close Call
  proven pre-submit failure: release both reservations
  possible submission: retain reservations and return outcome_unknown
```

The reservation winner set is decided by Formance. Convex never precomputes a
financial winner from cached balances.

### 9.4 Recovery

| State | Recovery authority | Permitted action |
| --- | --- | --- |
| No Formance reference prepared | Convex command state | Submit once. |
| Request may have reached Formance | Exact Formance reference | Read before any retry. |
| Same reference and same digest exists | Formance transaction | Finalize Convex idempotently. |
| Reference absent and no submission is proven | Convex command | Resubmit same command identity. |
| x402 may have been submitted | Invocation/attempt/provider readback | Status or reconciliation only. |
| Formance unavailable | Last health observation | Fail new financial entry; show stale UI snapshot. |

Error text and metadata searches are never recovery authority.

## 10. Stability, deployment and operations

### 10.1 Environment progression

```text
local + deterministic CI
  pinned official images, disposable named volumes, loopback only

synthetic shared/VPS pilot
  pinned containers, persistent volumes, Cloudflare Tunnel + Access
  fixture balances only, production funding/mainnet disabled

real-money activation
  managed PostgreSQL 16 with PITR
  Formance services deployed from reviewed official Helm resources
  private Gateway ingress through Cloudflare Access
  backups, restore proof, monitoring, policy approvals and on-call runbooks
```

A single VPS may run lightweight Kubernetes such as k3s for the official Helm
deployment; PostgreSQL is not co-located once real value is admitted. Docker
Compose remains development/synthetic-pilot tooling, not the real-money
topology.

### 10.2 Network and secrets

- Gateway binds only to the private service network.
- `cloudflared` creates outbound-only connectivity; no Ledger/Gateway/Postgres
  inbound port is opened.
- Cloudflare Access uses one service token per environment.
- Client ID/secret live in deployment secret configuration, never Convex data.
- Rotation uses an overlap window, verifies the successor, then revokes the
  predecessor through the maintained Cloudflare control plane.
- Tailscale may protect SSH/operator access; application traffic does not
  depend on an operator device or tailnet client.
- Logs retain correlation and Formance references but redact authorization,
  service-token, Stripe, wallet and x402 payment material.

### 10.3 Availability behavior

- Formance health failure stops funding booking, Commitment issuance and new
  reservation.
- Search, Operation detail, existing Invocation status and support references
  remain available.
- Owner financial views show their last official observation with a `stale`
  timestamp; stale snapshots cannot authorize writes.
- Existing policy suspension provides the operator kill switch. Do not add a
  general circuit-breaker framework.
- Recovery workers continue exact-reference readback after entry is suspended.

### 10.4 Backup and recovery objectives

| Stage | Required control |
| --- | --- |
| Synthetic VPS pilot | Encrypted nightly off-site backup, seven-day retention and successful restore drill before acceptance. |
| Before real money | Managed PostgreSQL PITR, RPO <=5 minutes, RTO <=60 minutes, automated backup verification and successful activation restore rehearsal. |
| Ongoing real money | Daily backup status check, monthly restore drill and recorded evidence. |

Failed backup verification or an overdue restore drill suspends new financial
entry but leaves readback and recovery available.

### 10.5 OSS reconciliation control

Every completed financial command verifies its own exact Formance reference
against its Stripe/CDP/x402 evidence. This is command closure, not dataset
reconciliation.

Once per activity day, an owner performs a signed close:

1. freeze official Formance transaction/volume references for the period;
2. obtain official Stripe and custody/x402 readback or export evidence;
3. compare opening, movements, closing and unresolved references using an
   approved worksheet/runbook outside product code;
4. record source digests, covered interval, reviewer, time and outcome in AE;
5. open one scope-limited discrepancy case for each unresolved difference;
6. block only the affected Account, legal customer, treasury pool or Provider
   obligation until resolved.

AE may collect official evidence and store the signed result. It must not add
matching rules, fuzzy association, drift scoring, balance reconstruction or an
automated reconciliation engine.

## 11. Destructive no-user cutover

### 11.1 Worktree gate

1. Confirm the real Git index is empty.
2. Capture the complete dirty manifest and preserve unrelated user-owned files.
3. Stage only reviewed Package 4 files or exact hunks; never `git add -A`.
4. Inspect cached diff, statistics and whitespace before each commit.
5. Reproduce each candidate commit in a clean worktree and run its gate.
6. Do not stash, reset, clean, discard or reformat the current dirty tree.

### 11.2 Data gate

Before removing any Convex financial table:

- bind the operation to the exact deployment/environment fingerprint;
- export a disposable Convex backup and Formance backup;
- census all customer balances, journal entries, projections, PaymentIntents,
  Provider obligations and unsettled x402 attempts;
- re-read the census immediately before cleanup;
- stop if any user-owned or value-bearing row exists;
- require typed confirmation naming the deployment and exact table allowlist;
- use a bounded resumable internal migration following the existing Convex
  migration pattern.

### 11.3 Two-deployment removal

```text
Deployment A
  disable financial entry
  deploy Formance-backed readers/writers but keep them inactive
  run bounded allowlisted cleanup of verified-empty retired tables
  prove every retired table is empty

Deployment B
  remove retired schema, cleanup function and custom ledger runtime
  regenerate Convex output
  activate Formance-backed sandbox funding and Calls
```

Remove at minimum the custom Package 4 journal accounts, transactions,
postings, balance projections and reconciliation-run storage plus superseded
legacy money tables identified by the source/schema census. Preserve only
domain command/evidence rows whose semantics remain valid and whose amounts are
not treated as authority.

No cleanup function, compatibility validator, fallback read or dual-write flag
remains after Deployment B.

## 12. Atomic delivery sequence

Every PR is reviewable and deployable. The next PR does not begin until the
current clean-worktree, behavioral and environment gate passes.

### PR 0 — `test(formance): promote and requalify the Community stack`

**Entry:** spike branch ends at `15b1b2e99`; current Package 4 worktree remains
unchanged.

**Files/ownership:** `.planning/spikes/001-formance-ledger-package4/**`,
`ops/formance/**`, isolated Formance test package and CI fixture only.

**Build:**

- Promote the spike evidence and scripts without importing its disposable
  runtime state or secrets.
- Pin Stack `v3.2.10`, Ledger `v2.4.12`, Gateway `v2.3.1`, PostgreSQL 16 and all
  image digests.
- Reproduce the signed-source SDK `v7.0.0` artifact and hash; record SBOM,
  license and upstream commit.
- Rerun exactness, named bookings, atomic contention, reference recovery,
  10,000-item pagination, restart, backup/restore and upgrade matrices.
- Add local/CI lifecycle commands that start and clean only named Package 4
  services and volumes.

**Do not:** add an app dependency, deploy Payments, enable experimental flags,
use Ledger v3 alpha or expose Gateway beyond loopback.

**Gate:** all spike proofs pass against the new Gateway/BOM; the app and root
dependency graph are unchanged; diagnostics remain secret-safe.

**Rollback:** delete only the named disposable stack and volumes. Retain the
evidence report.

### PR 1 — `feat(money): establish commercial and activation policy`

**Entry:** PR 0 passes; production money remains disabled.

**Files/ownership:** existing money commercial policy, Package 3 consequence
authority, deployment validation and operator policy UI.

**Build:**

- Complete effective-dated commercial-perimeter, tax, accounting/client-money,
  privacy/retention, treasury/custody and operations approval families.
- Add Formance environment, schema, supported-range, backup, restore and daily-
  close controls to the production admission decision.
- Bind activation, replacement and emergency suspension to strict Package 3
  consequence authority.
- Keep one explicit sandbox fixture; production has no fallback approval.

**Do not:** create a legal rules engine, claim approvals prove compliance or
store advice/identity documents in ordinary rows.

**Gate:** missing, expired, superseded, environment-mismatched or operationally
failed controls refuse before Stripe, Formance, CDP or x402 I/O.

**Rollback:** suspend the policy set. No financial state is rewritten.

### PR 2 — `feat(money): install the Formance authority boundary`

**Entry:** PR 1 deployed; PR 0 evidence current.

**Files/ownership:** `ops/formance/**`, root dependency/lockfile,
`convex/moneyFormanceActions.ts`, `src/modules/money/internal/formance/**`,
deployment manifest tests.

**Build:**

- Add the content-addressed official SDK artifact and no other financial
  framework.
- Add one Node-only SDK client factory with explicit timeouts and automatic
  write retries disabled.
- Add the supported-range guard, closed metadata validator and named booking
  functions.
- Install the immutable strict schema and templates through official APIs.
- Add health, schema/template digest, exact-reference and balance-read actions.
- Add Cloudflare Access headers from environment configuration; redact them
  before any error crosses the action boundary.
- Keep the boundary inert behind the existing sandbox activation policy.

**Delete/avoid:** no generic repository, ledger interface hierarchy, custom
HTTP, parser, posting types, retry engine or database access.

**Gate:** official SDK bundles in Convex Node runtime; source/import boundary
tests prevent browser or non-Node imports; every schema/template mismatch fails
closed; Cloudflare token rotation and revocation tests pass in staging.

**Rollback:** deactivate Formance policy and remove the inert SDK boundary. No
Convex money path has changed yet.

### PR 3 — `refactor(money): cut funding and balances over to Formance`

**Entry:** PR 2 is healthy; no-user census and typed cleanup approval pass.

**Files/ownership:** money schema, funding commands, Stripe observation,
Account balance reads, owner funding UI and targeted tests.

**Build:**

- Execute Deployment A cleanup and Deployment B strict schema removal.
- Replace Account-targeted funding settlement with `FUNDING_SETTLED` and
  reversal with `FUNDING_REVERSED`.
- Preserve Stripe PaymentIntent reuse, hosted SCA, webhook verification,
  duplicate/conflicting observation behavior and durable readback.
- Credit requested principal exactly; book fee, tax and total payment as
  distinct commercial facts.
- Read authoritative balance from Formance for consequence paths.
- Add timestamped display snapshots refreshed only from official SDK reads.
- Remove the custom Convex journal, postings, balances and funding projection
  paths in the same cutover.

**Do not:** retain read fallback, write both systems, reconstruct Formance from
Stripe or use a display snapshot for admission.

**Gate:** duplicate, reordered and conflicting Stripe observations cannot
double-book; settled principal is exact; reference-loss recovery is
idempotent; source/generated-code searches prove retired funding authority is
gone.

**Rollback:** before the first Formance value, restore the verified backup and
redeploy. After any Formance booking, fix forward; never recreate the Convex
ledger.

### PR 4 — `feat(money): move budgets, exposure and treasury to Formance`

**Entry:** Account funding and reads are Formance-authoritative.

**Files/ownership:** money policy/pricing, Agent Principal budget commands,
legal-customer binding, treasury observation, CDP adapter and owner reads.

**Build:**

- Represent Agent budget and legal-customer exposure as Formance scarcity
  accounts tied to durable Principal/customer digests.
- Refuse legal-customer rebinding while Formance shows balance/reservation or a
  Convex Call remains pending.
- Sync corporate USDC custody observations through
  `TREASURY_CAPACITY_SYNCED`; external custody is evidence, not a second AE
  balance.
- Keep deterministic sandbox FX and production `setup_required` until an
  approved executable-rate source exists.
- Move margin, fee, tax and buffer values into versioned policy data.
- Add operator-only authoritative refresh and display snapshots without
  exposing wallet details.

**Do not:** build a wallet, exchange, replenishment system, raw RPC client,
custom signer or multiple treasury pools.

**Gate:** two credentials share the same Principal budget; stale custody/rate
evidence refuses; no limit increase bypasses Package 3 proof; safe-integer and
A$1B trigger tests pass.

**Rollback:** suspend new Commitment issuance. Existing Formance capacity
records remain immutable.

### PR 5 — `feat(operations): issue Formance-backed Commitments`

**Entry:** all financial capacities have one Formance authority.

**Files/ownership:** pricing v3, compact registry projection, inspection,
Commitment, shared protocol descriptors and generated HTTP/MCP/CLI/chat output.

**Build:**

- Delete `pricing:v2`; retain only `pricing:v3`.
- Keep search at one to three compact candidates.
- Resolve caller, Operation, authority and policy in Convex; read Account,
  Agent, exposure and treasury capacity live from Formance.
- Inspect the live x402 requirement with official packages and bind its digest,
  FX evidence and Formance schema/template versions into the Commitment.
- Keep corporate treasury amounts out of public responses.
- Preserve Commitment-only invocation and version-aware status.

**Do not:** issue from cached snapshots, repeat schemas/navigation, expose
Formance account paths or add arbitrary response detail modes.

**Gate:** caller/input/revision/authority/policy/challenge/price/capacity drift
refuses; search <=3 KB, inspect <=4 KB, unchanged status <=512 bytes and
refusal/uncertainty <=1 KB; all protocol surfaces remain descriptor-identical.

**Rollback:** disable Commitment issuance. Funding readback remains available.

### PR 6 — `feat(calls): activate atomic Formance managed-x402 execution`

**Entry:** PR 5 Commitments are deployed; sandbox dispatch remains explicitly
disabled until the PR gate passes.

**Files/ownership:** capability-execution managed-call coordinator, Formance
booking calls, x402/CDP action, Invocation recovery and Call evidence.

**Build:**

- Implement the prepare -> Formance atomic bulk -> finalize protocol in
  section 9.
- Revalidate all material Commitment facts before submission.
- Reserve AUD and USDC legs in one atomic bulk.
- Persist the x402 possibly-submitted fence before CDP signing.
- Settle buyer sale and Provider obligation only from validated observations.
- Release only after proven pre-submit failure.
- Preserve reservations and return `outcome_unknown` after possible dispatch.
- Remove superseded external-spend, brokered-charge and custom managed-call
  monetary paths when behavioral parity passes.

**Do not:** calculate a winner in Convex, retry Formance writes blindly, sign
before the fence, or offer invoke after possible dispatch.

**Gate:** deterministic sandbox `search -> inspect -> invoke` completes; 100
contenders for 10 units produce exactly 10 winners; every crash fence recovers
by reference; no partial bulk, overspend, signature leakage or duplicate
Provider obligation occurs.

**Rollback:** disable new dispatch; keep status/recovery workers deployed until
every prepared, reserved, pending or unknown Invocation closes.

### PR 7 — `feat(calls): complete Calls, Usage and Spend reads`

**Entry:** managed Calls settle and recover in sandbox.

**Files/ownership:** existing Call projection, Account/Agent read APIs, owner
activity routes and display snapshot refresh.

**Build:**

- Keep Convex Call state as product/delivery evidence with native Account and
  Agent cursor pagination.
- Read financial amounts and period movement from Formance filters/cursors.
- Store only timestamped display snapshots in Convex; mark them stale after
  the configured freshness interval.
- Keep non-monetary Usage as exact integer domain facts linked to Call.
- Present Calls, Usage and Spend separately with shared Invocation, Call and
  Formance references.
- Show buyer price, Provider, Agent, status, latency, delivery, payment and
  recovery without treasury internals.

**Delete:** Convex money/spend projection rebuilds, global history scans and
activity fanout that infers financial state.

**Gate:** 10,000 Calls and 10,000 Formance bookings paginate without global
collect/filter; cross-Account reads return nothing; stale snapshots cannot
authorize actions; zero/max/overflow boundaries are covered.

**Rollback:** hide new read surfaces; retain immutable Calls and Formance
transactions.

### PR 8 — `feat(finance): add documents, signed close and Provider closure`

**Entry:** Call and financial reference contracts are stable.

**Files/ownership:** existing money documents/workpool, Provider obligation
domain records, daily-close evidence/cases and owner finance UI.

**Build:**

- Freeze document snapshots from official Formance cursor reads plus immutable
  Call/funding references.
- Carry canonical integer strings through workpool checkpoints; round once at
  document boundary and book any required residual through a named adjustment
  template.
- Render printable HTML and safe CSV; store digest, template version, policy
  version and Formance source range in Convex File Storage metadata.
- Complete Provider obligation states while treating Formance payable/settled
  balances as authority.
- Permanently exclude x402-settled obligations from payout.
- Implement exact-command closure and the human-signed daily-close workflow in
  section 10.5.
- Corrections append Formance adjustments and new documents; prior artifacts
  remain immutable.

**Delete:** the custom automated reconciliation runner, money matching rules,
balance reconstruction and reconciliation projections. Replace ambiguous
`moneyReconciliationRuns` naming with explicit close evidence/control cases.

**Gate:** interrupted document jobs resume without duplicate files/bookings;
every document amount traces to Formance references; an orphan file is removed
when metadata persistence fails; duplicate Provider settlement never creates
payout eligibility; discrepancy cases lock only their scope.

**Rollback:** stop new document/close jobs; preserve Formance and issued
artifacts. Continue exact command recovery.

### PR 9 — `chore(package4): prove release journeys and operating controls`

**Entry:** PRs 0–8 are deployed to sandbox; no unresolved financial command or
control case exists.

**Files/ownership:** existing release/e2e suites, runbooks, deployment
manifests, secret scans and Package 4 documentation.

**Run and prove:**

1. Account funding with SCA, duplicate webhook and reversal.
2. Cheapest viable `search -> inspect -> invoke -> completed` journey.
3. Insufficient balance/authority/capacity with no Formance reservation or
   Provider effect.
4. Material drift with one bound reinspection.
5. Post-submission uncertainty, restart and status-based recovery.
6. Owner Call -> Usage/Spend -> document -> signed close journey.
7. HTTP, MCP, CLI and HTTPS chat parity from shared descriptors.
8. Cloudflare token rotation/revocation and direct-origin reachability denial.
9. Ledger/Gateway/worker restart and PostgreSQL restore rehearsal.
10. Deterministic CI sandbox and separately reported Base Sepolia canary.
11. Source/log/DOM/snapshot/fixture scan for service tokens, Stripe secrets,
    wallet material, x402 signatures and unrestricted Provider payloads.
12. Removal of all cleanup, migration, bypass, debug and baseline artifacts.

**Runbooks:** Formance unavailable, stale snapshot, response lost after Ledger
write, unknown x402 payment, low treasury, Account lock, custody mismatch,
processor reversal, document failure, failed daily close, backup failure and
safe SDK-range trigger.

**Gate:** all deterministic and authenticated journeys pass; required external
canary is reported rather than skipped; synthetic VPS restore meets its target;
production remains disabled until the real-money activation controls pass.

**Rollback:** suspend all new financial entry; retain Formance, status,
readback, documents and recovery workers.

## 13. Test and failure-coverage plan

```text
CODE PATHS                                      USER / MACHINE JOURNEYS
[PR0] Official stack and SDK                    [PR3] Account funding
  exactness + schema + bulk + recovery             SCA + replay + reversal

[PR2] Formance Action boundary                 [PR5] search -> inspect
  imports + timeouts + redaction                  live capacity + Commitment

[PR3-4] Funding/capacity bookings              [PR6] inspect -> invoke
  idempotency + scarcity + range                  completed + refused + unknown

[PR6] Reservation/submission fences            [PR7] owner evidence
  contention + every crash point                  Calls + Usage + Spend

[PR8] Documents + control close                [PR9] restart + recovery
  resume + traceability + scope locks             status + signed daily close
```

Required invariant suites:

- canonical integer strings, safe-integer boundaries and A$1B trigger;
- schema version, template name, account family, asset and metadata refusal;
- duplicate and conflicting reference/idempotency behavior;
- atomic AUD/USDC bulk and exact contention winner sets;
- Agent Principal budget shared across credentials;
- legal-customer and treasury shared scarcity;
- Commitment expiry, caller binding and material drift;
- prepare/Formance/finalize crash matrix;
- submission fence before signing;
- settlement versus delivery separation;
- native cursor pagination and Account isolation;
- display snapshot staleness and non-authority;
- document traceability, residual adjustment and immutability;
- Provider no-double-pay;
- backup/restore and upgrade preservation;
- Cloudflare token rotation/direct-origin denial;
- secret and diagnostic redaction.

No test may mock both AE and Formance sides of the same integration assertion.
Pure domain tests may mock the SDK boundary. Monetary idempotency, contention,
reference recovery, schema enforcement and pagination require the real pinned
Formance stack.

## 14. Performance and operating budgets

| Path | Budget / proof |
| --- | --- |
| Formance reserve/readback | Warm local p95 <= max(2x recorded Convex baseline, 150 ms) in the deterministic fixture. |
| Inspection | Existing <=4 KB response budget; record p50/p95 Formance contribution separately. |
| Status unchanged | <=512 bytes and no unnecessary financial refresh. |
| Formance pagination | Native cursor only; bounded page size; 10,000-booking proof retained. |
| Convex Call pagination | Native Account/Agent indexes; bounded rows and serialized bytes. |
| Display snapshot | One official read per explicit refresh or bounded freshness window; never per rendered component. |
| Contention | Report p50/p95, conflict/refusal counts and exact winner set; do not shard before evidence. |
| Safe-integer headroom | Alert at policy thresholds; mandatory architecture stop at A$1B shared-account cumulative flow. |

Do not add a cache framework, batch abstraction or sharding topology solely to
improve synthetic benchmarks.

## 15. Failure containment and rollback

| Failure | Containment | User/operator outcome |
| --- | --- | --- |
| Formance unavailable | Stop new financial entry only | Stale timestamped snapshot, status/support reference. |
| Cloudflare token expired/revoked | Same as Formance unavailable | Rotate maintained token; no fallback endpoint. |
| Schema/template drift | Refuse before write | Operator setup-required state. |
| SDK unsafe integer | Refuse before use/write | Range escalation; no rounded value. |
| Formance response lost | Exact transaction-reference readback | Idempotent finalize or outcome unknown. |
| Convex finalize fails | Formance remains authoritative | Recovery worker attaches existing reference. |
| Terms drift before reserve | No Formance write | One bound reinspection. |
| Contention loser | Native scarcity refusal | No x402 signature/effect. |
| Possible x402 submission | Retain reservations | Status/reconciliation only. |
| Stale UI snapshot | Mark stale; prohibit admission | Refresh authoritative source. |
| Failed daily close | Lock affected scope | Other Accounts/Operations remain available. |
| Backup/restore control failure | Suspend new financial entry | Readback and recovery remain available. |
| Document failure | Resume from checkpoint; remove orphan file | No duplicate document or booking. |

Before the first Formance transaction, the schema deployment may be rolled
back. After Formance contains value, financial changes are fix-forward and
transactions are never rewritten. After possible Provider submission,
recovery workers remain deployed until closure regardless of policy suspension.

## 16. Sequential dependencies and blast radius

```text
PR0 evidence/BOM
  -> PR1 policy
  -> PR2 inert Formance boundary
  -> PR3 funding cutover
  -> PR4 capacity/treasury
  -> PR5 inspection/Commitment
  -> PR6 managed Call
  -> PR7 reads
  -> PR8 documents/control close
  -> PR9 release proof
```

Implementation is sequential through PR 6 because schema, authority and
command contracts overlap. After PR 6 freezes Call/Formance references, PR 7
and PR 8 may be developed independently only if they own disjoint files and
neither changes the booking contract. The current dirty worktree makes the
default sequential.

## 17. Package completion criteria

| Package area | Closed when |
| --- | --- |
| 4A — commercial policy | Sandbox is explicit; production effects require current Australian and operating approvals. |
| 4B — Account AUD | Funding, reserve, sale, release, reversal and adjustment exist only as immutable Formance transactions. |
| 4C — pricing/Commitment | Inspection binds live Formance capacity, x402 terms, FX and authority into one expiring Commitment. |
| 4D — managed Call | Native atomic bulk decides scarcity; the official x402 path completes or recovers without blind retry. |
| 4E — treasury/Provider | Corporate USDC and Provider cost remain separate from buyer AUD and cannot be paid twice. |
| 4F — Calls/Usage/Spend | Account-isolated product evidence and official financial reads share durable references and bounded pagination. |
| 4G — documents/control | Documents trace to Formance; exact command checks and signed daily close surface scope-limited discrepancies. |
| 4H — operations | Docker/CI, synthetic VPS, secure ingress, backup/restore, outage and release journeys are proven. |
| System | Convex contains no second monetary authority and retired custom ledger/reconciliation paths are absent. |

Sandbox Package 4 is closed when the deterministic managed purchase and signed
close pass. Real-money activation is a separate gate requiring managed
PostgreSQL, Cloudflare service authentication, recovery objectives, Australian
approvals and a successful external canary. It does not require Enterprise
Formance.

## 18. NOT in scope and explicit prohibitions

Do not:

- implement a custom ledger, posting store, balance projection, money
  idempotency layer, reconciliation matcher, provider connector or workflow
  engine;
- deploy Formance Enterprise modules in Package 4;
- deploy Payments without a maintained Community connector that removes an
  existing integration;
- build a Generic Connector adapter for Stripe, CDP or x402;
- use Ledger v3 alpha, experimental Numscript or `force=true`;
- use raw Formance HTTP, custom parsing, `rawResponse`, interceptors, a forked
  SDK or direct PostgreSQL product reads;
- trust Formance amounts outside the supported safe-integer envelope;
- use Convex display snapshots for admission, reservation or settlement;
- maintain compatibility tables, dual writes, fallback reads or synthetic
  financial history;
- retry after possible Formance or x402 submission without exact-reference
  readback;
- expose Gateway, Ledger or PostgreSQL directly to the Internet;
- store Cloudflare, Stripe, CDP, wallet or x402 secrets in Convex rows;
- build customer wallets, crypto balances, cash-out, transfers, postpaid
  credit, treasury trading or automated replenishment;
- build a general ledger, tax engine or historical acquisition reconstruction;
- claim that Formance or the daily-close workflow establishes Australian legal
  compliance;
- edit generated Convex files manually;
- begin the next PR before the current clean-worktree and deployment gates pass;
- overwrite or reformat unrelated Package 2/3 or root-document work.

## 19. Implementation tasks

- [ ] **T0 (P0)** — Promote and requalify spike evidence against Stack v3.2.10/Gateway v2.3.1.
- [ ] **T1 (P1)** — Complete commercial and operating activation policy.
- [ ] **T2 (P1)** — Add the inert official-SDK Formance boundary and strict schema/templates.
- [ ] **T3 (P1)** — Perform the verified no-user funding/balance cutover and remove custom Convex financial authority.
- [ ] **T4 (P1)** — Move Agent budget, legal exposure and treasury capacity to Formance.
- [ ] **T5 (P1)** — Issue live-capacity-bound Commitments across shared protocol descriptors.
- [ ] **T6 (P1)** — Activate atomic managed-x402 reservation, dispatch and reference recovery.
- [ ] **T7 (P1)** — Complete Calls, Usage and Spend reads with display-only snapshots.
- [ ] **T8 (P1)** — Complete documents, Provider closure and signed daily-close controls.
- [ ] **T9 (P1)** — Pass deterministic, authenticated, VPS-recovery and external release journeys.

Final commands:

```text
npm run lint
npm run typecheck
npm run check:convex-codegen
npm run test:imports
npm run test:ui-contract
focused Package 4 Vitest and real-Formance suites
npm run test:e2e:authenticated:required
deterministic managed-Call integration journey
repository source/log/DOM/snapshot/fixture secret scan
npm run build
external sandbox canary reported separately
```

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
| --- | --- | --- | ---: | --- | --- |
| CEO Review | `/plan-ceo-review` | Scope and strategy | 1 | CLEAR (HOLD SCOPE) | Formance decision validated; 0 critical gaps, 3 execution watchpoints. |
| Codex Review | `/codex review` | Independent second opinion | 0 | SKIPPED | Running under Codex; nested Codex review avoided. |
| Eng Review | `/plan-eng-review` | Architecture and tests | 1 | CLEAR (PLAN) | 12 issues resolved, 0 critical gaps, full-review mode. |
| Design Review | `/plan-design-review` | UI/UX gaps | 0 | NOT RUN | Existing Package 4 UI and recovery contract retained. |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | NOT RUN | No new public developer workflow beyond existing descriptors. |

**VERDICT:** CEO + ENG CLEARED — ready for sequential implementation.

NO UNRESOLVED DECISIONS
