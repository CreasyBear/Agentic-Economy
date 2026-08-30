# Operation onboarding patterns: what mature systems actually prove

**Evidence date:** 2026-08-30  
**Product authority:** [`PRODUCT.md`](../../PRODUCT.md)  
**Scope:** Primary-source study of supplier and callable-unit onboarding, admission, permissions, readiness, canaries, idempotency, revision promotion, and revocation. This report recommends mechanisms for Agentic Economy's canonical Operation market; it does not propose a general app store, agent runtime, deployment platform, or procurement workflow.

## Decision

The simplest system that makes Agentic Economy useful now is not a Stripe-style supplier onboarding programme or a Shopify-style review organisation. It is a small, revision-bound evidence pipeline for one narrow Operation lane:

```text
lower-authority source row
  -> immutable candidate revision
  -> deterministic static admission
  -> published but unavailable
  -> GET-only, non-paying gate observation
  -> one separately authorized paid output + idempotency canary
  -> routeable exact revision
  -> continuous readiness removal / explicit deprecation or withdrawal
```

Borrow:

- **Kubernetes:** separate admission from readiness; a failed readiness observation removes traffic without deleting identity.
- **MCP Registry:** prove namespace ownership, publish exact versions, and retain explicit `active` / `deprecated` / `deleted` lifecycle state.
- **Stripe/Slack/Shopify:** declare least-privilege access and explain why it is needed; automated checks do not replace functional review where effects or data use are consequential.
- **MCP tools:** use a compact effect vocabulary, but treat supplier annotations as untrusted claims.
- **Argo Rollouts:** canary and promote one exact revision; failed analysis aborts promotion rather than blessing a family or provider.
- **Stripe Connect:** requirements belong to the capability being enabled and can become due again later.

Do **not** borrow their organizational weight. AE needs an Operation evidence machine first. Provider-wide accreditation, universal manual review, complex progressive traffic splitting, and general-purpose capability/account administration would delay the only product loop that matters: search -> compare -> inspect -> controlled call -> usable result.

## Comparison

| System | Exact mechanism | Evidence it establishes | What AE should reuse | What AE must reject |
|---|---|---|---|---|
| Stripe Connect | Requested capabilities generate capability-specific requirements; a capability must be active; requirements and status can change later | The connected account currently satisfies Stripe's requirements for that payment capability | Requirements as named predicates; `currently_due` remediation; capability status independent of account existence | KYC completion as proof that an Operation is safe, live, useful, or output-conformant |
| Stripe Apps | Versioned manifest declares object/event permissions and third-party URLs; each permission has a purpose; sandbox test and review precede publication | The reviewed app version requested disclosed access and passed a bounded marketplace review | Per-revision access manifest, purpose per permission, test fixture/instructions, destructive-action confirmation | Provider-wide review as permanent approval; app install scopes as a substitute for call-time buyer authority |
| Shopify App Store | Automated checks plus production-ready functional review; necessary scopes only; testing instructions and credentials; ongoing requirements | A reviewable production build implements the claimed feature under the submitted permissions | Automated-vs-human gate split; structured review evidence for consequential/authenticated lanes | Manual review of every public read Operation; UI/store-quality rules unrelated to a bounded callable contribution |
| Slack Marketplace | Required and optional scopes are separate; every scope must correspond to testable current functionality; installation and OAuth are functionally tested; high-access scopes receive enhanced review | The app can be installed and the requested scopes are justified by implemented behavior | Required/optional access split; no speculative authority; enhanced review triggered by access/effect class | Workspace app installation model for keyless Operations; trust in prose without runtime evidence |
| Kubernetes admission + readiness | Authn/authz occurs before admission; mutating admission precedes validating admission; rejection prevents persistence; readiness runs for the whole lifecycle and removes failed Pods from Service endpoints | The persisted object passed policy, and the current instance is or is not eligible for traffic | Static admission before canonical persistence; immutable policy result; route removal on readiness failure; startup/readiness separation | Treating an arbitrary Operation call as a harmless readiness probe; liveness-triggered restarts of suppliers AE does not control |
| MCP Registry | Schema/semantic/package checks; namespace authentication by GitHub/DNS/HTTP; exact versions, not ranges or `latest`; explicit active/deprecated/deleted status; incremental feeds include tombstones | A named publisher controls the namespace and published a validated, exact server version | Supplier namespace proof, exact revision IDs, content/package digests, tombstones, source-vs-registry metadata separation | Registry presence as proof of endpoint readiness, individual tool behavior, safety, or output quality |
| OpenAPI | One Operation Object per method/path with parameters, request body, responses, security, and optionally unique `operationId` | A machine-readable design-time request/response contract | Operation is the right market unit; exact method/path/schema/security extraction | Inferring read-only, idempotent, reversible, data-use, or truthful behavior from OpenAPI alone |
| MCP tools | `inputSchema`, optional `outputSchema`, and `readOnlyHint`, `destructiveHint`, `idempotentHint`, `openWorldHint`; spec explicitly calls annotations untrusted hints | A server self-describes its tool shape and claimed behavioral class | Compact effect vocabulary and conservative defaults | Auto-execution based on untrusted hints; treating `idempotentHint` as observed retry safety |
| Argo Rollouts | A changed revision receives bounded canary traffic and analysis; failed analysis aborts; successful steps promote that revision to stable | One exact revision met declared analysis thresholds during a bounded rollout | Exact-revision canary, explicit pass/fail/inconclusive, no cross-revision evidence reuse, fast de-route | Percentage traffic shaping, ReplicaSet orchestration, or automatic quality claims from one technical canary |

## 1. Stripe: requirements are capability-scoped and remain live

Stripe Connect's useful idea is not “verify the supplier.” It is “enable a named capability only when its own requirements are satisfied.” Stripe documents that requested capabilities determine what information must be collected, that a capability normally must be `active` for its associated actions, and that sandbox/test behavior may not enforce the same capability state as production ([account capabilities](https://docs.stripe.com/connect/account-capabilities)). Embedded onboarding reads outstanding requirements from the Accounts API and can collect `currently_due`, `eventually_due`, or future requirements; Stripe warns that requirements can change over time ([embedded onboarding](https://docs.stripe.com/connect/embedded-onboarding)).

Reusable AE mechanism:

```text
OperationRevision.requirements = [
  input_contract_valid,
  output_contract_present,
  effect_contract_evidenced,
  data_use_contract_evidenced,
  access_lane_supported,
  current_gate_observed,
  delivery_canary_current,
  retry_contract_verified
]
```

Each predicate has `status`, `evidenceRef`, `policyVersion`, `checkedAt`, `validUntil`, and a remediation code. Routeability is a projection over current predicates, not a manually set boolean. Like Stripe's `currently_due`, an expired or changed predicate makes remediation explicit without erasing the supplier or the Operation's history.

Stripe Apps add the more relevant market pattern. The app manifest records permissions and external services; permission requests carry a user-facing purpose and a reviewer-facing explanation. Apps cannot access Stripe objects outside the manifest, and UI network access to third-party URLs is restricted by a content-security policy ([Stripe Apps architecture and permissions](https://docs.stripe.com/stripe-apps/how-stripe-apps-work), [manifest reference](https://docs.stripe.com/stripe-apps/reference/app-manifest)). Marketplace review uses a sandbox, test credentials, and production-flow instructions before publication ([publishing guide](https://docs.stripe.com/stripe-apps/publish-app)).

AE should reuse the shape, not the installation model:

- every transmitted input pointer gets a recipient and purpose;
- every external effect gets a class, authority requirement, and reversibility statement;
- every credential/access requirement is explicit;
- the supplier declaration and AE verification remain different evidence objects;
- changes to any of those fields create a new Operation revision.

Stripe's own quality rules require confirmation for costly or destructive actions and make republished versions preserve continuity ([quality requirements](https://docs.stripe.com/stripe-apps/review-requirements)). AE already has the stronger product primitive: inspect-plan plus bounded caller authority. Do not replace it with a provider-wide install consent.

Stripe's API also supplies a concrete idempotency contract: the server stores the first status/body for a key, returns that result on a repeat, compares parameters and errors when the key is reused with different parameters, and does not save a result when execution never began ([idempotent requests](https://docs.stripe.com/api/idempotent_requests)). The reusable mechanism is not Stripe's exact 24-hour retention policy; it is the separation of logical request identity, request-fingerprint equality, cached outcome, and “execution never started” retry eligibility. AE needs those as independently testable predicates for every durable automatic-retry lane.

## 2. Shopify and Slack: least privilege must map to testable behavior

Shopify requires apps to request only necessary scopes and may require proof that sensitive scopes are needed. Its review process combines automated checks with a production-ready functional review; code-only checks explicitly do not cover live behavior, listing truth, or merchant experience ([App Store requirements](https://shopify.dev/docs/apps/launch/shopify-app-store/app-store-requirements), [review preparation](https://shopify.dev/docs/apps/launch/app-store-review/pass-app-review)).

Slack makes the boundary even clearer:

- required scopes must be sufficient for core functionality;
- optional scopes may enhance, but cannot secretly complete, the core feature;
- requested scopes must correspond to current, testable functionality rather than future plans;
- OAuth installation and the functional app are tested separately;
- extensive read/write scopes trigger enhanced review;
- permission review considers both what information an app can view and what actions it can perform ([Marketplace requirements](https://api.slack.com/start/distributing/guidelines), [review guide](https://api.slack.com/directory/app-review-guide), [permission model](https://api.slack.com/help/articles/115003461503-Understand-app-permissions-)).

AE's direct translation is an effect-and-data-use matrix, scoped to an exact Operation revision:

| Question | Required AE field | Default when missing |
|---|---|---|
| What input leaves AE? | JSON pointer / media part | unavailable |
| Who receives it? | provider principal + endpoint origin | unavailable |
| Why is it needed? | execution purpose | unavailable |
| Is it retained or reused? | retention + secondary-use evidence | quarantine |
| What can the call change? | `read_only`, `additive`, `mutating`, `destructive`, `unknown` | `unknown` |
| Can the change be reversed? | reversal method/window or `irreversible` | unknown |
| Can the same call be safely retried? | observed idempotency/recovery contract | no automatic retry |
| Does it reach external parties? | open-world recipients/effect scope | assume open world |

This should be a structured contract, not a “review notes” text area. High-risk classifications select a different invocation lane; they do not merely add a warning badge.

Mismatch with AE: Shopify and Slack review applications that live inside their platforms and receive broad, durable scopes. AE buys one bounded contribution under caller authority. A full manual app-store review for every keyless read Operation would be slower and less precise than deterministic admission plus a paid canary.

## 3. Kubernetes: admission and readiness are different authorities

Kubernetes admission controllers run after authentication and authorization but before an object is persisted. Mutating admission runs before validating admission; any rejection rejects the request. Kubernetes also warns that admission side effects require reclamation or reconciliation because later controllers may still reject the object ([admission control](https://kubernetes.io/docs/reference/access-authn-authz/admission-controllers/)).

This maps cleanly to AE:

1. **Normalize without network effects.** Sanitize and canonicalize source metadata.
2. **Validate without mutation.** Check schema, target, method, price/access lane, secret leakage, and required evidence.
3. **Persist the exact candidate revision.** Rejection is evidence against that digest, not a provider ban.
4. **Perform separately authorized observations.** A probe or paid canary is never an admission side effect hidden inside parsing.
5. **Reconcile any paid ambiguity.** Later failure cannot justify replaying an irreversible or chargeable effect.

Kubernetes readiness is distinct from startup and liveness. A readiness probe runs throughout the container lifecycle; failure removes the Pod from Service endpoints without necessarily restarting it. A startup probe prevents readiness/liveness checks until initialization succeeds ([probe semantics](https://kubernetes.io/docs/concepts/workloads/pods/probes/)).

AE should model three different observations:

- `gate_observed`: the exact safe request currently reaches the advertised access/payment gate;
- `delivery_observed`: a controlled invocation produced a bounded contract-valid result;
- `routeable`: both observations and every admission predicate are current for the same revision.

AE must not copy Kubernetes' assumption that a probe endpoint is supplier-provided and safe. Background Operation probes are permitted only for admitted GET fixtures. POST, PUT, PATCH, and DELETE are never readiness probes, even when the provider's example calls them “search” or “test.”

## 4. MCP Registry: ownership, exact versions, and tombstones

The official MCP Registry validates namespace ownership: GitHub identities control `io.github.*` namespaces, while DNS or HTTP challenges prove domain namespaces. The publisher validates `server.json`; the service checks namespace authorization and package ownership before publication ([registry architecture](https://github.com/modelcontextprotocol/registry/blob/main/README.md), [publisher commands](https://github.com/modelcontextprotocol/registry/blob/main/docs/reference/cli/commands.md)).

Its data model contains several mechanisms AE should adopt:

- server versions are exact; ranges and `latest` are rejected by semantic validation;
- repository host IDs can remain stable across renames and help detect delete/recreate identity attacks;
- package file digests can bind installed bytes;
- lifecycle status belongs to registry-managed metadata, not publisher-controlled `server.json`;
- `active`, `deprecated`, and `deleted` apply per exact version;
- incremental consumers can request `updated_since`, including deleted tombstones ([official API](https://github.com/modelcontextprotocol/registry/blob/main/docs/reference/api/official-registry-api.md), [server schema](https://github.com/modelcontextprotocol/registry/blob/main/docs/reference/server-json/draft/server.schema.json), [validator source](https://github.com/modelcontextprotocol/registry/blob/main/internal/validators/validators.go)).

AE translation:

```text
providerPrincipal  --proves control of--> provider namespace/origin
sourceRevision     --describes----------> candidate metadata
operationRevision  --binds--------------> normalized contract + evidence digests
routeability       --projects-----------> current evidence for that exact revision
lifecycleStatus    --records------------> active | deprecated | withdrawn
```

Never infer that a namespace owner truthfully described behavior. Ownership answers “who published this?” It does not answer “what happens when called?” Likewise, MCP Registry presence is metadata authority only. AE still needs Operation-level admission, readiness, effects, data use, buyer authority, and delivery evidence.

## 5. OpenAPI and MCP tools: contracts describe shape better than consequence

OpenAPI's Operation Object is the strongest confirmation that AE chose the correct market unit: one method/path operation has parameters, request body, response set, security, servers, and an optional unique `operationId`. The spec requires at least one response entry and distinguishes method-specific operations on the same path ([OpenAPI 3.1 Operation Object](https://spec.openapis.org/oas/v3.1.0.html#operation-object)).

But OpenAPI does not declare a trustworthy effect model. HTTP method semantics are useful defaults, not observations about an arbitrary implementation. An OpenAPI example is illustrative data, not permission to execute it. Security schemes describe how credentials are presented, not what downstream data use or external effects occur.

MCP tools provide the missing vocabulary: `readOnlyHint`, `destructiveHint`, `idempotentHint`, and `openWorldHint`, with conservative defaults. Crucially, the MCP specification says every annotation is a hint and clients must not make decisions from annotations supplied by untrusted servers. Tool inputs and optional structured outputs use JSON Schema, and tool-list changes can be signalled ([MCP tool specification](https://modelcontextprotocol.io/specification/2025-06-18/server/tools), [normative schema](https://github.com/modelcontextprotocol/modelcontextprotocol/blob/main/schema/2025-06-18/schema.ts)).

AE should use these terms as supplier assertion fields, then strengthen them with evidence:

| Claim | Minimum strengthening evidence |
|---|---|
| read-only | safe method plus first-party terms/effect statement; no background write-method probe |
| non-destructive additive | controlled consequence test and recovery/reversal contract |
| idempotent | protocol key plus same-key/same-fingerprint replay and same-key/different-fingerprint conflict test |
| closed world | enumerated recipients and network/effect boundary |
| output shape | controlled canary response validated against bounded schema |

Supplier claims remain visible as provenance; AE must never rewrite “claimed” into “verified.”

## 6. Argo Rollouts: promotion belongs to one revision

Argo Rollouts treats a changed workload template as a new revision and evaluates configured steps before promotion. Canary steps can set bounded traffic, pause, and run background analysis. An unsuccessful analysis aborts the rollout. In blue/green mode, failed post-promotion analysis switches traffic back to the previous stable ReplicaSet ([canary strategy](https://argo-rollouts.readthedocs.io/en/stable/features/canary/), [analysis behavior](https://argo-rollouts.readthedocs.io/en/stable/features/analysis/)).

The reusable AE invariant is:

> Evidence promotes exactly the revision that produced it.

Consequences:

- source, schema, price/access, effect, data-use, or endpoint change creates a new revision;
- a canary result carries the exact revision and request/evidence digests;
- compare-and-set promotion fails with `revision_changed` if the candidate moved during the call;
- the last known routeable revision may remain historically inspectable, but AE must not silently route it when the supplier now advertises incompatible terms;
- pass, fail, error, and inconclusive are distinct canary results;
- one schema-valid canary proves technical delivery, not general outcome quality.

AE does not need Argo's percentage traffic engine. It cannot shift a supplier's deployment traffic, and paid Operations make repeated analysis costly. One bounded canary before first routeability, plus TTL-based gate/delivery evidence and normal invocation outcomes, is the correct scale.

## Admission and promotion contract

### States

```text
SOURCE_OBSERVED
  -> STATIC_ADMITTED
  -> PUBLISHED_UNAVAILABLE
  -> GATE_OBSERVED
  -> CANARY_RUNNING
  -> ROUTEABLE

Any state -> QUARANTINED       missing structured evidence / unsafe lane
Any current state -> DEGRADED  readiness or delivery evidence expired/failed
Any state -> DEPRECATED        supplier recommends replacement
Any state -> WITHDRAWN         supplier or AE removes current allocation eligibility
```

`QUARANTINED` is a machine-readable evidence state, not an unbounded moderation inbox. `DEPRECATED` remains discoverable with a replacement pointer when safe; `WITHDRAWN` is excluded from current allocation but retains audit history.

### Transition evidence

| Transition | Required evidence | Refuse if |
|---|---|---|
| Source observed -> static admitted | allowlisted source; received and sanitized digests; exact identity; bounded schemas; supported access/payment lane; no secret material | source cannot be reproduced, target is unsafe, contract is structurally invalid |
| Static admitted -> published unavailable | complete comparable contract; supplier claims and AE evidence separated; effects/data use/access represented without invented “none” | any required field is silently defaulted to a safe value |
| Published unavailable -> gate observed | exact GET fixture; public-target/redirect guard; non-paying expected challenge; exact current access tuple; timestamp/TTL | unsafe method, no deterministic fixture, free mutation risk, mismatch or malformed challenge |
| Gate observed -> canary running | dedicated canary grant and budget; exact revision; stable invocation/idempotency IDs; worst-case spend reserved | no authority, ambiguous effects, retry contract absent, revision drift |
| Canary running -> routeable | settled result; bounded/schema-valid output; idempotency conformance; exact-revision CAS; gate and delivery expiries | settlement only, invalid output, duplicate effect/payment, inconclusive recovery |
| Routeable -> degraded | gate/delivery expiry, repeated usable-output failure, changed evidence digest, revoked access, or current readiness failure | never keep routing only because a historical canary passed |
| Any -> deprecated/withdrawn | authenticated supplier or AE policy decision, reason, time, replacement when applicable | deleting evidence or history |

## Safe canary rules

A canary is a real invocation and therefore needs real authority. It is not a “probe with payment.”

1. Only an admitted GET/public-input Operation enters the automatic first lane.
2. Create the canary grant, budget reservation, invocation reference, and idempotency key before network dispatch.
3. Bind all evidence to the exact Operation revision and exact normalized request fingerprint.
4. Obtain fresh call-time terms inside the authorized invocation; sign only after exact comparison.
5. Send at most one signed request. Ambiguous settlement enters reconciliation, never blind retry.
6. Validate size, media type, schema, and minimum usability of the returned contribution.
7. Run bounded idempotency conformance only when the protocol/provider exposes a suitable identifier: same ID + same fingerprint must recover one logical result; same ID + different fingerprint must conflict.
8. Record `passed`, `failed`, `error`, or `inconclusive`; only `passed` can promote.
9. A changed revision cannot consume or inherit the result.

This is Argo's revision promotion plus Kubernetes readiness and Stripe/Slack least privilege, scaled down to one paid contribution.

## Supplier onboarding experience

The supplier-facing flow should ask only questions that cannot be derived safely:

1. **Claim identity.** Prove domain/namespace control or connect an existing provider principal.
2. **Choose/import one Operation.** Import OpenAPI/MCP/x402 metadata or enter one exact callable contribution—not an entire agent profile.
3. **Review derived contract.** Confirm exact input/output, access, fixed price/ceiling, and provider recipient.
4. **Declare missing consequence facts.** Effects, reversibility, retention, secondary use, external recipients, retry/recovery, and support contact.
5. **Provide a deterministic test fixture.** It must contain no credential or private customer data. An imported example is optional and cannot silently become authority.
6. **See machine-readable blockers.** Every failure names the predicate, evidence, and remediation.
7. **Authorize one bounded canary.** The canary uses AE's normal invocation, ledger, receipt, and recovery plane.
8. **Publish unavailable, then routeable.** Passing static checks may create a canonical inspectable page; only current gate and canary evidence permits allocation.
9. **Revise rather than mutate.** Material changes create a new revision and repeat only the invalidated gates.
10. **Deprecate or withdraw.** Preserve tombstones, replacement pointers, and historical receipts.

For raw CDP Bazaar sourcing, steps 1–5 begin as observed metadata and structured enrichment, not assumed supplier consent. The row stays lower-authority until the relevant principal or named curator supplies the missing evidence.

## What not to build

- No universal supplier KYC before the first public-data GET lane. Payment/legal verification can be added where required; it is not Operation behavior evidence.
- No general app-store submission bureaucracy or subjective “quality score” gate.
- No background POST/PUT/PATCH/DELETE canaries.
- No provider-wide “trusted” badge that bypasses Operation revision admission.
- No automatic execution from OpenAPI examples or MCP effect hints.
- No single `healthy` boolean combining source freshness, gate reachability, delivery, quality, and settlement.
- No percentage traffic-shifting platform or supplier deployment controller.
- No workflow builder, orchestration runtime, project memory, or tender process.
- No promotion based on registry rank, call count, payer count, or prose.

## Concrete implementation phases

These recommendations map onto the phases in [`x402-operation-onboarding.md`](./x402-operation-onboarding.md) rather than creating a second architecture.

### Phase 1 — deterministic admission before network

Borrow Kubernetes' admission boundary and MCP Registry's semantic validator:

- represent raw registry rows as `source_metadata_only`;
- normalize/sanitize first, validate second, then persist one immutable candidate digest;
- return predicate-level refusal/quarantine codes;
- prove zero network calls for unsafe methods, missing safe fixtures, unsafe targets, invalid schemas, and secret-bearing inputs.

**Exit evidence:** official GET/POST/PUT/DELETE fixtures show only admitted GET can reach the network.

### Phase 2 — capability requirements and consequence manifest

Borrow Stripe capability requirements and Stripe/Slack/Shopify least privilege:

- add per-pointer data-use purposes and recipients;
- add effect, reversibility, open-world, and retry declarations;
- retain `supplier_claimed` and `ae_verified` provenance separately;
- block empty effects/data-use arrays from meaning “none”;
- make missing fields `currently_due` remediation predicates.

**Exit evidence:** every transmitted input and every external effect maps to a structured field and a source/evidence reference.

### Phase 3 — independent gate, delivery, and lifecycle evidence

Borrow Kubernetes readiness and MCP Registry status/tombstones:

- store gate and delivery observations separately with independent TTLs;
- project routeability only when all predicates are current for the same revision;
- implement `deprecated`, `withdrawn`, replacement, and incremental tombstone handling;
- remove traffic eligibility immediately on readiness failure without deleting the Operation.

**Exit evidence:** gate-only never routes; expired delivery evidence de-routes despite a fresh gate; withdrawn revisions disappear from current allocation but remain auditable.

### Phase 4 — fresh call-time authority

Apply AE's call-scoped buyer authority instead of borrowing app-wide install consent:

- inspect remains network-free and binds authorization to the exact request, disclosed consequence contract, and current observed fixed tuple;
- execute repeats the exact unsigned request, obtains fresh terms, compares them field-for-field, and signs only when unchanged;
- any drift returns `terms_changed` before signature;
- ambiguous paid outcomes enter status/reconciliation.

**Exit evidence:** stale onboarding/inspect material can never reach the signer.

### Phase 5 — exact-revision paid canary

Borrow Argo's promotion model:

- create a dedicated canary authority and budget;
- run one bounded real invocation plus idempotency conformance;
- record pass/fail/error/inconclusive;
- promote by compare-and-set only if the exact revision and all evidence digests remain current.

**Exit evidence:** old-revision canaries cannot activate new revisions; settlement with unusable output fails; duplicate logical calls cannot produce a second payment/effect.

### Phase 6 — identity and supplier self-service

Borrow MCP Registry namespace proof and Stripe remediation UX only after the first evidence-real market cell works:

- domain/GitHub/DNS/HTTP ownership proof;
- provider-controlled revision submission;
- requirement checklist with precise remediation;
- versioned deprecation/withdrawal.

Do not block the initial curated pilot on a complete self-service portal.

### Phase 7 — one comparable market cell

Select two independently admitted GET Operations in the same capability category. They must reach the same contract, gate, output, and retry bar. Do not fabricate a second supplier or weaken a gate to populate compare. Once both are routeable, test the complete cross-harness loop: search -> compare -> inspect -> authorized call -> literal usable result -> status/recovery.

## Final recommendation

Build the **Kubernetes-shaped core with MCP-Registry identity and Argo-style revision promotion**, then add Stripe/Slack consequence declarations only where the source cannot prove them.

In practical terms, the next useful unit is:

- one immutable Operation revision;
- one requirements vector;
- one deterministic GET fixture;
- one no-payment gate observation;
- one authorized paid output/idempotency canary;
- one routeability projection;
- one deprecation/withdrawal path.

That is enough to make AE honest and useful. Everything larger should wait until two real suppliers complete the same market loop.

## Primary sources

- [Stripe Connect capabilities](https://docs.stripe.com/connect/account-capabilities)
- [Stripe embedded onboarding and changing requirements](https://docs.stripe.com/connect/embedded-onboarding)
- [Stripe Apps architecture and permissions](https://docs.stripe.com/stripe-apps/how-stripe-apps-work)
- [Stripe app manifest](https://docs.stripe.com/stripe-apps/reference/app-manifest)
- [Stripe Marketplace publishing](https://docs.stripe.com/stripe-apps/publish-app)
- [Stripe app review requirements](https://docs.stripe.com/stripe-apps/review-requirements)
- [Stripe idempotent requests](https://docs.stripe.com/api/idempotent_requests)
- [Shopify App Store requirements](https://shopify.dev/docs/apps/launch/shopify-app-store/app-store-requirements)
- [Shopify app review preparation](https://shopify.dev/docs/apps/launch/app-store-review/pass-app-review)
- [Slack Marketplace requirements](https://api.slack.com/start/distributing/guidelines)
- [Slack app review guide](https://api.slack.com/directory/app-review-guide)
- [Slack permissions](https://api.slack.com/help/articles/115003461503-Understand-app-permissions-)
- [Kubernetes admission control](https://kubernetes.io/docs/reference/access-authn-authz/admission-controllers/)
- [Kubernetes startup, readiness, and liveness probes](https://kubernetes.io/docs/concepts/workloads/pods/probes/)
- [MCP Registry](https://github.com/modelcontextprotocol/registry/blob/main/README.md)
- [MCP Registry publisher commands](https://github.com/modelcontextprotocol/registry/blob/main/docs/reference/cli/commands.md)
- [MCP Registry official API and lifecycle](https://github.com/modelcontextprotocol/registry/blob/main/docs/reference/api/official-registry-api.md)
- [MCP Registry server schema](https://github.com/modelcontextprotocol/registry/blob/main/docs/reference/server-json/draft/server.schema.json)
- [MCP Registry semantic validators](https://github.com/modelcontextprotocol/registry/blob/main/internal/validators/validators.go)
- [OpenAPI 3.1 Operation Object](https://spec.openapis.org/oas/v3.1.0.html#operation-object)
- [MCP tools specification](https://modelcontextprotocol.io/specification/2025-06-18/server/tools)
- [MCP normative schema and tool annotations](https://github.com/modelcontextprotocol/modelcontextprotocol/blob/main/schema/2025-06-18/schema.ts)
- [Argo Rollouts canary strategy](https://argo-rollouts.readthedocs.io/en/stable/features/canary/)
- [Argo Rollouts analysis](https://argo-rollouts.readthedocs.io/en/stable/features/analysis/)
