# Agree the vocabulary without merging different concepts

Type: grilling
Label: wayfinder:grilling
Status: resolved
Parent: ../map.md
Blocked by: 01

## Question

Which proposed terms become AE's canonical language, and which apparent synonyms
must remain distinct? Resolve with Joel, one question at a time, using reference
facts and concrete examples. Tool is tentative; do not treat it as approval of
all definitions. Include spending policy versus one-off approval, Quote versus
Call, generic action execution versus a paid tool call, and Provider versus
Seller. Settle catalogue naming without inventing new parent records.

Use the existing UBIQUITOUS_LANGUAGE proposal as the discussion asset. Record
actual answers, update accepted definitions in CONTEXT as they land and reconcile
affected PRODUCT terminology. The ticket answer owns decision rationale; CONTEXT
owns accepted definitions. Migration-specific mappings belong in the plan.

## Answer

Resolved by Joel's accepted `Mature vocabulary refactor — implementation plan`
on 2026-09-05. The whole-platform implementation uses the following canonical
terms and preserves the boundaries in the question:

| Existing concept | Accepted AE term | Boundary retained |
| --- | --- | --- |
| Business Principal | Customer | Purchasing person or organisation; generic identities, businesses and accounts are not blanket-renamed. |
| Agent Principal | Agent | Authorised software actor; credentials remain replaceable access evidence. |
| Callable Operation / Operation revision | Tool / Tool version | The callable supply unit and its revision; Offering, Publication, Listing, Source and portfolio Service remain distinct. |
| Supplier | Provider | AE-owned performing party; Seller and payment recipient remain separate, and upstream protocol seller names remain protected. |
| Standing Mandate | Spending policy | Reusable permissions and limits; funding and a request-specific authorization are not a policy. |
| Request-specific mandate | Request authorization; Approval for a person's recorded authorization | One consequential recorded authorization is not a reusable policy. |
| Commitment | Quote | Binds exact inputs, price/terms, permissions, expiry and retry conditions; it is not a Call. |
| Purchased Invocation | Call | One accepted Tool use with the existing effect identity; attempts and generic Action execution remain distinct. |
| Generic Action Invocation | Action execution | Administrative/runtime execution; it is not a purchased Call. |
| Suggested continuation | Suggested next action | The safe permitted transition and its durable conditions. |
| Commercial closure | Purchase resolution / purchase status | Terminal state derived from one purchase; no second purchase object. |
| Outcome evidence | Outcome records | Attributed observations with uncertainty and source provenance. |

Authority modes and AE-owned scope values are also accepted implementation
targets: `inspect_only` -> `read_only`, `approve_each` -> `approval_required`,
`bounded_mandate` -> `spending_policy`, `full_yolo` ->
`unrestricted_test_only`, `mandate_eligible` -> `policy_eligible`, and
`market_operations:invoke` -> `market_tools:call` with the corresponding
`customer_requests:` mode suffixes. These are not compatibility exceptions.

The accepted direction is a mature Australian Locus/Nevermined/Whop-informed
platform, not a new product model. Calls use existing supported authorization
paths; a standing spending policy is not made a universal prerequisite where a
supported request authorization already applies. Funding, authority, purchase,
delivery, settlement, payment status and Provider obligation stay separate.
Opaque identifier prefixes, canonical hash/signature material, external
financial namespaces and third-party protocol values remain byte-stable.

`CONTEXT.md` owns the accepted definitions; the selected implementation plan
owns old-to-new mappings, file/table/contract scope and proof. The proposal is
retained as a dated discussion artifact, not a second authority.

### Decision evidence

- Accepted plan: `docs/designs/vocabulary-rationalisation.md`.
- Accepted glossary: `CONTEXT.md`.
- Discussion asset retained for history: `UBIQUITOUS_LANGUAGE.md`.
- Implementation issue preparation and sequencing: `37-prepare-implementation-issues.md`.

No application, schema, client or database change is performed by this decision
ticket.

## Closure evidence

- [x] Joel's whole-platform scope and fixed term mappings are recorded.
- [x] Generic IAM, commercial-role, financial, portfolio and external-protocol
      distinctions are explicitly preserved.
- [x] Call authorization is not incorrectly made universally dependent on a
      standing policy.
- [x] The accepted plan and glossary own implementation mapping and definitions
      respectively; no parallel product vocabulary is approved.
