# Copy Map — where copy lives and how it is managed

**Status:** active register (2026-08-08). Companion to `.planning/BRAND.md` (voice authority).
Inventory sources: `history://HumanCopyInventory`, `history://MachineCopyInventory` (full tables).

## Category rebaseline — 2026-08-08

The current category and product language is authoritative in
[`PROJECT.md`](PROJECT.md), [`VISION-conceptual-map.md`](VISION-conceptual-map.md),
[`wayfinder/MAP.md`](wayfinder/MAP.md), and the
[Agent Services Market category thesis](research/2026-08-08-agent-services-market-category-thesis.md):
Agentic Economy is the market and controlled transaction layer where authorized
agents discover, buy and invoke admitted third-party Market Operations, and
suppliers are paid after contract-valid delivery. The Principal owns authority
and budget; the agent is the delegated shopper. Suppliers host implementations.

Category-aligned runtime strings belong in `src/content/brand-copy.ts` as the
single managed source. That source was reconciled on 2026-08-08; the remaining
legacy values listed below are residue, not category authority. No component
may introduce local-trade, Australian-SMB, BAS, or default-business wording as
the product category, ICP, wedge, or default frame.

## Legacy product residue — remove or label subordinate demo

These are current source locations, names, and heuristics that still encode the
superseded local-business product frame. Remove them in the owning surface, or
explicitly label them as subordinate person-facing/demo fixtures; do not let
them teach the market category.

| Residue | Current source | Required treatment |
| --- | --- | --- |
| Brand-core local-business promise | `src/content/brand-copy.ts`: `CORE_SENTENCE`, `HOME`, `AGENT_DOOR`, `AGENT_PAGE`, `BUSINESS_DOOR`, `DIALOG_WELCOME` | **Resolved 2026-08-08:** the managed strings now use the canonical category sentence, Principal/agent ownership, supplier-hosted Market Operations, and category-aligned door copy. |
| Local-service prompt copy | `src/components/ae/chat/AeAnswerPromptInput.tsx`: `Find local service businesses`, `Local service need`, and `Cited answers from published business details` | Remove or explicitly label as subordinate demo copy; it must not be the market entry language. |
| Local-service discovery heuristics | `src/modules/answer-thread/internal/answer-response-planner.ts`: `hasAnswerServiceSignal`, `isBroadLocalBrowseQuery`, `isLocatorOnlyBrowseQuery`, `extractAnswerRequestedLocation`/Parramatta normalization, `missing_place` clarification | Remove or isolate behind the subordinate demand-demo boundary; these heuristics are not canonical Market Operation eligibility/discovery. |
| Australian trade/business onboarding | `src/components/ae/claim/ClaimFormSections.tsx`: `Trade or service type`, suburb/state, Australian phone, service-area and customer-job descriptions | Remove or label as a subordinate Australian demo; do not imply Australian SMBs are the ICP or supply category. |
| Australian business offering defaults | `src/components/ae/offerings/AeOwnerOfferings.tsx`: business/service/customer copy, Australian-dollar price prose, `ownerOfferingPriceCurrency = 'AUD'`, and `AE supply is Australian` | Remove or label as subordinate demo; supplier-hosted Operations and declared contract pricing are canonical. |
| Default business/listing presentation | `src/components/ae/artifacts/AeGenerativeAnswer.tsx`, `src/components/ae/chat/AeSuggestionChips.tsx`, `src/components/ae/chat/composer-copy.ts`, `src/components/ae/chat/session-context.ts`, `src/components/ae/chat/session-journey.ts`, `src/components/ae/chat/turn-context.ts` | Treat business/listing/service-area defaults as subordinate application furniture; replace category-facing wording with Market Operation/Supplier language when each surface is next touched. |
| Australian local demo supply | `src/lib/dev/local-e2e-business-fixtures.ts` (`Demo Plumbing`, Joondalup/Fremantle/Adelaide fixtures and local-area summaries) | Keep only as labelled development/demo fixtures; never cite as current supply, ICP, category, or demand proof. |


## Change protocol

1. Voice/position changes start in `BRAND.md` — never on a surface.
2. Brand-core strings live in `src/content/brand-copy.ts` (typed, one place, tests import it).
   Surfaces render from it; hardcoding brand voice in a component is a defect.
3. Machine descriptors (action `name`/`summary`/`boundaries`, llms/SKILL/UCP output) are
  **governed by project-owned exactness rules**, never restyled during a rebrand — semantic
   alignment only.
4. Everything else (functional labels, admin/operator copy, errors) changes with its feature, not with
   the brand.

## Copy classes and owners

| Class | Governance | Where |
| --- | --- | --- |
| Brand-core voice | BRAND.md → `src/content/brand-copy.ts` | home hero/meta/example asks, agent+business doors, dialog welcome |
| Surface prose (person) | BRAND.md rules, owned in place | claim funnel, listing pages, inquiry confirmation, privacy/terms framing, chat states, worklog titles |
| Server-emitted person prose | BRAND.md rules, owned in module | `answer-thread/internal/{answer-response-planner,public-projection,follow-up-chips}.ts`, `turns/*` recovery prose |
| Machine descriptors | exactness (guardrails skill) | all `defineAction` descriptors (~25 across 15 files), `dynamic-published-contract.ts`, `agent-entry.ts` |
| Generated discovery docs | exactness + shared constants | `discovery/internal/discovery-files.ts` (llms.txt, sitemap, robots), `agent-skill.ts` (/SKILL.md), `.well-known/ucp` |
| Split human/machine constants | keep split, align semantically | `customer-request/public-comprehension.ts` (HUMAN vs MACHINE blocks) |
| Owner/admin operational | functional, no brand voice | `_operator/admin.*`, `_operator/owner.*`, agent-access |
| Legal/consent | counsel-stable | `$slug.inquiry.tsx` consent lines, privacy/terms bodies |

## Surface register (person-facing, brand-weighted)

| Surface | Files | Brand-core? |
| --- | --- | --- |
| `/` hero + doors + meta | `src/routes/index.tsx` | YES → `brand-copy.ts` (done) |
| `/` ask box (label/placeholder/CTA) | `src/routes/index.tsx`, `AeAnswerPromptInput.tsx` | parked by founder — revisit with ask-box redesign |
| Engine dialog welcome | `AeChatWelcome.tsx` | YES → `brand-copy.ts` (done) |
| Dialog states/plan card | `AePlanWork.tsx`, `AeChat.tsx`, `AeSuggestionChips.tsx`, `AeGenerativeAnswer.tsx` | next candidates |
| Server answer prose | `answer-response-planner.ts`, `public-projection.ts`, `turns/*` | next candidates |
| Claim funnel | `claim.tsx`, `claim.success.tsx`, `for-providers.tsx` | business-door voice; align on next pass |
| Listing + inquiry | `$slug.tsx`, `$slug.inquiry.tsx` | surface prose |
| Global SEO | `__root.tsx:34-37` | brand-weighted, flagged (below) |
| `/for-agents` hero + meta | `src/routes/for-agents.tsx` | YES → `brand-copy.ts` (`AGENT_PAGE`) |

`/for-agents` is the Door 2 landing page: brand-core hero in `brand-copy.ts` (`AGENT_PAGE`), and the
body hands over the generated agent surfaces (`/llms.txt`, `/SKILL.md`, `/api/businesses`,
`/.well-known/ucp`, MCP) rather than restating them. Those remain exactness class.

## Flagged misalignments (managed backlog — fix deliberately, not en masse)

1. `__root.tsx:34-37` global SEO says "Ask for a local service…" — vendor-search phrasing (voice rule 3).
2. `answer-response-planner.ts:196-210` clarification prose: "Tell me the service or task you want to
   get done…" — violates invite-the-problem (rule 5) and "work"-adjacent phrasing (rule 4).
3. `claim.tsx` hero/control copy uses "work" person-facing; "Publish what you do once" duplicated across
   `index.tsx` (now `brand-copy.ts`), `claim.tsx:565`, `for-providers.tsx` SEO — converge on the
   brand-copy constant when claim is next touched.
4. Repeated empty-state phrase family "No listed businesses …" across 8+ files
   (`public-projection.ts:141`, `turns/types.ts:195`, `retrieval-first.ts:254`,
   `answer-tool-use-agent.ts:484`, `follow-up-compact-prose.ts:83`, `insufficient-frozen.ts:30`,
   `proposal.ts:482-503`, `build-message-parts.ts:137`) — single-source before the next recovery-copy
   change (T24 will touch exactly these).
5. Machine/human shared phrases ("start work", "natural-language request", listing boundary line) —
   alignment hazards; machine side wins on exactness, human side re-expresses.

## Counts (from inventory)

~30 public/operator route files with copy; ~25 action descriptors; 4 generated discovery documents;
3 answer-prose modules; 146+ route strings, 97+ component strings inventoried.
