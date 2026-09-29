# Agentic Economy project instructions

**Revised:** 2026-09-29

## Read this first

For product behaviour, read `PRODUCT.md` first. For local setup, follow README's "Run locally" section. Vocabulary: [`docs/glossary.md`](./docs/glossary.md).

Use each source for the question it can answer:

1. `PRODUCT.md` defines what Agentic Economy is and owns.
2. `AGENTIC_ECONOMY_AUSTRALIA_WHITEPAPER.md` explains the institutional thesis.
3. `CONTEXT.md` defines canonical domain language.
4. Current source and tests define what is implemented.
5. `README.md` is the public and operational introduction.

Dated research, comparison papers, execution gates, generated maps and Git history are evidence or history. They do not override the product charter.

## Product boundary

Agentic Economy is a cross-harness Tool market and commercial boundary for just-in-time service procurement. Preserve one chain:

```text
capability gap -> service request/comparison -> Quote -> Call
    -> delivery or uncertainty -> remedy if required -> Purchase resolution/status
    -> Outcome records -> agent continues
```

A Tool is the canonical callable unit of supply. Purchase resolution/status is the terminal state of its purchase, not a second market object. Portfolio Service records, Offerings, Publications, Listings, Sources and Provider connections remain distinct concepts and are not collapsed into Tools.

The Customer owns the larger objective and delegates authority. The Agent acts through an Account and Spending policy or another supported Request authorization. The Provider performs the Tool. For supported principal-reseller purchases, Agentic Economy is the fixed buyer-facing Seller. The payment recipient is recorded separately.

Never collapse these distinctions:

- Funding is not authority.
- Authority is not a purchase.
- Buyer consideration is not the Provider obligation.
- Settlement is not delivery.
- Delivery is not purchase resolution/status.
- A wallet, credential or endpoint does not establish a commercial role.

Agentic Economy does not own the user's project, planning, memory, orchestration, final accounting classification or general agent runtime.

Do not confuse the external registry with the canonical market. Imported metadata becomes a callable Tool only after admission and publication.

The product charter is forward-looking. Do not represent the complete Australian principal-reseller record as implemented until source and tests establish it. The current foundation includes brokered Calls, prepaid credit, Charges, Provider earnings, refunds and recovery. Seller identity, separate Provider obligation, attributed tax facts, business-document evidence and purchase resolution remain explicit implementation work.

Generic IAM `Principal`, `Account`, `Business`, `User`, `Credential` and `DelegationGrant` remain distinct from the Customer and Agent product roles. Charge, Provider obligation, payable amount and Payout remain separate facts, as do delivery status, payment status and Purchase status. Upstream protocol fields, opaque identifiers, canonical hash material and signatures keep their exact external meaning. New product language uses `CONTEXT.md`.

## Architecture boundaries

**Tool price.** An owner price becomes a `PricingConfig` through `pricingConfigForOffering` in `src/modules/capability-supply/internal/publication/draft.ts`, is stored as `pricingConfigJson`, and is rendered through `displayPriceFromPricingConfig` from `src/modules/money/public.ts`. Do not format a buyer price by hand outside that chain.

**Public API route.** Name the file `src/routes/api.v1.<name>.ts` (or `api.<name>.ts` for a non-versioned surface). Parse query params with a `z.strictObject` schema. Return RFC 9457 problems through `problem()` in `src/lib/server/problem.ts` with a specific `detail`. Page with opaque cursors from `src/modules/registry/opaque-cursor.ts`. Wrap the handler in `withHttpRateLimit`. Add the path to `DiscoveryPublicSurfacePaths` in `src/modules/discovery/internal/offering-discovery-file.ts`.

**Imports.** Runtime modules cross boundaries only through the declared module graph. `src/` does not import Convex root files. Private module internals, backup trees and development evidence stay off production routes. The Formance SDK stays behind its Node action boundary. Dependency cycles stay at zero, including inside capability supply.

## File naming

Use one filename convention within each area. Canonical vocabulary comes from `CONTEXT.md`.

| Area | Convention | Example |
| --- | --- | --- |
| Domain modules, utilities, scripts and standalone tests | `kebab-case` | `call-authority.ts` |
| AE-owned Convex backend files, including internal helpers | `camelCase` | `capabilityCallIdentity.ts` |
| AE-owned React component files | `PascalCase` | `ToolCard.tsx` |
| Tests colocated with their source | Match the source stem | `agentAccessPolicy.test.ts` |
| Routes, framework entry points and generated files | Preserve framework or generator naming | `__root.tsx`, `api.v1.tools.quote.ts` |
| Maintained component-library or vendored files | Preserve upstream naming | `button-variants.ts` |

Convex module paths have no hyphens. Convex rejects them and a dev push stops. Retain role suffixes such as `.actions.ts`, `.functions.ts`, `.test.ts` and `.spec.ts`. A filename change does not change public contracts, protected identifiers or historical evidence.

## Convex root standard

Registrations live in `convex/*.ts`. Concern bodies live in `convex/lib/<domain>/<feature>/`. The standing layout is [`docs/operations/convex-root-protocol.md`](./docs/operations/convex-root-protocol.md).

- Every `query`, `mutation` and `action` registration declares `returns`. A handler that calls `ctx.runQuery`, `ctx.runMutation` or `ctx.runAction` declares its return type.
- Generated API module, method and kind stay aligned with string call sites.
- No `index.ts` barrels under Convex. Import the concern file directly.
- No maintained file under `src/` or `convex/` exceeds 1,000 lines. Generated files, tests and `convex/devSeed.ts` are outside that ceiling.

Before changing Convex code, read `convex/_generated/ai/guidelines.md`. Its project-specific API rules take precedence over general guidance.

## Branches and merges

Run `npm run check` after each change. Run the affected tests for changed behaviour. Run `npm run gate` before merging to `main` or cutting an alpha release. `check` is lint, dependency cycles, incremental types, import and security boundaries, the Convex fences and the 1,000-line ceiling. `gate` adds clean typechecking, the unit suite (including host-security headers), integration tests, SEO proofs, browser journey tests, the CLI package and the public build. Do not treat `check` as a substitute for `gate`.

Do not push directly to `main`. Do not stage the whitepaper, `docs/strategy/*`, `docs/workflow/aecon-signals-proposal.md` or `output/*`.

This checkout is shared. A PreToolUse hook blocks stash, `checkout --`, restore, `reset --hard`, clean and force-push. Report the need instead of working around it.

## Node

Use Node 22 and npm 11.5.1, including Convex and child processes. `.nvmrc` and `package.json` pin the local runtime. `convex.json` pins Node actions to the same major. Do not work around failures with Node 24 or 25.

Fresh login shells select `.nvmrc`. For a shell that does not, run this checkout through NVM's runner:

```sh
NODE_VERSION=22 "$HOME/.nvm/nvm-exec" npm run check
```
