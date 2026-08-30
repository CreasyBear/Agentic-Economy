# x402 Operation onboarding: evidence model and admission contract

**Evidence date:** 2026-08-30
**Product authority:** [`PRODUCT.md`](../../PRODUCT.md)
**x402 source snapshot:** [`x402-foundation/x402@e398a9e`](https://github.com/x402-foundation/x402/tree/e398a9e5724542e5b2da37c953156159fb7171d2)
**Scope:** How an external x402 listing becomes a canonical, routeable Agentic Economy Operation without treating registry metadata, a 402 response, or a successful payment as stronger evidence than it is.

No paid call, settlement, provider mutation, production write, deployment, or catalogue registration was performed for this research. Live checks used the official CDP Bazaar search and read-only endpoint validator, which performs no payment and does not index a resource ([validator contract](https://docs.cdp.coinbase.com/api-reference/v2/rest-api/x402-facilitator/validate-x402-endpoint)).

## Executive decision

An external row begins as a **source assertion**, not authority. After that, Agentic Economy needs four distinct authorities:

1. **AE publication authority:** AE's static admission decision creates one immutable, inspectable Operation revision. The source assertion alone cannot do this.
2. **Background-probe authority:** AE policy may authorize one bounded, unsigned `GET` against an exact deterministic fixture. It proves only that the request currently reaches an x402 gate advertising particular terms.
3. **Invocation authority:** the buyer's approved plan authorizes one exact request and its disclosed effects; discovery metadata, examples, and probe inputs never do.
4. **Payment and settlement authority:** a valid grant, budget reservation, signature, settlement evidence, and validated output prove that one contribution was actually delivered.

The raw CDP Bazaar feed should remain a **source lane**, not a publication lane. Its rows enter AE as lower-authority observed metadata. The admission pipeline should therefore be:

```text
observed metadata
  -> bounded static admission
  -> canonical publication, unavailable by default
  -> optional safe-to-probe classification and deterministic GET fixture
  -> fresh live 402 gate observation
  -> one separately authorized paid canary with validated output
  -> routeable Operation
  -> continuous challenge refresh and invocation recovery
```

Static admission may therefore publish an unavailable, inspectable revision without making a network request. A fresh 402 is optional for publication and mandatory for automatic routeability. An unsafe/effect-unknown declaration is not publishable until the missing effect and data-use contract is supplied through the structured lane; it is never “tested” into safety by sending the request.

For automatic onboarding, the first slice should stay deliberately narrow:

- public HTTPS;
- x402 v2 over HTTP;
- `GET` only;
- exact, fixed-price Base mainnet USDC;
- a deterministic, non-secret probe input that validates against the exact source schema (a valid Bazaar example may supply it, but an example is optional metadata and never authority);
- JSON output example/schema;
- no headers, credentials, unresolved path parameters, external schema references, or secret-like example values;
- a fresh challenge whose resource and selected payment tuple exactly match the candidate;
- a successful, idempotently recoverable paid canary whose output satisfies the admitted output contract; and
- provider support for `payment-identifier`, required for AE's durable managed auto-routeable lane, with the identifier bound to the exact normalized request fingerprint.

`POST`, `PUT`, `PATCH`, `DELETE`, MCP, `upto`, batch settlement, dynamic price/payee, and effectful or unclassified operations should be quarantined for a structured onboarding lane. This is not because those forms are invalid x402. It is because Bazaar discovery metadata does not certify safe probe semantics, effect class, data-use terms, provider identity, output truth, or recovery behavior.

## The protocol boundary Agentic Economy must preserve

The x402 v2 core flow is request -> payment-required signal -> signed authorization -> verification/resource execution/settlement. The specification explicitly leaves client-side budget management and session policy outside the protocol ([core specification](https://github.com/x402-foundation/x402/blob/e398a9e5724542e5b2da37c953156159fb7171d2/specs/x402-specification-v2.md)). That aligns with the product charter: x402 is one acquisition transport; Agentic Economy still owns comparison, delegated authority, exact total price, controlled execution, receipts, status, and recovery.

The HTTP transport has three canonical headers: `PAYMENT-REQUIRED` on the 402, `PAYMENT-SIGNATURE` on the paid retry, and `PAYMENT-RESPONSE` on settlement ([HTTP transport specification](https://github.com/x402-foundation/x402/blob/e398a9e5724542e5b2da37c953156159fb7171d2/specs/transports-v2/http.md)). The response body remains a provider concern. A valid payment exchange does not, by itself, make the body useful or schema-conformant.

The Bazaar extension adds callable-shape metadata: HTTP method, optional query/body examples, input schema, and optional output example, or an MCP tool name and schema ([Bazaar specification](https://github.com/x402-foundation/x402/blob/e398a9e5724542e5b2da37c953156159fb7171d2/specs/extensions/bazaar.md)). Examples are discovery aids, not required contract fields, safety declarations, or execution authority. It does **not** define:

- whether an HTTP operation is read-only or consequential;
- data retention or secondary data use;
- a legal/business provider identity;
- service-level availability or latency promises;
- output correctness;
- refund, cancellation, or application-level recovery;
- a revocation API with immediate semantics;
- a buyer budget or authority decision.

This means Bazaar can supply a candidate contract, but it cannot supply the complete Operation contract required by `PRODUCT.md`.

## What the official implementation actually validates

The maintained x402 implementation validates useful but bounded facts:

- `info` must validate against the provider-supplied JSON Schema;
- external `$ref`/`$id` references are rejected to avoid SSRF or local-file disclosure hazards;
- HTTP and MCP discriminator fields and supported methods/body types are checked;
- route templates must be safe path templates and cannot contain traversal or URL-injection forms;
- service names, tags, and icon URLs are sanitized, including loopback/IP defenses for icon URLs;
- dynamic route templates are normalized before cataloging.

These checks are visible in the official [Bazaar facilitator implementation](https://github.com/x402-foundation/x402/blob/e398a9e5724542e5b2da37c953156159fb7171d2/typescript/packages/extensions/src/bazaar/facilitator.ts) and [resource-server enrichment](https://github.com/x402-foundation/x402/blob/e398a9e5724542e5b2da37c953156159fb7171d2/typescript/packages/extensions/src/bazaar/server.ts).

Two limits matter for AE:

1. The schema is still provider-controlled. Internal consistency is not truth, safety, or usefulness.
2. CDP's public endpoint validator is a preflight, not AE admission. Its documented required checks are reachability, 402, Bazaar presence, and parsing, followed by a simulated facilitator decision ([CDP validator](https://docs.cdp.coinbase.com/api-reference/v2/rest-api/x402-facilitator/validate-x402-endpoint)). In a live 2026-08-30 check, `https://readx.sh/api/search` returned `valid: true` even though its Bazaar example was `queryParams: {}` and its own schema required `q`. AE must validate any example it chooses to use. A missing or invalid example does not invalidate the schema; it only means AE needs a separately sourced, reviewed, deterministic fixture before background probing.

## Discovery authority is not execution authority

The official reference facilitator catalogs a resource in an `onAfterVerify` hook by extracting discovery data from the payment payload and current requirements ([facilitator Bazaar example](https://github.com/x402-foundation/x402/blob/e398a9e5724542e5b2da37c953156159fb7171d2/examples/typescript/facilitator/advanced/bazaar.ts)). CDP's production Bazaar is stricter operationally: it documents that a public HTTPS route must validate and complete a successful paid call before indexing, and that extension outcomes are reported as `success`, `processing`, or `rejected` ([CDP seller discovery guide](https://docs.cdp.coinbase.com/x402/seller/get-discovered)).

Neither behavior establishes current execution authority forever:

- the catalog entry may be based on a past request;
- its `accepts` values may become stale;
- a dynamic-price route can return different terms for a different input;
- the route can stop returning 402;
- the provider can change output behavior while keeping the same schema;
- an indexed row can remain in a general catalog after health degradation.

CDP documents periodic health probing, eventual removal when an endpoint stops returning 402, and removal after 30 days without settlement ([discovery lifecycle](https://docs.cdp.coinbase.com/x402/seller/get-discovered)). Those are useful upstream signals, not a substitute for AE's own current challenge and delivery evidence.

## Official examples: why a discovery example is not a safe probe authorization

The official Bazaar package presents all of the following as valid discovery declarations ([official Bazaar README](https://github.com/x402-foundation/x402/blob/e398a9e5724542e5b2da37c953156159fb7171d2/typescript/packages/extensions/src/bazaar/README.md)):

| Official example | Method / scheme | Declared example | What it proves | Why AE cannot auto-probe from metadata alone |
|---|---|---|---|---|
| Weather | `GET`, exact `$0.001` | `city=San Francisco` -> weather JSON | Query input and output can be described | Strong automatic candidate, but only a live challenge and paid output prove current operation |
| Translate | `POST`, exact `$0.01` | JSON text + target language | Body examples and schemas are valid Bazaar metadata | POST is not safe by HTTP semantics; the declaration has no effect or retention contract |
| User profile update | `PUT`, exact `$0.05` | Form-data name/email/bio | Effectful mutations can be discoverable | The example is clearly an external state change and must never be used as a generic readiness probe |
| Data deletion | `DELETE`, exact `$0.001` | ID -> deleted ID | Destructive operations can be listed | A discovery example is explicitly not permission to delete anything |
| Financial analysis MCP tool | MCP, exact `$0.01` | ticker + analysis type | Tool schemas and examples can be cataloged | MCP identity is URL + tool name and requires an MCP-specific probe/execution path |

Two further official examples broaden the risk:

- the dynamic-price server makes the challenge amount depend on `tier`, so a catalog price from one request cannot be treated as the price for another ([dynamic price example](https://github.com/x402-foundation/x402/blob/e398a9e5724542e5b2da37c953156159fb7171d2/examples/typescript/servers/advanced/dynamic-price.ts));
- the `upto` example authorizes a ceiling and settles actual usage after execution, so “total price” is a maximum plus a later settled amount, not a fixed catalog number ([upto example](https://github.com/x402-foundation/x402/blob/e398a9e5724542e5b2da37c953156159fb7171d2/examples/typescript/servers/upto/index.ts)).

HTTP defines GET and HEAD as safe methods and does not define POST, PUT, PATCH, or DELETE as safe ([RFC 9110 §9.2.1](https://www.rfc-editor.org/rfc/rfc9110.html#name-safe-methods)). Even GET safety is a semantic expectation, not proof that an arbitrary implementation behaves correctly. AE can use GET as the automatic lane only with guarded targets, an admitted deterministic input fixture, and a non-paying first probe.

## Live official-Bazaar sample

The following were observed through CDP's public Bazaar search and then checked with the official read-only validator on 2026-08-30. “Valid” below means CDP preflight accepted a live 402; it does not mean AE should automatically publish it. The catalog is mutable; reproduce through the [public search API](https://docs.cdp.coinbase.com/api-reference/v2/rest-api/x402-facilitator/search-x402-resources) and [validator](https://docs.cdp.coinbase.com/api-reference/v2/rest-api/x402-facilitator/validate-x402-endpoint).

| Resource | Method | Current Base USDC exact price | Input evidence | Extra evidence | AE disposition |
|---|---:|---:|---|---|---|
| `api.socialfetch.dev/v1/twitter/search` | GET | 0.028 | Required `query`; exact schema and output example | Bazaar plus `payment-identifier`; 16 calls and 3 payers in the observed 30-day quality window | Dated lead for the durable lane, not an admitted candidate; pin/refresh raw evidence, then run AE's static gates, fresh challenge, and separately authorized paid canary |
| `x402.ottoai.services/tweet-search` | GET | 0.005 | `{query:"$BTC"}`; `query` required | Bazaar, builder code, signed-offer/receipt extension; 2,819 calls and 14 payers in the observed 30-day quality window, but no `payment-identifier` | Dated lead only; currently ineligible for AE's durable managed lane until provider idempotency is available and verified |
| `twitter.use.x402atlas.com/search` | GET | 0.005 | `{words:"bitcoin"}`; schema does not require a selector | Rich output example; three EVM payment lanes | Dated lead only; would require pinned evidence, structured enrichment, a deterministic fixture and all later gates |
| `glim.sh/api/v1/twitter/search` | POST | 0.005 | Required JSON `query`; rich example/schema | Three networks; 4,008 calls and 12 payers in the observed window | Dated lead only; first-slice static policy quarantines POST without sending it |
| `x402.shizu.me/weather` | GET | 0.006 | Required `lat`/`lon` example | One exact Base lane; complete output example | Dated lead only; potential contract fixture after evidence pinning and enrichment |
| `x402.agentutility.ai/weather` | POST | 0.002 | Required JSON latitude/longitude example | Two payment lanes | Dated lead only; POST prose does not prove safe effects and the first slice will not send it |
| `readx.sh/api/search` | GET | 0.010 | Example `{}` but schema requires `q` | Official validator still returned `valid: true` | Dated lead only; source example is not background-probe-eligible and must retain `input_example_schema_mismatch` |

This sample also shows why usage cannot be admission authority. Call counts and payer counts can prioritize what to evaluate, but they do not repair missing required inputs, unsafe methods, stale terms, or unverified outputs.

## Proposed admission state machine

```text
OBSERVED_METADATA
  | complete static contract, provenance, effect and data-use checks pass
  v
PUBLISHED_UNREADY
  |-- no safe fixture: remains here with `safe_probe_fixture_required`
  | deterministic safe GET fixture admitted
  v
GATE_OBSERVED
  | separately authorized onboarding canary settles,
  | idempotency conformance passes, and output validates
  v
ROUTEABLE
  | challenge/terms/output/readiness drift
  v
STALE_OR_DEGRADED
  | new revision completes the same path       | sustained failure or supplier withdrawal
  +-----------------------------> ROUTEABLE    v
                                               WITHDRAWN

OBSERVED_METADATA -- incomplete/unsafe/ambiguous static contract --> QUARANTINED
```

`REFUSED` is a terminal decision for one exact source revision, not a permanent ban on a provider. A changed source digest creates a new evaluation. `QUARANTINED` is non-routeable and requires structured missing evidence; it is not an operator's free-form judgement queue.

### Transition contract

| From -> to | Required evidence | Must not be accepted as evidence |
|---|---|---|
| Observed -> published unready | Allowlisted source; immutable source digest; exact Operation identity; public HTTPS URL; `GET`; bounded self-contained schema; supported exact payment lane plus evidence that price is input-independent for this contract revision; no secret material; complete input/output/price/access/effect/data-use presentation | Registry membership, description prose, call volume, tags, service name, one observed exact price, a live request, or existence of an example by itself |
| Published unready -> gate observed | Background-probe policy authorizes an exact admitted deterministic GET request; guarded request returns HTTP 402 with canonical `PAYMENT-REQUIRED`; x402 v2 resource URL and selected payment tuple match; method is bound by the admitted source revision plus request digest, not inferred from the challenge; observation time and expiry persisted | Catalog `accepts`, CDP `valid:true` alone, prior challenge, or a challenge claimed to contain an HTTP method |
| Gate observed -> routeable | One controlled paid canary for the exact revision under a dedicated canary grant and budget; a fresh call-time 402 obtained by replaying the exact unsigned request; every term exactly matches the canary authorization before signing; settlement result; response bounded and schema-valid; provider `payment-identifier` conformance plus AE recovery state; independent gate and delivery expiries | An inspect-time challenge reused for signing, a 402 challenge alone, an upstream historical call count, settlement without usable output |
| Routeable -> remains routeable | Fresh challenge still matches; readiness not expired; no revision/authority drift | Stale last-known-good data |
| Routeable -> stale/degraded | Challenge missing/invalid, terms changed, output canary fails, source revision changes, authority changes, or readiness expires | Silent in-place repair or automatic acceptance of new price/payee |
| Stale/degraded -> withdrawn | Supplier withdrawal, repeated terminal failure under policy, or the source disappears and current live route is also gone | Registry disappearance by itself |

## The exact evidence bundle to persist

Every published x402 revision should retain:

- registry/facilitator source URL, source item identity, fetched time, raw-response digest computed before redaction, and sanitized source-document digest;
- normalized Operation identity: HTTP method + origin + normalized path; for MCP, URL + tool name;
- exact bounded source schema and sanitized source example when present; never the original header/credential-bearing example;
- independent example/schema validation outcome when an example exists, including preserved missing/malformed/mismatch diagnostics;
- exact deterministic probe fixture, its provenance, reviewer/policy decision when not sourced from Bazaar, and its schema-validation outcome;
- probe request digest, with secrets removed from stored/logged material;
- live 402 status, header digest, challenge digest, observed time, and response metadata;
- exact selected requirement tuple: `x402Version`, resource URL, scheme, network, asset, amount, payTo, max timeout, transfer method/payment flow, and relevant `extra` fields;
- facilitator `/supported` observation for the chosen scheme/network/extension set ([`GET /supported`](https://github.com/x402-foundation/x402/blob/e398a9e5724542e5b2da37c953156159fb7171d2/specs/x402-specification-v2.md#73-get-supported));
- signed-offer verification, signer identity, signer-authorization method, and `validUntil`, when available;
- paid-canary invocation reference, payment identifier, request fingerprint, settlement transaction/network/status, output digest/schema result, and observed time;
- readiness `validUntil` and exact reason when unavailable or degraded.

Do not store payment signatures, wallet private material, `Authorization`/`Cookie`/API-key headers, provider bearer tokens, or opaque cursor/token examples as reusable input defaults. Source ingestion computes the digest of the received bytes in memory, then runs header removal, secret-name/high-entropy scanning, schema bounds and example quarantine **before persistence**. Normal tables retain only the sanitized document plus the raw-response digest. If incident investigation genuinely requires exact raw bytes, place them in a separately encrypted, access-audited quarantine store with a short retention limit; they must never be readable by publication, fixture construction, probing, chat, logs, or public projections.

### Proposed persistence and transition ownership

The current `capabilityPublications.healthState` and readiness fields cannot represent these facts safely: one healthy 402 can currently project as routeability. Add two revision-bound evidence tables instead of adding more meanings to that flag:

| Table | Immutable/CAS identity | Required fields | Owner and expiry |
|---|---|---|---|
| `capabilityPublicationGateObservations` | `publicationRef + revision + requestDigest + challengeDigest` | source digest; admitted method; normalized resource; request digest; selected payment-tuple digest; 402/header digest; outcome; observed time | Written only by the background-probe action after static admission. Has its own short `validUntil`. It never records delivery health. |
| `capabilityPublicationDeliveryCanaries` | `canaryRef`, unique `publicationRef + revision + requestFingerprint + grantGeneration` | canary principal/grant; budget reservation/account refs; invocation identifier; conformance-session/payment identifier; sub-attempt fingerprints/signature mode; fresh challenge digest; payment tuple digest; settlement status/transaction; output digest/schema result; idempotency-conformance result; observed time | Written only from the canonical invocation/ledger completion path. Has an independent `validUntil`; gate refresh cannot extend it. |

`marketExternalRegistryEntries` remains source-owned metadata and should add `cdp_bazaar` as a source kind only after the pre-network static gate exists. Preserve a bounded **sanitized** source payload (or content-addressed sanitized blob reference) plus fetch query, fetched time, raw-response digest, sanitized-document digest, and upstream revision/`lastUpdated`; normalized fields are indexes, not the evidence artifact.

Routeability projection becomes a pure join over one exact current publication revision:

```text
publication.disposition == current
AND static admission == admitted
AND gate observation == matching + unexpired
AND delivery canary == matching + delivered + output_valid + unexpired
AND payment tuple digests agree
AND provider idempotency conformance == verified
```

The mutation that activates routeability must compare-and-set `publicationRef`, `revision`, `sourceDigest`, `priceDigest`, `requestDigest`, and both evidence digests in one Convex transaction. A changed revision or digest records `revision_changed`; evidence from the old revision cannot activate or renew the new one.

### Dedicated onboarding-canary authority

The normal buyer inspect path correctly refuses non-routeable Operations, so onboarding cannot borrow buyer authority or bypass that refusal. Define a private, operator-only canary command with all of these preconditions:

- a dedicated AE onboarding principal and funding account, never a customer credential;
- an explicit short-lived canary grant naming one `publicationRef@revision`, one request fingerprint, one exact payment tuple, maximum total spend, maximum attempts, and expiry;
- a reserved canary budget in the canonical money ledger before any signature;
- a stable `invocationRef` and `idempotencyKey`, plus a separate conformance-session `payment-identifier`, all generated and stored before dispatch;
- the same consequence journal, settlement, receipt, and reconciliation machinery used by normal invocations;
- no generic routeability bypass: the only bypass is from `gate_observed` into this exact canary command under the dedicated grant;
- an atomic revision check when the canary result is recorded.

Normal AE payment identifiers are input-bound through the operation key, so the different-fingerprint conformance case must not mutate or counterfeit a normal invocation identity. The private canary command creates a separate `conformanceSessionRef` and one explicitly authorized `paymentIdentifier`, then records three sub-attempts beneath it. The identical replay reuses the original request **and original `PAYMENT-SIGNATURE` bytes**; this tests provider/facilitator replay behavior without creating a second authorization. The different-fingerprint case uses a new signed authorization under the same conformance payment identifier through a narrowly scoped signer input available only to this canary command. The reserved budget covers the possibility that a nonconforming provider settles it. None of these override inputs are exposed by buyer invocation APIs.

The operator must explicitly create/fund that grant; merely running onboarding does not authorize payment. The canary expense is charged to the AE canary account and remains visible in the ledger even when output validation fails. No automatic canary runs in this research or in a deployment lacking that configured authority.

## Payment, pricing, identity, and provenance rules

### Fresh price and terms

The catalog price is discovery metadata. In the first fixed-price lane, inspect-plan remains network-free: it presents the exact fixed total and terms from the current, unexpired gate observation and binds the buyer's authorization to the exact input/request digest, disclosed data use, effects, and payment tuple. It must not send buyer input to the provider before that authorization exists. Inside the authorized invocation, AE issues the exact unsigned request, obtains a fresh call-time 402, compares every relevant field with the authorized plan, and only then creates a payment signature. Any drift in amount, asset, payee, scheme, network, flow, resource, admitted request method, or expiry returns `terms_changed` before signature. AE must never silently accept drift. A free 2xx at this point may be returned because the provider request is already authorized. A future dynamic-price or `upto` lane would need an explicit preflight/data-disclosure grant or a separate ceiling-and-final-settlement contract; neither is part of this first slice.

The x402 scheme specification allows materially different execution ordering: the default authorization flow verifies before the resource and settles afterward, while upfront and escrow flows commit funds before execution ([payment-flow models](https://github.com/x402-foundation/x402/blob/e398a9e5724542e5b2da37c953156159fb7171d2/specs/x402-specification-v2.md#61-asset-transfer-methods-and-payment-flow-models)). AE's first lane should admit only the exact authorization flow it implements and understands.

Signed offers can strengthen term integrity and provide an expiry, but the official offer/receipt specification warns that signature validity and signer authorization are different facts. AE must verify that the signer is authorized for the resource/payee through payTo control, `did:web`, DNS, or another accepted binding, and preserve temporal authorization evidence across key rotation ([offer/receipt specification](https://github.com/x402-foundation/x402/blob/e398a9e5724542e5b2da37c953156159fb7171d2/specs/extensions/extension-offer-and-receipt.md)).

### Provider identity

Treat `serviceName`, tags, description, and icon as presentation metadata. Treat `payTo` as a payment receiver, not automatically the legal/business identity. The minimum observed supplier identity is the verified HTTPS origin plus the current payee evidence. A higher “verified provider” tier requires a deliberate domain/business/key binding.

A changed payee, amount, schema, method, endpoint, or payment flow creates a new publication revision and immediately makes the old revision non-routeable. A presentation-only description change can refresh metadata, but it must still be source-digested and auditable.

### Idempotency and uncertain settlement

The x402 `payment-identifier` extension is provider-level evidence for safe retry. The official guidance says one logical request reuses one ID, the ID must be bound to a normalized request fingerprint, and the same ID with a different fingerprint should return `409 Conflict` ([payment-identifier guidance](https://github.com/x402-foundation/x402/blob/e398a9e5724542e5b2da37c953156159fb7171d2/docs/extensions/payment-identifier.mdx)). Advertisement alone is not verified behavior. Both are **mandatory for AE's durable managed auto-routeable lane**, and AE must also preserve its own invocation idempotency and recovery state. A provider without verified conformance can remain inspectable or enter a deliberately weaker, no-automatic-retry lane, but it cannot be silently promoted into durable automatic routing.

For the first GET-only lane, the dedicated canary grant authorizes a bounded conformance sequence: one paid request; one replay with the same payment identifier and identical normalized fingerprint that must return the cached/recovered result without a second settlement; and one same-identifier/different-fingerprint signed request that must fail with `409` before provider execution or settlement. Persist the response/settlement digests and observed-at time for all three. Because a nonconforming server could still settle either test request, the operator grant must reserve and cap the worst-case three charges before the first signature. Any second settlement, non-conflict response, ambiguous settlement, or missing receipt fails `provider_idempotency_unverified` and enters reconciliation; it never retries again automatically. This deliberate sequence is acceptable only for the statically admitted GET lane, explicit operator approval, and bounded canary account. Effectful methods need a provider test environment or equivalent first-party conformance evidence; AE must not probe their retry behavior in production.

The core specification defines `settlement_pending` as non-terminal and requires a transaction hash and network so the caller can reconcile before retrying ([x402 error handling](https://github.com/x402-foundation/x402/blob/e398a9e5724542e5b2da37c953156159fb7171d2/specs/x402-specification-v2.md#9-error-handling)). A blind retry after ambiguous settlement is a correctness bug. The Operation invocation must remain `pending_reconciliation` until chain/facilitator evidence resolves it.

## Safe input handling

The Bazaar schema allows custom header examples for HTTP inputs. That is useful for providers and unsafe for automatic persistence: a listing can accidentally publish an API key, cookie, token, or tenant-specific identifier. AE should:

1. reject all source header examples from the keyless automatic lane;
2. recursively scan query/body/path examples for secret-bearing names and high-entropy values;
3. drop an optional cursor/token field only when the remaining example still validates against the exact source schema;
4. quarantine required credential-like fields as authenticated/provider-account supply rather than relabeling them keyless;
5. reject external schema references and bound size, depth, property count, strings, and arrays;
6. build requests from structured admitted values, never concatenate raw URLs or replay source headers;
7. re-run public-target and redirect checks at every hop.

The current importer already has the right instinct in rejecting source headers/path parameters and validating a sanitized provider example against the admitted schema ([current Bazaar importer](../../src/modules/capability-supply/internal/publication-importer-x402-bazaar.ts)). The remaining policy gap is broader secret detection and a structured path-parameter lane rather than permanent blanket omission.

## Refusal and quarantine codes

Codes should identify the failed evidence, not collapse everything into `admission_refused`.

### Terminal for the exact source revision

| Code | Meaning |
|---|---|
| `source_not_allowlisted` | Candidate did not come from an admitted metadata source |
| `source_document_invalid` | Source row is malformed, oversized, or digest-invalid |
| `resource_invalid` | Missing/invalid public HTTPS resource identity |
| `route_template_invalid` | Dynamic path template is unsafe or cannot be matched to the concrete resource |
| `method_unsupported` | Method is outside the implemented transport slice |
| `input_schema_missing` | No bounded self-contained input schema |
| `input_schema_invalid` | Schema violates the supported JSON Schema subset or contains external references |
| `output_contract_missing` | No usable JSON output example/schema for this slice |
| `secret_material_detected` | Example or headers contain credential-like material |
| `payment_terms_invalid` | Missing/malformed amount, asset, payee, timeout, or version |
| `scheme_unsupported` | AE does not implement the advertised scheme/flow |
| `network_unsupported` | No implemented network lane |
| `asset_unsupported` | No implemented asset/exponent lane |
| `dynamic_terms_unsupported` | Price/payee depends on request and no input-bound quote path exists |
| `payment_required_invalid` | Live header cannot be decoded/validated as x402 v2 |
| `resource_mismatch` | Challenge resource differs from exact request identity |
| `method_mismatch` | Admitted source method differs from the constructed request method; this is detected from source/request identity, not from the 402 payload |
| `facilitator_unsupported` | Chosen scheme/network is absent from the facilitator's current supported response |
| `paid_canary_output_invalid` | Settlement succeeded but returned contribution violates the output contract |

### Quarantine / evidence required

| Code | Missing evidence |
|---|---|
| `effect_classification_required` | POST/PUT/PATCH/DELETE or otherwise ambiguous consequence |
| `data_use_terms_required` | Inputs may contain personal/confidential data and source has no terms |
| `path_example_required` | Dynamic path lacks a safe source-backed concrete value |
| `input_example_missing` | Optional Bazaar example is absent; preserve the diagnostic and require a separately admitted deterministic fixture before background probing |
| `input_example_schema_mismatch` | Optional Bazaar example is malformed or fails its schema; do not use it, but do not invalidate the contract if a separate safe fixture can be admitted |
| `safe_probe_fixture_required` | No deterministic, schema-valid, non-secret input has been separately established |
| `provider_identity_unverified` | Only self-asserted service metadata exists |
| `signed_offer_authorization_unverified` | Offer signature verifies but signer-to-provider binding does not |
| `provider_idempotency_unobserved` | Provider has no verified `payment-identifier` recovery contract; cannot enter the durable managed auto-routeable lane |
| `paid_canary_required` | Gate is live but delivery is not yet proven by AE |

### Retryable runtime/degradation

| Code | Runtime meaning |
|---|---|
| `target_unreachable` | Timeout/DNS/network failure; retry under bounded policy |
| `payment_required_missing` | Endpoint no longer presents a gate for this exact request |
| `terms_changed` | Fresh call-time challenge differs from the authorized fixed-price plan; no signature was created, so require re-inspection/authorization |
| `readiness_stale` | Probe/canary evidence expired |
| `revision_changed` | Probe completed against an old publication revision |
| `settlement_pending` | Broadcast occurred but finality is unresolved; reconcile, do not retry blindly |
| `provider_output_unavailable` | Paid request settled but output was absent/truncated/unusable; recovery required |

## Test matrix: prove every transition

| Area | Case | Expected transition/assertion |
|---|---|---|
| Source | Allowlisted Bazaar GET with complete bounded static contract | observed -> published unready; zero provider network calls |
| Source | Unknown facilitator/registry | refused `source_not_allowlisted` |
| Schema | Optional Bazaar example satisfies all required fields and is safe | may become the deterministic probe fixture without invented values |
| Schema | Bazaar example absent | retain `input_example_missing`; contract may continue, but no background probe until a separate fixture is admitted |
| Schema | ReadX-shaped `{}` with required `q` | retain `input_example_schema_mismatch`, ignore that example even if CDP validator says valid; contract may continue with a separately admitted fixture |
| Schema | External `$ref`/`$id` | refused `input_schema_invalid`; no network/file resolution |
| Secrets | `Authorization`, `Cookie`, `x-api-key`, token-like query/body value | refused or authenticated quarantine; never persisted/logged |
| Method | GET read candidate | automatic safe-to-probe lane |
| Method | POST search | never sent by background readiness; quarantined `effect_classification_required` until a controlled invocation lane exists |
| Method | PUT profile / PATCH / DELETE data official fixtures | never sent by background readiness; quarantined as external state change |
| Path | Valid route template + exact source path example | exact request built and identity remains template-based |
| Path | Traversal, encoded traversal, URL injection, missing path example | refused `route_template_invalid` / quarantined `path_example_required` |
| Network | Redirect to private/loopback/link-local address | blocked at every hop |
| Challenge | Exact admitted GET request returns 402 with canonical header | published unready -> gate observed |
| Challenge | 200/401/403/404/500 instead of 402 | no promotion; exact reason recorded |
| Challenge | x402 v1, malformed base64/JSON, oversized header | refused `payment_required_invalid` |
| Challenge | Resource URL, method, amount, asset, payee, network, scheme, flow mismatch | refused or `terms_changed`; no silent substitution |
| Challenge | Multiple accepts with one supported exact Base USDC lane | select and persist exact index/tuple; retain alternatives as source evidence only |
| Facilitator | `/supported` removes selected scheme/network | challenge may exist but Operation stays unavailable |
| Price | Catalog price differs from the current unexpired gate observation | network-free inspect presents the gate-observed fixed tuple; catalog value is not execution authority |
| Price | Execute replays exact unsigned request and fresh 402 differs from the authorized fixed-price tuple | `terms_changed` before signature; inspect/authorize again |
| Price | Dynamic tier changes amount | quarantine until inspect binds exact input to fresh terms |
| Signed offer | Valid signature + authorized signer + unexpired terms | stronger term evidence attached |
| Signed offer | Valid signature, unauthorized signer | quarantine `signed_offer_authorization_unverified` |
| Signed offer | Expired `validUntil` | stale; refresh challenge |
| Publication | Static admission passes but no probe/canary exists | canonical, inspectable, unavailable, not routeable |
| Gate | Matching gate observation but no paid canary | unavailable, not routeable |
| Canary | Exact paid GET settles, idempotency conformance passes, and output matches schema | gate observed -> routeable |
| Canary | Settlement succeeds, output violates schema | unavailable `paid_canary_output_invalid`; preserve payment receipt |
| Canary | Provider returns error after payment | invocation recovery path; do not label healthy |
| Idempotency | Same payment ID + same request fingerprint | cached/recovered result; no second payment/execution |
| Idempotency | Same payment ID + different fingerprint | 409/conflict; no cached cross-request result |
| Idempotency | Provider does not advertise/verify payment identifier | cannot become durable managed auto-routeable; quarantine `provider_idempotency_unobserved` |
| Settlement | `settlement_pending` with tx hash/network | pending reconciliation; no blind retry |
| Concurrency | Revision changes while probe/canary runs | record refused `revision_changed`; old evidence cannot activate new revision |
| Readiness | Current challenge unchanged before expiry | remains routeable |
| Readiness | Challenge disappears or terms drift | immediately non-routeable; stale/degraded |
| Revocation | Supplier withdraws | withdrawn and absent from current market |
| Revocation | Upstream registry row disappears but live route remains | degrade source provenance; do not erase solely from metadata disappearance |
| Recovery | Degraded route later returns exact challenge and passes new canary | new/current revision completes full path before routeability |

## Fit with the current Agentic Economy code

The current code already contains several correct pieces:

- external registry rows are stored as `source_metadata_only`; however, the current graduation action sends the source-derived request before completing Bazaar static admission, so that intention is not yet a safe authority boundary ([graduation probe](../../src/modules/market/registry-graduation.ts));
- Bazaar examples are now preserved only when they validate against the exact admitted schema ([Bazaar importer](../../src/modules/capability-supply/internal/publication-importer-x402-bazaar.ts));
- the discovered lane is intentionally limited to exact Base mainnet USDC ([discovery ingest](../../src/modules/capability-supply/internal/facilitator-discovery-ingest.ts));
- x402 readiness compares the live challenge's resource, scheme, network, asset, payee, and amount with the pinned Operation terms ([x402 readiness probe](../../src/modules/capability-supply/internal/readiness-probe-x402.ts));
- revision/target mismatches are refused when recording readiness ([readiness action](../../convex/capabilitySupplyReadiness.ts)).

The next gaps are substantive:

1. **Effects are being inferred as empty.** Discovered contracts currently write `dataUse: []` and `effects: []`, but Bazaar supplies neither. Empty must not mean “proven none.”
2. **x402 POST is probeable without the effect gate applied to other source kinds.** The current probe-target reader blocks effectful OpenAPI/MCP candidates but not x402, while official Bazaar examples prove that discovery declarations can represent updates and deletion ([probe target](../../src/modules/capability-supply/internal/graph/read-probe-target.ts)). No background readiness process may send POST, PUT, PATCH, or DELETE.
3. **A live 402 is treated as healthy readiness.** It proves gate readiness, not delivered-output readiness. Routeability should require a separate successful delivery/canary observation.
4. **Refusal detail is collapsed.** Registry graduation maps detailed Bazaar failures to `admission_refused`; operations needs the evidence-level codes above.
5. **Provider-level idempotency/offer evidence is not part of admission.** `payment-identifier` must be required for the durable managed lane. Offer/receipt signatures should be parsed, but signature validity must not be confused with authorization of that signer for the provider/resource.
6. **Source headers are correctly rejected, but secret scanning should cover all example values and names.** Special-casing one pagination key is insufficient.
7. **A missing example is currently too close to a terminal contract failure.** Preserve example diagnostics, but separate optional discovery examples from the independently admitted deterministic probe fixture.

## Recommended implementation sequence

The order is a safety dependency, not a convenience. Do not connect a new source to the current graduation action before phase 1 lands.

### Phase 1 — stop pre-admission network effects

- In `registry-graduation.ts`, parse and statically admit the Bazaar/source declaration **before** constructing or sending a request.
- Permit background network activity only when the admitted method is exactly `GET`, the target passes the public-target/redirect guard, and an independently admitted deterministic fixture exists.
- Make missing/malformed/unsafe Bazaar examples non-terminal diagnostics; they cannot populate the probe fixture automatically.
- Return structured refusal/quarantine codes instead of collapsing them to `admission_refused`.
- In `readiness-probe-x402.ts`, record a matching 402 as `gate_observed`, not `healthState: healthy` or delivery readiness.
- Required tests: official GET/POST/PUT/DELETE fixtures; assert zero network calls for every non-GET, invalid schema, unsafe target, missing fixture, and secret-bearing example; assert a 2xx background response is unhealthy/unexpected, not success.

### Phase 2 — add structured contract enrichment

Raw Bazaar metadata cannot truthfully supply AE's effect or data-use contract. Add a private provider/operator action such as `curateExternalOperationContract` that takes one source document digest and writes a separately digested enrichment revision containing:

- exact effect declarations using AE's bounded classes, authority and reversibility fields;
- one data-use declaration for every transmitted input pointer, including classification, execution phase, provider recipient and evidenced purposes;
- first-party evidence that the advertised exact price is input-independent for this revision; otherwise classify it `dynamic_terms_unsupported` and do not promise an exact inspect-time total;
- first-party provider terms/attestations or other named evidence refs for retention, secondary use and effect claims;
- curator/provider principal, decision time, policy version and expiry;
- the allowed input classifications for this Operation revision.

The action must reject empty arrays as proof of “none,” reject an enrichment whose source digest is stale, and compare-and-set the source/enrichment revision. GET supplies only an HTTP safety expectation; it does not prove no logging, retention, secondary use or external implementation effects. If evidence is insufficient, the row stays `QUARANTINED` with `effect_classification_required` or `data_use_terms_required`. For a first pilot, it is acceptable to admit only public-input GETs backed by provider terms; it is not acceptable to infer the missing facts.

Required tests: missing enrichment cannot publish; every transmitted pointer has a data-use declaration; source revision drift invalidates enrichment; empty effects/data use cannot mean verified none; provider-owned and AE-curated assertions retain distinct provenance; a changed enrichment creates a new Operation revision.

### Phase 3 — persist independent evidence and projection rules

- Add `capabilityPublicationGateObservations` and `capabilityPublicationDeliveryCanaries` with the identities and fields specified above.
- Keep source observations in `marketExternalRegistryEntries`; add `cdp_bazaar` only with bounded raw evidence/digest fields.
- Change qualification/projection so gate evidence and delivery evidence have independent TTLs. A gate refresh cannot renew a canary, and no `capabilityPublications.healthState` write alone can make an Operation routeable.
- Add one compare-and-set mutation that activates/degrades routeability only for the exact current revision and evidence digests.
- Required tests: old-revision evidence cannot activate a new revision; gate-only stays unavailable; expired canary degrades despite a fresh 402; concurrent source refresh/canary completion yields `revision_changed` rather than mixed evidence.

### Phase 4 — remove pinned challenges as signing material

- Keep onboarding `paymentRequiredJson` only as historical source evidence, or rename it so type-level APIs cannot pass it to the signer. Remove it as required signing input from `transport-adapters.ts` and `route-transport-x402-payment.ts`.
- Inspect-plan must remain network-free. It accepts the exact proposed input, shows the current unexpired gate-observation tuple, data use and effects, and returns an authorization envelope containing the exact input/request digest plus fixed-price tuple/digest and expiry.
- Execute must reconstruct the authorized unsigned request and send it once without payment. A free 2xx may be returned because this request is already buyer-authorized. A 402 must be decoded and compared field-for-field with the authorization envelope; only an exact match may be signed.
- Send at most one signed retry. Any drift returns `terms_changed` before signature. Any timeout or `settlement_pending` after signature enters reconciliation and never causes a blind retry.
- Bind HTTP method through the admitted source revision and request digest. Do not attempt to read a method from `PAYMENT-REQUIRED`, which does not contain one.
- Required tests: inspect sends zero provider requests; stale onboarding challenge is never signed; exact fresh challenge produces one signature and one paid retry; changed amount/payee/asset/network/scheme/resource/expiry produces no signature; unsigned 2xx inside the authorized invocation returns once; ambiguous paid result produces status recovery without a second provider effect.

### Phase 5 — add explicit onboarding-canary authority

- Add the private operator command and dedicated principal/grant/funding-account contract specified above. It must reserve the worst-case conformance budget and create the stable invocation/payment identifiers before dispatch.
- Run the GET-only output canary and bounded `payment-identifier` conformance sequence through the normal invocation, consequence-journal, ledger, receipt, and reconciliation paths.
- Persist the canary only by exact-revision CAS. A successful settlement with invalid output is a paid failure, not readiness.
- Required tests: absent/expired/over-budget canary grant causes zero signature and zero network; duplicate canary command returns the same invocation; a second settlement or failed 409 invariant fails conformance; revision change after dispatch cannot activate routeability; uncertain settlement is recoverable by invocation reference.

### Phase 6 — add demand-targeted CDP Bazaar sourcing

- Query exact capability categories and retain sanitized `accepts`, Bazaar declaration, extension set, source revision/`lastUpdated`, quality timestamps, query, fetched time, raw-response digest and sanitized-document digest.
- Do not bulk-import a “top 100” list and do not treat normalized Agentic Market/Treg rows as equivalent to raw facilitator evidence.
- Refresh source observations without invoking them. Static admission and background probing remain separate queued actions with separate authority.
- Required tests: source refresh performs only CDP reads; source rows remain `source_metadata_only`; credential/header examples are removed before persistence while the received-byte digest remains stable; normalized fields reproduce from the pinned sanitized artifact; changed source digest creates a new evaluation and cannot mutate an existing Operation revision in place.

### Phase 7 — pilot only an evidence-real market cell

The dated 2026-08-30 observations make SocialFetch a lead because its GET Twitter search advertises `payment-identifier`; Otto is a cheaper, more-used lead that presently lacks that extension, while Glim is POST and also lacks it. These are mutable source observations, not proven candidates. Before choosing one, check in the bounded sanitized CDP artifact (or content-addressed sanitized blob), both response digests, query, and fetched time, then rerun every gate. Do not fabricate a second comparable supplier or weaken admission merely to make the compare screen non-empty. The cross-harness phases 1–4 resume only when two suppliers independently reach the same routeability contract.

## Bottom line

The approach makes sense if “onboarding” means graduating evidence, not copying listings. The better model is:

> Bazaar tells AE what a provider says exists. A fresh 402 tells AE what the gate offers now. A controlled settled canary proves one technically delivered, schema-conformant result. Only that evidence combination creates technical routeability; immediate usefulness, outcome quality, and repeat allocation remain separate post-call evidence.

That preserves the single product loop while keeping x402 in its proper role: a payment and transport protocol beneath the Operation market, not the market's authority for provider identity, safety, usefulness, or buyer control.

## Primary sources

- [Agentic Economy product authority](../../PRODUCT.md)
- [x402 v2 core specification](https://github.com/x402-foundation/x402/blob/e398a9e5724542e5b2da37c953156159fb7171d2/specs/x402-specification-v2.md)
- [x402 HTTP transport specification](https://github.com/x402-foundation/x402/blob/e398a9e5724542e5b2da37c953156159fb7171d2/specs/transports-v2/http.md)
- [Bazaar extension specification](https://github.com/x402-foundation/x402/blob/e398a9e5724542e5b2da37c953156159fb7171d2/specs/extensions/bazaar.md)
- [Bazaar official examples](https://github.com/x402-foundation/x402/blob/e398a9e5724542e5b2da37c953156159fb7171d2/typescript/packages/extensions/src/bazaar/README.md)
- [Bazaar facilitator validation/extraction](https://github.com/x402-foundation/x402/blob/e398a9e5724542e5b2da37c953156159fb7171d2/typescript/packages/extensions/src/bazaar/facilitator.ts)
- [Bazaar resource-server enrichment](https://github.com/x402-foundation/x402/blob/e398a9e5724542e5b2da37c953156159fb7171d2/typescript/packages/extensions/src/bazaar/server.ts)
- [Official facilitator Bazaar example](https://github.com/x402-foundation/x402/blob/e398a9e5724542e5b2da37c953156159fb7171d2/examples/typescript/facilitator/advanced/bazaar.ts)
- [Dynamic price example](https://github.com/x402-foundation/x402/blob/e398a9e5724542e5b2da37c953156159fb7171d2/examples/typescript/servers/advanced/dynamic-price.ts)
- [Usage-based `upto` example](https://github.com/x402-foundation/x402/blob/e398a9e5724542e5b2da37c953156159fb7171d2/examples/typescript/servers/upto/index.ts)
- [Payment identifier extension](https://github.com/x402-foundation/x402/blob/e398a9e5724542e5b2da37c953156159fb7171d2/docs/extensions/payment-identifier.mdx)
- [Offer and receipt extension](https://github.com/x402-foundation/x402/blob/e398a9e5724542e5b2da37c953156159fb7171d2/specs/extensions/extension-offer-and-receipt.md)
- [CDP seller discovery and lifecycle](https://docs.cdp.coinbase.com/x402/seller/get-discovered)
- [CDP buyer discovery](https://docs.cdp.coinbase.com/x402/buyer/discover-services)
- [CDP read-only endpoint validator](https://docs.cdp.coinbase.com/api-reference/v2/rest-api/x402-facilitator/validate-x402-endpoint)
- [CDP Bazaar search API](https://docs.cdp.coinbase.com/api-reference/v2/rest-api/x402-facilitator/search-x402-resources)
- [CDP production payment schemes](https://docs.cdp.coinbase.com/x402/seller/production-configuration)
- [CDP client spend and ambiguity handling](https://docs.cdp.coinbase.com/x402/buyer/client-configuration)
- [HTTP safe-method semantics](https://www.rfc-editor.org/rfc/rfc9110.html#name-safe-methods)
