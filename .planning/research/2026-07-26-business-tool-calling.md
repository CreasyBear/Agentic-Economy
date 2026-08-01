**Owner:** Joel Chan
**Status:** Active
**Maturity:** Current evidence
**Question:** Can an external agent tool-call a named business on AE today, and what is the smallest honest path to it?
**Decision affected:** None yet — proposes a new decision row and an ADR
**Evidence cutoff:** 2026-07-26
**Review by:** 2026-08-09
**Supersedes:** None
**Superseded by:** None

# Business tool calling

Framing under evaluation: *AE hosts business endpoints that let people query the
business. AE lets people tool-call businesses.* A business is a set of callable
tools; an agent calls them.

Evidence class throughout: **source inspection plus labelled local execution**
against `vite dev` on `127.0.0.1:3020` with a live Convex dev deployment and
seeded development data. No hosted, provider, or customer evidence.

## What an external agent meets today

**OBSERVED.** Discovery is genuinely good. Live, all 200:

| Surface | Owner |
|---|---|
| `/.well-known/ucp` | `src/routes/[.]well-known/ucp.ts:13-25` |
| `/{slug}/ucp` | `src/routes/$slug.ucp.ts:17-39` |
| `/api/businesses`, `/api/businesses/search`, `/api/businesses/{slug}` | `src/routes/api.businesses*.ts` |
| `/llms.txt`, `/SKILL.md`, `/sitemap.xml`, `/robots.txt` | `src/modules/discovery/internal/discovery-files.ts` |
| `/api/v1/requests/schema` | `src/routes/api.v1.requests.schema.ts:8-20` |

**OBSERVED.** Then it stops, at three walls in sequence:

1. **The per-business manifest carries no tools.** `/{slug}/ucp` emits identity,
   offering facts, access paths and support booleans
   (`src/modules/discovery/internal/offering-manifest.ts:11-42`). No action id,
   no input schema, no invocation URL. The site manifest's own boundary field
   says it plainly: *"Listing endpoints publish business facts; they do not
   select or execute routes."*
2. **The only action path is site-level and closed.** `POST /api/v1/requests`
   returns `{"kind":"refused","reason":"authentication_required"}` (HTTP 401)
   without a Clerk API key carrying scope `customer_requests:create`. There is
   no self-serve agent onboarding, so a cold agent cannot begin.
3. **Nothing is routeable anyway.** Across the 50-business page,
   `aeSupportedAction` = 0 and `integrated` = 0; every business sits at floor
   trust tier `claimed`; one publishes a price.

**INFERRED.** The Customer Request API is Request-shaped, not business-shaped.
An agent cannot say "call tool X on business Y"; it must open a Request and let
AE route. That is a different product from the framing above.

## The machinery already exists

**OBSERVED.** This is the important finding. The pieces are built and unwired:

| Piece | Where | State |
|---|---|---|
| Action descriptor with Zod input/output schema, `surfaces`, `invocationContract` | `src/modules/common/action.ts:101-205` | exists |
| `describeActionForAgent` → `inputJsonSchema` / `outputJsonSchema` | `src/modules/common/action.ts:258-273` | exists, **no public route calls it** |
| `actionToOpenRouterTool` → OpenAI function format | `src/modules/answer/internal/action-to-tool-spec.ts:7-30` | exists, internal model only |
| `resolveActionContract` → consequence class, authority requirement, retry class | `src/modules/common/action.ts:222-243` | exists |
| Enumerable action registry | `src/modules/actions/index.ts:13-70` | exists, not HTTP-reachable |
| Published operations carrying exact schemas | `src/modules/action-invocation/dynamic-published-contract.ts:150-178` | exists, deliberately `surfaces: []` |
| Per-business manifest route | `src/routes/$slug.ucp.ts:17-39` | live |

**OBSERVED.** `inquiry.submit` (`src/modules/inquiries/inquiry.actions.ts:197-272`)
is a real, schema-complete, consequential business action that **already
declares `surfaces: ['agentJson']`** and carries a full `invocationContract`
(consequence class `communication`, authority requirement `principal`, retry
class `attributable_retry`, expected evidence, invalidation conditions). Its
input schema already accepts a slug-bound target:
`{ businessSlug, serviceSlug, capabilityKind }`
(`src/modules/inquiries/inquiry.functions.ts:44-69`).

**INFERRED.** The framing is not a pivot. It is wiring existing parts and
admitting supply. Registration is metadata; HTTP reachability is route-by-route,
and no route was ever written for the agent surface.

## Defect found and fixed on the way

**OBSERVED.** The machine manifest was advertising a channel the route refuses.
`plumbing-demo` has no admission, yet `/plumbing-demo/ucp` published
`{"channel":"ae_inquiry","disclosure":"Use the inquiry form for a first contact."}`
while its human page said *"No way to get started has been published for this
offering."* The human page runs `projectPublicInquiryAvailability` /
`projectPublicInquiryOfferingSupply`; the machine surfaces bypassed both.

Fixed: `buildOfferingDiscoveryManifest` now takes `inquiryAdmitted` and mirrors
the human projection — the AE inquiry path is withdrawn when the route would
refuse, and surviving human channels are described by their own channel.
`readPublicOfferingDiscoveryManifest` performs the same admission read the
business page performs. Unknown admission fails closed.

Live after the fix, human page and manifest agree for all three probes:
`plumbing-demo` → `accessPaths: []`; `joondalup-rapid-plumbing` and
`fremantle-coastal-electrical` → phone with *"Call the business directly."*

**OBSERVED.** Joondalup is **not** admitted, contrary to an earlier session note
that described it as admitted. Its human page already said *"Call the business
directly."* The manifest now matches.

## Slice — built

Decision taken by the owner: **keyed**, not public. Built on 2026-07-26.

1. **`tools[]` on `/{slug}/ucp`** — `src/modules/business-tools/internal/descriptors.ts`
   projects `inquiry.submit` through the existing `describeActionForAgent` and
   `resolveActionContract`. Carries `prepareInputJsonSchema`,
   `invokeInputJsonSchema`, `outputJsonSchema`, `consequenceClass`,
   `authorityRequirement`, `contractVersion`, and the bound target. Gated on
   the same `inquiryAdmitted` fact. Descriptors are built by the caller and
   passed in, so `offering-manifest.ts` stays a pure projection and the action
   graph never enters a Convex-reachable discovery module.
2. **`expectedDigest` resolved as prepare-then-commit.** `POST
   /{slug}/tools/{toolId}/prepare` returns the exact canonical bytes and their
   digest; the caller commits by echoing it. This preserves the guard's meaning
   — a caller cannot send what it never saw — without asking an agent to
   reimplement JCS canonicalization. It mirrors the human "Confirm what will be
   sent" page, which renders the same canonical field rows.
3. **Keyed.** `BUSINESS_TOOL_AGENT_SCOPE = 'business_tools:invoke'`, distinct
   from the Customer Request scope. `authenticateCustomerRequestAgent` gained a
   `requiredScope` parameter rather than growing a second auth implementation.
   Auth is checked before tool identity and before any source read, so the
   endpoint is not an enumeration oracle for which businesses are admitted.
4. **The business is named by the URL, never the payload**, so a key holder
   cannot aim a prepared call at a different business.
5. **Advertised** as `businessTools` on `/.well-known/ucp`.

## Supply unlocked

**OBSERVED.** `devSeedActor` carried no `emailHash`, so
`toResolvableOwnerRecipient` (`convex/inquirySourceStateMappers.ts:90-96`)
yielded nothing and **every** seeded business failed admission on
`recipient_unresolvable`. One field. Tool exposure went **0/50 → 50/50**.

**OBSERVED.** With admission passing, the next failure downstream became
visible: the inquiry submit returned `inquiry_source_unavailable`, a catch-all
wrapping a thrown error. Root cause was missing deployment configuration, not
source — `AE_INQUIRY_ACCESS_SECRET`, `AE_GOVERNED_SEND_INTEGRITY_SECRET` and
`AE_INQUIRY_RECEIPT_KEK` were unset on the dev Convex deployment, and
`AE_SOURCE_WRITE_SECRET` was unset locally while set remotely. Provisioned in
the dev deployment and aligned locally.

**OBSERVED.** A first contact then completed end to end against
`fremantle-emergency-plumbing`, redirecting to
`/t/inquiry_thread:hash:03a03257` with *"Queued for business delivery"*. This is
the first working conversion event observed in this environment.

`inquiry_source_unavailable` collapsing three distinct configuration faults into
one retryable message is worth narrowing; it cost most of the diagnosis.

## Evidence ceiling

- Discovery, descriptor projection, admission gating and every refusal path are
  **verified live** against the dev deployment.
- The **keyed happy path is not hosted-verified**: minting a Clerk API key with
  the new scope was out of reach here. It is covered by
  `tests/unit/server/business-tool-api.test.ts` (5) with injected
  authentication, and it delegates to `submitPublicInquiryServer` — the exact
  function the human form used for the verified send above.
- Development seed data throughout. No hosted, provider, or customer evidence.

## Open questions

- **UNKNOWN.** Whether an issued Clerk key can carry `business_tools:invoke`
  without further Clerk configuration. Next proof: mint one and run
  prepare → commit over HTTP.
- **UNKNOWN.** Whether the dev Convex secrets above should be committed to a
  documented setup step; today a fresh clone reproduces the same dead end.
- **HYPOTHESIS.** Exposing one genuinely callable business tool is worth more
  than any further work on the consumer chat surface. *Falsifier:* an external
  agent, given only `/.well-known/ucp`, completes a first contact against a real
  business without human help. *Owner:* Joel. *Review by:* 2026-08-09.
