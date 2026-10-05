> **Archived 5 October 2026.** Dated evidence or proposal; not a current work queue or approval. See the [archive index](../../../README.md) for its successor and remaining limits.

# Domain language

**Date:** 29 September 2026
**Checkout:** `d104a8009`
**Lens:** domain model and vocabulary. Where two names are one record, where one name hides two records, and which twelve nouns a rebuild should speak.

## Answer

The callable thing is a **Tool**, and one accepted use of it is a **Call**. The UI and the charter already say that. The stored identity does not. A public tool ref is an `operation:v1:` digest whose `operationId` is `capability:${capabilityId}`. The signed-in tenancy is an **Account**, and the admin UI stores that same ref as a workspace. Purchase status is a reading of a Call, not a second transaction.

Twelve nouns cover the collisions in this brief: Account, Business, Provider, Agent, Key, Grant, Offering, Tool, Publication, Contract, Quote, Call. Every other name below is a field of one of those, a UI label, or a homonym that has to keep its spelling.

## How the counts were taken

Tokens are whole words after splitting camelCase, PascalCase, snake_case, and kebab-case. `toolRef` counts as tool. `callback` does not count as call. `operational` does not count as operation.

| Corpus | What was counted |
| --- | --- |
| Code | Identifier tokens in non-test `.ts` / `.tsx` under `src`, `convex`, `packages`, and `tools`. Comments are excluded. Declarations are included. Exact anchor names were counted again across the 2,340 non-test files in that set. |
| UI | String literals and JSX text in components, routes, content, navigation, view-models, `packages/cli`, and `tools/ae`. A string counts when it has whitespace or is a short label. Import paths are excluded. |
| Charter | Word tokens in `CONTEXT.md`, `PRODUCT.md`, `README.md`, and `docs/glossary.md` only. |
| Tests | Identifier tokens in `tests/` and `*.test.ts` / `*.tsx`. Shown so a rename sees the fixture surface. Tests do not choose the noun. |

A wider markdown crawl (111 files, including this review series) repeats the same words and is not used below. About 878 of the tool identifier tokens sit in `tools/dev` and `tools/release` rather than the product. Heuristic sense tags were only a check. Where they were muddy (`source`, `key`, `route`, `binding`, `contract`), the exact identifier counts are the evidence.

## Inventory

| Noun | Code | Code files | UI | UI files | Charter | Tests |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| tool | 10,778 | 753 | 970 | 211 | 118 | 9,565 |
| source | 8,532 | 733 | 218 | 69 | 47 | 6,768 |
| call | 7,992 | 584 | 622 | 156 | 107 | 8,259 |
| provider | 6,983 | 702 | 736 | 149 | 89 | 6,567 |
| principal | 6,295 | 513 | 7 | 6 | 18 | 6,494 |
| key | 5,783 | 810 | 176 | 42 | 9 | 4,934 |
| account | 5,575 | 454 | 212 | 75 | 42 | 5,916 |
| grant | 4,708 | 231 | 14 | 8 | 12 | 4,402 |
| offering | 4,722 | 276 | 13 | 6 | 9 | 3,896 |
| agent | 4,588 | 402 | 411 | 116 | 82 | 4,519 |
| business | 4,467 | 473 | 108 | 41 | 26 | 4,142 |
| publication | 3,707 | 209 | 38 | 21 | 15 | 2,470 |
| binding | 3,489 | 275 | 12 | 8 | 0 | 3,510 |
| operation | 3,473 | 432 | 37 | 18 | 4 | 3,738 |
| route | 3,004 | 441 | 46 | 22 | 7 | 3,570 |
| capability | 2,932 | 324 | 25 | 15 | 18 | 3,685 |
| contract | 2,400 | 293 | 34 | 24 | 21 | 1,829 |
| execution | 1,761 | 161 | 31 | 14 | 24 | 1,403 |
| service | 1,527 | 217 | 104 | 25 | 67 | 1,963 |
| workspace | 881 | 121 | 188 | 60 | 0 | 894 |
| endpoint | 786 | 148 | 74 | 27 | 13 | 807 |
| listing | 397 | 70 | 56 | 31 | 8 | 323 |
| purchase | 252 | 41 | 57 | 17 | 72 | 157 |
| caller | 193 | 72 | 14 | 6 | 8 | 479 |

The UI has already picked Tool (970) over offering (13), operation (37), and capability (25), and Call (622) over purchase (57) and execution (31). The charter still says purchase 72 times and service 67 times, because those words carry the commercial story. Workspace is a UI and code word (188 copy tokens) that the four charter docs never use. Principal is the reverse: 6,295 code tokens and 7 UI tokens, against Agent at 411 in the UI.

Anchor identifiers in non-test product code:

| Identifier | Occurrences | Files | What it actually is |
| --- | ---: | ---: | --- |
| `toolRef` | 2,121 | 405 | Public id of a Tool. Format `operation:v1:`. |
| `callRef` | 1,905 | 254 | Id of a Call. |
| `businessId` | 1,717 | 294 | Row in `businesses`. |
| `principalRef` | 1,381 | 259 | IAM principal, human or agent. |
| `accountRef` | 1,315 | 245 | Row in `accounts`. |
| `grantRef` | 912 | 155 | Delegation or access grant. |
| `operationKey` | 769 | 162 | Idempotency key. Not a Tool. |
| `principalId` | 722 | 181 | Second principal spelling, including agent-access rows. |
| `offeringRef` | 678 | 122 | Catalogue offering (`businessOfferings`). |
| `publicationRef` | 646 | 133 | Admission record for a Tool version. |
| `providerRef` | 425 | 123 | Upstream performer on a connection. |
| `offeringId` | 421 | 86 | Capability offering. Not `offeringRef`. |
| `bindingId` | 410 | 90 | Transport binding (endpoint plus authority). |
| `capabilityId` | 323 | 89 | Contract id. Fed into the Tool's `operationId`. |
| `executionRef` | 322 | 45 | Action-execution control id. Not a Call. |
| `sourceKind` | 287 | 87 | Upstream document kind (OpenAPI, MCP, x402, and the AE envelope). |
| `sourceRouteRef` | 200 | 48 | Selected operation inside a source document. |
| `operationId` | 193 | 57 | Tool identity alias, and an OpenAPI field name. |
| `endpointUrl` | 187 | 80 | URL on a transport binding. |
| `bindingRef` | 165 | 33 | Mostly an identity or authority binding, not `bindingId`. |
| `routeable` | 121 | 48 | Derived readiness posture. |
| `agentPrincipal` | 121 | 34 | An Agent spelled as a principal. |
| `workspaceRef` | 44 | 12 | Typed and checked as `AccountRef`. |
| `workspaceName` | 43 | 8 | Name stored on account onboarding. |
| `listingTier` | 26 | 11 | Derived `reviewed` or `listed`. Not a row. |
| `purchaseResolution` | 21 | 9 | Outcome row keyed by `callRef`. |
| `listingRef` | 9 | 7 | Projection identity, not a supply table. |

Navigation is the same collision on one screen. The Tools item is labelled Tools, routed to `/owner/operations`, grouped under `workspace`, and keyworded with operations, offerings, and provider:

```71:77:src/lib/navigation/app-navigation.ts
  {
    id: 'tools',
    label: 'Tools',
    to: '/owner/operations',
    group: 'workspace',
    keywords: ['operations', 'supply', 'provider', 'providers', 'offerings', 'publish', 'host', 'api', 'monetize', 'seller'],
    title: 'Tools | Agentic Economy',
```

Activity is the label, `calls` is the id, `/activity` and `/calls` both resolve, and the keywords include `executions`. Agents live at `/agent-access` with keywords `principal` and `keys`. Settings keywords are `account`, `team`, and `workspace`. Earnings shares the Tools URL (`/owner/operations#earnings`).

## Two names, one record

### Tool, Operation, and Capability

`CONTEXT.md` already maps the historical name Callable Operation to Tool. The id encoding was left behind. `PublicToolRef` is produced as `operation:v1:` plus a digest, and the id that goes into it is `capability:${capabilityId}`.

```6:23:src/modules/capability-supply/internal/public-tool-ref.ts
export function createPublicToolRef(input: Readonly<{
  operationId: string
  publicationRef: string
  publicationRevision: number
  contractRef: CapabilityContractRef
}>): PublicToolRef {
  const material = {
    operationId: input.operationId,
    publicationRef: input.publicationRef,
    publicationRevision: input.publicationRevision,
    contractRef: input.contractRef,
  } as StableHashValue
  return `operation:v1:${canonicalDigest(material).slice(7)}` as PublicToolRef
}

export function capabilityToolId(capabilityId: string): string {
  return `capability:${capabilityId}`
}
```

Publish then requires the stored `toolRef` to equal that operation ref. A mismatch is `registration_changed`. The admitted-tool constructor in the same module throws `admitted_operation_ref_invalid` when that operation id is empty (`createAdmittedToolRef` in `public-tool-ref.ts`).

```332:343:src/modules/capability-supply/internal/publication/publish.ts
  const expectedPreviousOperationRef = createPublicToolRef({
    operationId: capabilityToolId(publication.capabilityId),
    publicationRef: publication.publicationRef,
    publicationRevision: publication.revision,
    contractRef: {
      capabilityId: publication.capabilityId,
      version: publication.version,
      contractDigest: publication.contractDigest,
    },
  })
  if (publication.toolRef !== expectedPreviousOperationRef) {
    return { kind: 'refused', reason: 'registration_changed' }
```

Of 2,932 capability identifier tokens, 2,341 are the `capability-*` module prefix (`capabilityCalls`, `capabilityPublications`, and the rest). `capabilityId` (323 occurrences) is the contract id inside the Tool. The module folders `capability-supply`, `capability-execution`, `capability-contract`, and `capability-contract-registry` are that prefix on disk. UI copy that still says capability is mostly operator sentences ("Capability contract registered", "Capability publication published").

OpenAPI uses the same collapse in the other direction. Provider copy says Agentic Economy reads OpenAPI operations as Tools (`src/content/reason-copy.ts`).

### Workspace and Account

Every checked workspace ref is an account ref. The admin call view drops the row unless `workspaceRef` parses as an `AccountRef`:

```23:25:src/components/ae/admin/call-object/call-object.view-model.ts
    || (view.toolRef !== null && !isPublicToolRef(view.toolRef))
    || (view.workspaceRef !== null && !isAccountRef(view.workspaceRef))
    || (view.agentRef !== null && !isPrincipalRef(view.agentRef))) return null
```

Admin links go to `/admin/workspaces/${workspaceRef}`. The route file is `src/routes/_operator/admin.workspaces.$accountRef.tsx`. Onboarding stores `workspaceName` on the account completion row (`interactiveOnboardingCompletionValue` in `src/modules/principal-account/account/convex-schema.ts`). "Create provider workspace" starts a provider identity for that same tenancy (`src/components/ae/offerings/ProviderIdentityForm.tsx`).

### Call, purchase, and market execution

`capabilityCalls` is the record (`callRef`, 1,905 occurrences). `purchaseResolutionRecords` is a second table indexed `by_callRef`. The screen label "Purchase status" is a projection of the Call (`projectCallSummaryPurchaseStatus`). The charter says purchase 72 times because `CONTEXT.md` uses it for the commercial outcome. That outcome does not have its own execution id.

The Activity keywords use `executions` for this same destination. `executionRef` (322) is a different ledger: `action-execution` controls, attempts, and history. Those runs are operator and runtime actions. They need a name that cannot be read as a paid Call.

### Agent, principal, and caller

The UI says Agent (411) and almost never principal (7). The tables say principal (`principalRef` 1,381, `principalId` 722, `agentPrincipal` 121). The admin call object parses `agentRef` with `isPrincipalRef`. `agentAccessPrincipals` is a second principal table, keyed by `principalId`, beside `principals`.

Caller is the actor on this request (193 code tokens, 14 in copy). The copy already says "Caller Agent". There is no product `callerPrincipal` outside tests. A caller is an Agent or a member for one request, not a row of its own.

### Listing and the public Tool

`listingTier` (`reviewed` or `listed`) is derived from publication authority and is not stored. `ListingProjection` is a read model that can point at a directory route, an admitted `toolRef`, or a catalogue offering (`src/modules/registry/internal/listing-projection.ts`). The provider FAQ uses listing as the page you fill in for one Tool:

```15:17:src/content/provider-copy.ts
      question: 'Can I onboard my Tool today?',
      answer:
        'Add Tool starts the listing for one Tool. The requirements on this page are what that listing needs. Listing a Tool does not buy one.',
```

The same FAQ says a Bazaar listing does not publish the Tool here. Listing is a view and a tier. It is not a third stored supply record next to Publication.

### Service, when it means a Tool

The charter says "paid tools and services", and the market journeys say "compare suitable services". Buyer copy says "Find an outside service". The callable record behind that sentence is a Tool. `serviceArea` is a catalogue field, `serviceFee` is a fee, and `callService` is a function. Those stay qualified. Bare service should stop naming supply.

## One name, two records

Collapsing these would merge rows the schema keeps apart.

### Offering

`offeringRef` (678) is `businessOfferings`: the provider's catalogue item, with revisions and access paths. An access path may be `human_request` or `external_operation`. The portfolio says so in the UI: "Catalogue-only offering" and "Human-request offering · not an admitted Tool" (`src/components/ae/shared/ProviderPortfolio.tsx`).

`offeringId` (421) is `capabilityOfferings`: a registration against `capabilityId`, version, and `contractDigest`. Its optional origin is `kind: 'catalog_offering'` plus an `offeringRef` (`src/modules/capability-supply/internal/convex-schema.ts`). Same English word, two ids, and a pointer from the second back to the first. UI copy uses offering 13 times, so the catalogue noun is almost invisible beside Tool, and the two rows get discussed as one thing.

### Operation

`operationKey` (769) is command idempotency, including publish. `operationId` (193) is the Tool identity alias above, and it is also the OpenAPI field. `operationName` is a command name such as `republishPreparedCapability`. Replacing every "operation" with "tool" would rewrite idempotency keys.

### Key

The screen "Agent keys" (`/owner/settings/agent-keys`) is the bearer secret. In identifiers, `idempotencyKey` and `operationKey` dwarf `apiKey`. An unqualified key is not a credential.

### Binding

`bindingId` is `capabilityTransportBindings`: endpoint URL, adapter, and connection authority for one offering and contract. `bindingRef` is mostly an external-identity, Clerk-organisation, Stripe, or authority binding. Invitation copy talks about an "organization binding" on a workspace. That is not a transport binding.

### Source

`sourceKind`, `sourceDigest`, `sourceRevision`, `sourceRouteRef`, and `sourceDescriptorJson` are the upstream document a Publication was admitted from. Most of the 8,532 source tokens are ordinary English for "where this fact came from" (`sourceHash` on catalogue rows, `sourceWrite`, and similar). The domain object is the qualified source document.

### Route

`createFileRoute`, `Route`, and `routeTree` are the TanStack router. That is why the supply desk's URL can be `/owner/operations` without naming a supply record. `sourceRouteRef` is the selected upstream operation. `routeable` is a readiness posture. Permission copy also says "route x402 payment". Three mechanisms share the word.

### Contract

`contractDigest` and `contractRef` (`capabilityId`, version, digest) are the Tool version's schema and terms. `CALL_ROUTE_CONTRACT`, files named `*.contracts.ts`, and "route contract" are module boundaries. The filename habit is not a commercial contract.

### Business, Account, and Provider

`businesses.owningAccountRef` is a public profile (slug, trust, catalogue) owned by an account. `providerRef` sits on a connection and can name an upstream host that is not that profile. Facilitator discovery uses the synthetic `provider:facilitator-discovery`. Credit and grants hang off the account.

Buyer copy uses Business for the account holder: "The Business does not have enough credit for this Call" and "Ask the Business owner" (`src/content/reason-copy.ts`). That speaker is the customer role on the Account. Provider is the party that performs the Tool. Connection errors that say the connection "does not match the Provider Business" are checking the two against each other, which only works if they stay distinct.

### Grant

`authorityDelegationGrants` is the versioned, budgeted delegation: actor principal, subject principal, scopes, and budget (`DelegationGrant` in `src/modules/authority/delegation/contracts.ts`). `agentAccessGrants`, together with the spending-policy digest, is the permission a customer edits. The UI phrase "Spending policy" (24 copy hits) is the label for that grant. `agentAccessOAuthGrants` is the OAuth protocol object. OAuth `grant_type` is not the spending record.

### Principal

`principalRef` is the IAM row for a person or an Agent. "Principal reseller" in the charter is Agentic Economy's commercial role. One funding string uses "AUD principal" for an amount. The product actor is Agent. The IAM row can keep the name principal inside identity storage. Outside that storage, principal-as-Agent makes people and agents the same noun. The commercial role and the monetary use need their own qualifiers.

### Execution

`executionRef` is the action-execution ledger. The worker that runs a Call is a different path. UI phrases such as "before execution" and "cannot execute paid tools" use the verb for both. The noun Execution should not sit beside Call.

## Twelve nouns

| # | Noun | The record | What loses peer status |
| --- | --- | --- | --- |
| 1 | **Account** | Tenancy: members, agents, credit, grants, calls. | Workspace. `/admin/workspaces/$accountRef` and `workspaceName` are this record. |
| 2 | **Business** | Public profile owned by an Account: slug, trust, catalogue. | Buyer-side "Business" in credit and approval copy. That speaker is the Account owner. |
| 3 | **Provider** | Party that performs a Tool. A Business that publishes acts as a Provider. `providerRef` names this party on a connection, including an upstream host with no Business row yet. | Seller and payee as extra organisation types. They are roles of the Provider or of Agentic Economy. |
| 4 | **Agent** | Durable machine actor for an Account. Replacing a Key does not replace the Agent. | Principal, as a product name for this actor. Caller, as a stored identity. A human member is not an Agent. |
| 5 | **Key** | Bearer secret issued to an Agent. | Idempotency keys and `operationKey`. Those keep the word idempotency. |
| 6 | **Grant** | Versioned permission for an Agent to buy through an Account: scopes, tools, limits, generation. The screen label stays Spending policy. | Mandate and authority mode. OAuth keeps `grant_type` as a protocol field. |
| 7 | **Offering** | Provider-authored catalogue item only (`offeringRef`): name, summary, category, price story, access path. A human-request offering is not yet a Tool. | `offeringId` on `capabilityOfferings`. That registration becomes part of the Publication. |
| 8 | **Tool** | One versioned callable unit: inputs, outputs, price, terms, readiness. The public id may stay the opaque `operation:v1:` string. | Callable Operation, capability-as-a-product, endpoint-as-a-product, and service-as-something-an-agent-calls. `capabilityId` is this Tool's contract id. |
| 9 | **Publication** | Sealed admission of one Tool version: disposition, authority mode, readiness, source document, transport. | Listing as a stored product. Listing tier and the public listing page are projections of a Publication. A Bazaar listing stays an external candidate, not this row. |
| 10 | **Contract** | Schema and terms digest of a Tool version (`contractRef`: id, version, digest). | `*.contracts.ts` files and route-handler "contracts". Leave those filenames until a change already has those files open. |
| 11 | **Quote** | Expiring price and terms for one Account, Agent, Tool version, and input. | A price estimate, a funding quote, or an upstream quote. Upstream quotes keep the qualifier Supplied. |
| 12 | **Call** | One accepted use of a Tool under a Quote. Attempts, output, charge, delivery, and recovery share this id. | Purchase as a second record. Purchase status and purchase resolution stay a label and a `callRef` projection. Action execution keeps `executionRef` and drops the bare noun Execution. |

Fields, not extra nouns:

- The **source document** on a Publication (`sourceKind`, digest, revision, descriptor). Bare "source" stays ordinary English.
- The **source route** inside that document (`sourceRouteRef`), the selected upstream operation.
- The **binding** on a Publication (`bindingId`): endpoint URL plus the authority used to call it. Clerk and Stripe bindings stay qualified.
- **Endpoint**, the URL on that binding. An x402 URL is a candidate until admission makes it a Tool.
- **Listing**, meaning `ListingProjection` and `listingTier`.
- **Charge**, payout, and credit. They are money words outside this collision set.

Quote already means one thing in code and UI, so it takes a slot. Without it, purchase and execution get reused for the decision that happens before a Call.

## What to change first

The smallest cut is the one the UI has already made, applied to ids and names, without merging rows that are actually different.

1. New code calls the callable unit a Tool. Keep the `operation:v1:` spelling as an opaque id. Do not rename `operationKey`.
2. New screens call the tenancy an Account. Workspace routes and `workspaceRef` are that Account. Leave Clerk's organisation id alone.
3. Purchase resolution and "purchase status" point at `callRef` only. Do not add a purchase id.
4. Keep `offeringRef` as Offering. Fold `offeringId` into Publication so the catalogue word occurs once.
5. Keep `executionRef` inside action-execution. Stop using Execution as the name of a Call.
6. In buyer copy, say Account owner where the text now says Business owner for credit, grants, and approval. Reserve Business for the public profile and Provider for the performer.

The folders `capability-*`, `principal-account`, and `workspace-*` can take the twelve nouns when those areas are next edited. A repo-wide spelling pass is unsafe. `operationKey`, OpenAPI `operationId`, TanStack `Route`, React `Provider`, the Stripe account, and `*.contracts.ts` are homonyms with live meanings.
