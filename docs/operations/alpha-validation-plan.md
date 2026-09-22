# Alpha validation and product maturity

Status: finite validation protocol restored and updated for launch, 20 September 2026.
Owner: Joel. Execution and closure status live only in the
[alpha maturity register](alpha-maturity-register.md).

The [integrated release design](alpha-release-design.md) defines the journeys and
system responsibilities. This document defines how a frozen candidate is audited;
it does not create another backlog or make a readiness claim.

## Outcome and entry conditions

An invited Customer must be able to activate an Account and Agent, fund within
the approved controls, find and buy a supported Tool, receive usable output and
understand or recover the purchase. A Provider must be able to publish and
maintain supported supply without operator database intervention.

Before a full audit, freeze one revision and record the exact web, Convex and
integration targets. Establish authentic identity/webhook delivery, Stripe and
Formance readback, scoped Infisical lifecycle evidence, supported supply and one
paid Base Sepolia buyer Call with matching funding, reservation, settlement,
delivery and purchase records. A free Tool or Provider validation does not prove
the paid buyer path. An unavailable dependency is blocked, never simulated as
integration proof.

Production audit adds the **NOT VERIFIED** deployment package in
[START_LINE.md](../../START_LINE.md#australian-production-boundary): attributable
legal/AML/CTF, tax and banking decisions; the infrastructure production gate;
fresh production identities/state; and the recorded A$25, USDC 5 and 0.001 ETH
limits. Mainnet effects stay disabled until those gates pass.

## Finite coverage

Build a candidate-specific inventory from current routes, navigation, controls,
public contracts and machine entry points. Map every applicable element to one
of the 32 maturity records and one bounded journey:

| Partition | Required coverage |
| --- | --- |
| Discovery | Search, comparison, Tool detail, playground, Provider and discovery-file surfaces |
| Activation | Sign-in, Account, Agent, authority, Connections, spending controls, security and implemented role boundaries |
| Funding and purchase | Funding disclosure and outcomes, Quote, paid Call, delivery, Usage, Spend, documents and purchase status |
| Provider supply | Setup, source preview, connection, validation, publication, recheck, revision, withdrawal and earnings status |
| Recovery and parity | Pending/unknown effects, replay/reconcile/cancel/refund, support plus HTTP, MCP, installed CLI and supported chat agreement |

Cover applicable desktop/compact layout, keyboard, loading, empty, validation,
permission-denied, unavailable, success and recovery states. Opening a page is
not journey evidence.

## Bounded audit protocol

The manager assigns one journey, persona, entry point, authorized resources,
success conditions and stop rules. Use Luna for bounded evidence/review. The
auditor receives cold context, changes no source or configuration, and reports
observed behavior. Serialize shared-resource mutations.

Each run is capped at six decision turns or twelve minutes. Record tasks that
take more than three turns. Retry an unchanged failure once. Stop immediately
on unclear authority, isolation failure, possible duplicate financial effect or
unknown external outcome, retaining the durable reference. Qualification uses
sandbox funding and approved Base Sepolia supply. A mainnet run occurs only as
the separately authorized final launch proof under the production gates and
exposure ceilings; the old sandbox-only stop no longer governs the release.

The manager reviews each report, assigns any bounded Sol implementation package,
obtains separate Luna review of the changed result, and accepts or returns the
package before advancing. Do not run open-ended re-audits.

## Evidence and decision contract

Record revision/deployment, target identities, run and journey IDs, persona,
channel, preconditions, timestamps, decision turns, interaction count, action
trace, expected and observed behavior, terminal state and recovery outcome.
Attach sanitized screenshots and durable Quote, Call, ledger or transaction
references where applicable.

For each journey identify what worked, observed friction, every workaround or
dead end, missing next actions and evidence for ready, not ready, blocked or not
tested. Judgment must be labelled as judgment and tied to an observation.

Unauthorized access, false success, duplicate or excess economic effects,
incorrect records, unusable delivery, loss of an uncertain purchase and a broken
core journey block launch. Source tests alone do not establish hosted, fresh-
process or production behavior. The manager records the final decision against
the fixed maturity register; unresolved conditions remain visible.

## Base Sepolia brokered x402 pilot

This bounded local pilot contributes evidence to LP-3 for AM-14/15 and AM-18–24;
it does not complete LP-3's separate frozen hosted-candidate acceptance.
It uses the existing brokered Call, CDP custody, RPC verification and Formance
paths. It does not use the standalone private-key testnet canary as purchase
evidence, create another readiness ledger or promote the synthetic
`package4-release` ledger into Customer authority.

### Semantic contract

**Requires:** one frozen source revision and exact local or hosted Convex execution
target; an isolated alpha Formance ledger behind its selected access identity;
one named CDP development account whose exact Base Sepolia address and applied
account/project policies match the recorded digest and generation; sufficient
Base Sepolia USDC and, only where the actual payer flow requires it, test ETH
within the gas ceiling; one or two distinct HTTPS Base Sepolia RPC targets;
an exact current x402 Tool revision/connection; route-signing material; and a
Customer/Agent with sandbox AUD funding and bounded authority. Human input is
limited to access to the intended CDP project and the Formance/AWS stack. The
account/policy IDs, policy digest, generation, caps and route-signing pair are
derived or generated only after the exact target is accepted.

**Ensures:** one Quote binds distinct AUD buyer consideration to the exact USDC
Provider obligation; one Call reserves AUD once, authorizes and submits at most
one x402 payment, verifies the matching Base Sepolia receipt, records usable
output and durable Quote/Call/ledger/transaction references, and returns the
same result or safe continuation on replay. Provider validation, when the chosen
Tool requires onboarding, uses platform funding and leaves the buyer ledger
untouched. An already admitted Bazaar Tool may proceed directly to Quote/Call
without manufacturing an owner canary.

**Invariant:** funding is not authority; a 402 challenge or signature is not
settlement; the network is `eip155:84532`, the asset is Base Sepolia USDC
`0x036CbD53842c5426634e7929541eC2318f3dCF7e`, and amount/payee/nonce/Tool
revision/connection/authority must remain exact. Accepted or uncertain effects
consume the cumulative campaign allowance until reconciled. The ceilings remain
A$25 total including fees, USDC 5 total and 0.001 ETH gas, with no automatic
replenishment or increase.

**On violation:** refuse before signing or submission when possible. After a
possible submission, retain the original Call, reservation, attempt and payment
references as uncertain; reconcile that attempt and never create a replacement
purchase. Stop the pilot on identity drift, policy mismatch, duplicate effect,
RPC disagreement, unconfirmed receipt, unusable output or any unexplained money
state.

### Configuration boundary

All 21 variables below are server-only. They are consumed by Convex Node
actions/worker code, not the Vite browser bundle. Local `.env*` presence does
not configure a hosted Convex deployment; the selected Convex target must read
them from its approved secret/environment path.

| Bundle | Exact names | Consumer and acceptance |
| --- | --- | --- |
| CDP/x402 (13) | `CDP_API_KEY_ID`, `CDP_API_KEY_SECRET`, `CDP_WALLET_SECRET`, `AE_X402_CDP_ACCOUNT_NAME`, `AE_X402_CDP_EXPECTED_EVM_ADDRESS`, `AE_X402_CDP_ACCOUNT_POLICY_ID`, `AE_X402_CDP_PROJECT_POLICY_ID`, `AE_X402_CDP_POLICY_RULES_DIGEST`, `AE_X402_CDP_CREDENTIAL_GENERATION`, `AE_X402_CUSTODY_ENABLED`, `AE_X402_CUSTODY_MAX_ATOMIC`, `AE_X402_CUSTODY_DAILY_MAX_ATOMIC`, `AE_X402_RPC_URLS_JSON` | `capabilitySupplyCanaryFundingPreflight` reads account, policy and balance without signing; Quote/canary code enforces custody caps; Call settlement reads the RPC map. Sandbox accepts one or two distinct HTTPS RPCs; use two for pilot disagreement evidence. |
| Formance (6) | `AE_FORMANCE_ENVIRONMENT`, `AE_FORMANCE_GATEWAY_URL`, `AE_FORMANCE_LEDGER`, `AE_FORMANCE_REQUEST_TIMEOUT_MS`, `AE_FORMANCE_ACCESS_CLIENT_ID`, `AE_FORMANCE_ACCESS_CLIENT_SECRET` | `moneyFormance` Node actions use the official pinned SDK with retries disabled. Non-loopback access is the existing Cloudflare Access service-token header pair. Generic Formance Cloud OAuth is not an interchangeable contract. |
| Route signing (2) | `AE_ROUTE_CALL_SIGNING_KEY_ID`, `AE_ROUTE_CALL_SIGNING_SECRET` | Call worker and CDP preflight require the complete pair; the key ID is bounded and the secret is at least 32 characters. It authenticates the AE route envelope, not the USDC transfer. |

On 22 September, bounded named-value inspection found the 13 CDP/x402 values in
the ignored root `.env.local` and the route pair in ignored
`.env.development.local` nonempty, non-placeholder and valid under the existing
configuration parsers. The six Formance values were bound process-locally to the
selected `anonymous-agent` target and were not written to repository env files.
A process-local invocation of the existing official-SDK read-only preflight
returned `ready`: named account/address, exactly applied policy IDs,
both policy documents and their digest, the exact seller-canary policy profile,
Base Sepolia USDC and the minimum balance all matched. It signed and submitted
nothing. The nonsecret binding is account `ae-x402-base-sepolia-v1`, payer
`0x8F012237dbcDf4038ea3E9EAbcEc6cA933a5f4B9`, account policy
`6277597e-0919-4d37-9d4f-406d31dc4a9a`, project policy
`c3e817f2-0fb2-44b2-9689-dac9b6238037`, digest
`sha256:b2382cdf6b6b501f905a4e98596752bcd96b3f2698a58bfc2abc57cf3b8512ec`,
generation 2, 10,000 atomic USDC per Call and 50,000 atomic USDC daily. These
independent custody caps fit within the USDC 5 campaign ceiling; they do not
spend or replenish it and do not establish hosted readiness. The platform-canary
readiness action returned `ae_canary_funding_not_ready` because no seller
onboarding grant was supplied; this is a missing grant prerequisite, not a
wallet, policy or balance failure.

Public readback showed the historical package-4 release at revision
`6593dbe7b4b8f75304caeed5b468acc497b720f4`, not current root
`c1527875b1485940d23ab0c139a8676a37f6728d`; its Formance edge returned the
expected unauthenticated 401, which proves only that the edge is access
protected. The named AWS session is authenticated and STS confirms account
`197716152388` with the `Package4ReleaseOpenTofu` deployer role. The obsolete
registered package-4 EC2/RDS identities no longer exist. Live readback found
replacement `ae-alpha` EC2 `i-073197e0346d83010` running with SSM Online and
RDS `ae-alpha-formance` available (PostgreSQL 16.13, Multi-AZ), both tagged
`Environment=ae-alpha` and `ManagedBy=opentofu`. On that host, the alpha
Cloudflared, gateway, ledger and worker workloads are ready with zero restarts;
in-cluster health returned 200 and the isolated ledger is
`agentic-economy-alpha` (id 1). Authenticated official-SDK readback at
`https://formance-alpha.aecon.ai` returned Ledger 2.4.12 health true/HTTP 200.
The ledger currently has five accounts and one transaction, which must be
preserved. The existing canonical installer added v1.4.0 beside v1.3.0 and
read back digest `sha256:3dd7e3f61e10b2f84f71cff4dc44bb47028f0894e9d59911a22847f99d494ab5`;
the account-volume and transaction-history digests and the five-account/
one-transaction census were unchanged. The treasury observation workload also
ran; this is scheduler evidence, not a paid payment. Old alpha credentials do not authenticate the historical
`formance-release.aecon.ai` edge.

The repository contains a supported reference candidate
`sandbox.aecon-testnet-reference` at 1,000 atomic Base Sepolia USDC, but its
endpoint origin and payee are deployment facts read from
`AE_PACKAGE5_FIXTURE_PUBLIC_ORIGIN` and `AE_PACKAGE5_FIXTURE_X402_PAY_TO`.
Neither name was initially configured in the checked root env files. Read-only
live inspection then selected the existing AE reference Provider at
`https://agentic-economy-sandbox-tools.vercel.app`: health 200, valid descriptor,
and an unpaid 402 for `POST /x402/execute` binding 1,000 atomic Base Sepolia
USDC to payee `0x9ec2cD9E2E2a7D93c426d98b48a745990972EE71` with a 60-second timeout.
The two facts were bound only to local `anonymous-agent`; the supported seed
created Tool `operation:v1:3f9f7c5468f9a96fa1a834725666cebc7f6352a02a89c48714c2e5a22e16ab2e`.
No Quote, canary or payment occurred, and the Provider's deployed revision is
still unverified. Local Convex then returned Formance health `ready` against
the exact alpha ledger and its required v1.4.0 digest. The seeded Tool's
immutable revision 1 remains preserved; an owner-authorized append-only
revision 2 now carries the Provider-declared validation example
`{ "value": "x402-validation" }`. Its unpaid probe stops at `authority_stale`
before HTTP because the revision's persisted binding authority snapshot is
missing. The required next step is a source repair that writes the exact
revision binding snapshot through the maintained publication path, followed by
the exact-revision probe; no direct database overwrite, fabricated readiness,
Quote or Call claim is allowed.

The remaining human boundary is local Clerk authorization for a real Agent;
the seed does not manufacture buyer identity or AUD funding. Resume with
`npm run --silent ae -- connect --base-url http://127.0.0.1:3024 --json`, then
verify `npm run --silent ae -- account status --base-url http://127.0.0.1:3024 --json`.
Stripe CLI read-only account inspection confirms `livemode: false`; the
authorized webhook listener was active for the successful retry. One authorized
test-mode A$5 top-up has now been booked through the original event/recovery
path and read back from Formance. Nonsecret references are Checkout
`cs_test_b1gn7FGdpl2oI1nzxy5a7S1DXaRcIsQxrbPWVrAYvZNzqWDtm7wVdhkmpX`, payment
intent `pi_3UIMFy70N4UjLqHt0emsFcbs`, webhook event
`evt_1UIMG070N4UjLqHt9KfsdMKJ`, and Formance transaction
`ae-p4:5aef213042c0992b45b2f8a84c0603266c4741066c6b2842b24a09d3f1383e3f:funding`.
The connected Principal is `prn_3c1758da42514dda85b966069103914a`, Account
`acc_7f239ab318004bad8d41654b9e993ace`, scope `market_tools:call`, and sandbox
policy A$1/Call, A$5/day, A$20/month, one concurrent call, 30/min, 300/hour,
seven days. The invoice readback showed A$0.48 GST against the A$5.28 Checkout
total while the pre-Checkout quote showed A$0.03 GST; this discrepancy remains
open. The Calls/activity surface is empty and the month summary remains
unavailable after refresh; those read-surface observations remain open. This
proves funding only, not an x402 payment or paid Call. Credit-page Convex
queries skip during auth refresh and resume only after authenticated state, and
Stripe paid evidence remains non-spendable until the durable funding command
is booked. Before the next funding run, start a fresh listener, bind its
ephemeral signing secret to the local Vite process, and use the supported
test-mode flow; never insert credit directly. Official external facts are anchored in
the [CDP Wallet quickstart](https://docs.cdp.coinbase.com/wallet-api/docs/quickstart),
[CDP x402 facilitator guide](https://docs.cdp.coinbase.com/x402/seller/facilitator),
and [Circle USDC contract list](https://developers.circle.com/stablecoins/usdc-contract-addresses).

On 22 September, one bounded direct external protocol smoke test paid exactly
0.001 USDC (1,000 atomic units) to
`https://x402-demo-discovery-endpoint.vercel.app/protected/testnet` using the
configured CDP test wallet and the endpoint's validated x402 v1 challenge. Base
Sepolia transaction
`0xf3d08fcee422200fc1fb82b8d13f83cdacadaa44df5ff1b31701fd63c553caaa`
succeeded on chain `84532` in block `47145383`; its receipt contains the matching
1,000-unit transfer from Base Sepolia USDC
`0x036CbD53842c5426634e7929541eC2318f3dCF7e` to
`0x021028695EAfDDe60E139D87000a8bd6cB65645e`, and the Provider returned HTTP 200
protected testnet content. This changed no source or dependency and proves only
the direct CDP/x402 custody and settlement path, not an AE Quote, Call, Formance
reservation or brokered purchase. The preceding AE selection resolved a distinct
mainnet Tool, while another testnet endpoint's metadata failed the installed SDK
schema before signing; neither produced a financial effect.

Also on 22 September, the authenticated AE product path issued Quote
`operation-commitment:v1:47dadc6e6eb36694d3927755361c345ffe155f759c2c1e08853a8bdb486598d6`
and accepted Call
`operation-invocation:v1:4d76e175d273784db335e14095f0ba064a08dd96ee5f133b12b3c75e592137b0`
for Wallets Demo Weather at A$0.001404 buyer consideration and 0.001 USDC on
Base Sepolia. The authorization `validBefore` was `1790061070`, no later than
the admitted authority expiry `2026-09-22T07:11:10.470Z`. Transaction
`0x4fc5ae5e6df86666ea5dfba6d0bedb82584c5c8a09582b090c18253fef35d518`
succeeded in block `47146288` and contains the exact 1,000-unit USDC transfer
from the configured payer to the quoted payee. The AE Call initially remained
`reconciliation_required`: the runtime could not parse the configured RPC URL
list during settlement verification, then observation persistence refused with
`x402_payment_response_identity_conflict`. No transport/payment observation or
quarantined output was retained, so weather delivery is unproved and no recovery
evidence was fabricated. The local RPC binding has since been corrected to the
required network-keyed JSON shape; the maintained parser accepts it and a
read-only RPC call reports Base Sepolia chain ID `84532`. That configuration fix
does not recreate the historical response or resolve this Call. The source
defect is also repaired: `recordX402TransportObservation` now preserves a
supplied response digest for unknown settlement, matching the earlier payment
observation and retaining quarantined output without claiming delivery. The
worker regression verifies that behavior; this historical output remains lost.
At that point Formance retained the A$ reservation
`ae-p4:cdfb63d4cb161fc04633516c8966f1bc8f8544eb3eed5ff0a8f68ed12b3c2cd8:reserve-aud`,
USDC reservation
`ae-p4:d68858d7d78a14d1d568733fcd8e0bb81439ed2fd84169c1ee930bf086197a28:reserve-usdc`,
and held Provider obligation evidence
`ae-p4:f08c46353b2c8831c70fbde66c01c0028de48aa29ec0eb8bf039ffa4238ca016:obligation-accrued`.
The initial attempt proved Quote, Call and payment but failed delivery. Further
purchases were held until the buyer remedy below completed.

At 08:06 UTC on 22 September the original paid Call was resolved through
`moneyManagedCallRemedyActions.resolveLostResult`. The action independently
verified the original EIP-3009 transfer and atomically restored A$0.001404 while
accounting for the paid Provider. It issued no new payment and invented no
response. Native ledger references:
`ae-p4:a8bb977e53df62dfeb66de4e4148cce196cc77ab7950e5f3849b0a850f9ce7bd:release-aud`
and
`ae-p4:b3e9c0ec59c065dd47fb8efe0d194631a63c51d4cd1ef5f33731f1c44252ce82:settle-provider`.
The Call and Purchase resolution are terminal/released; the browser explains
that AE could not recover the response and restored the credit. Agent status
also returns the terminal receipt.

The subsequent ordinary CLI Quote → Call for San Francisco created
`operation-invocation:v1:f27812ea5f24a03bc8ea1f2716654884e6c09096280f3bc71d13a60271b68a12`.
It paid 0.001 USDC through transaction
`0x93b4866de3a336832dc9d23742b64ffdac1189df19c885088188c841192a44c0`
and retained the actual response: 13.8°C, fog, fetched at
`2026-09-22T08:17:35.955Z`. Recovery completed this same Call without another
Provider request. The browser now shows Complete, output and A$0.001407 charged.
Native settlement references are
`ae-p4:508795dc66288b070f8b0e8e25799123ff3259551943bddcb480d3515d379b65:settle-buyer`
and
`ae-p4:c1a8ae2394fafe6ab41239768ff2d32c0306d3906f8d04603a2f9173ec60438c:settle-provider`.

Root repairs at this boundary: fresh wallet observations reuse the verified
one-time treasury initialization without replenishing capacity; Quote admission
uses the lower of current wallet spendable and native available capacity; EVM
confirmation checks read the block head after waiting; grant verification reads
the current spending-policy digest field; verified payment recovery validates
and returns the retained response and persists its usage, settlement references
and Purchase resolution. Recovery also updates the existing activity projection;
the browser shows one completed Call, two refunded/refused Calls and the one
remaining Berlin attention item. Replay retains one purchase. Tests reject wrong
payment facts, mismatched retained output, unsettled completion and duplicate
financial effects. These are local runtime and source proofs; hosted acceptance
and Base mainnet launch proof remain outstanding.

The final unattended repeat check used Berlin and Call
`operation-invocation:v1:c0d925d8b8fa2674f09895b1b4cb4dee5b8b585f3d46d9e11f3a996787052b5f`
(quoted A$0.001408 / 0.001 test USDC). It returned `outcome_unknown`, with
submission recorded but no payment-response digest or retained output. A
read-only Base Sepolia AuthorizationUsed log search for its exact payer/nonce
returned no match at the time checked. Absence from that search is not settlement
proof. Its reservation remains held; no replacement payment is authorized by
this record. **Unattended repeat acceptance remains FAIL.** Next bounded item:
resolve this exact submitted authorization using expiry/nonce evidence and
finish its buyer resolution, then prove normal completion before hosted/mainnet
acceptance. No additional purchase was made after this failure.

Verification for the repaired boundary: `npm run typecheck`; scoped oxlint;
10 focused Vitest files / 227 tests passed, including chain confirmation timing,
current/legacy grant identity, treasury reuse, refund replay and retained-output
completion. Local browser verified the completed San Francisco output and the
original released receipt. These checks do not override the failed repeat run.

### Execution order and evidence

1. **Freeze targets without effects.** Record the candidate revision and exact
   local-or-hosted Convex, CDP project/account, RPC, Provider endpoint and isolated
   alpha Formance edge/ledger identities. Never select `agentic-economy-release`:
   the registry marks it synthetic fixture evidence. Using the authenticated
   named AWS role, verify the selected `ae-alpha` edge/origin/ledger read-only
   before configuration. A local pilot may use local Convex only when it still
   reaches that real isolated Formance ledger and the actual CDP/provider path.
2. **Build derived configuration.** Reuse the verified CDP account/address,
   applied policy documents, canonical digest/generation, 10,000/50,000 atomic
   custody caps and existing valid route-signing pair; do not rotate working
   material merely for this pilot. Bind one or two exact
   Base Sepolia RPC targets. Store secrets only in approved server custody.
   The existing preflight parser requires intended custody to be `true`; invoke
   it process-locally or only on the isolated target while network entry and
   buyer authority remain closed. Do not toggle custody on a shared target just
   to inspect configuration.
3. **Run source and configuration checks.** Validate the selected environment
   with the existing deployment manifest. Then invoke the existing internal
   `capabilitySupplyCanaryFundingPreflight:readSellerOnboardingCanaryCdpReadiness`
   for `sandbox`; retain only its nonsecret account/address/policy digest,
   network/asset/balance and refusal codes. Run `moneyFormance:health` against
   the isolated ledger. Neither action signs, submits or provisions money.
4. **Qualify the selected Tool.** If it uses the supported owner onboarding
   path, stage the exact x402 revision, complete readiness and run one
   platform-funded canary through the real worker. Require contract-valid
   output, one canary identity, promotion/Quote eligibility and empty buyer
   usage/obligation records; replay must not create another canary/payment. If
   an existing Bazaar Tool is already legitimately admitted and Quote-eligible,
   verify that provenance and skip this owner-only step.
5. **Run one paid buyer Call.** Issue the actual sandbox AUD Quote for the
   promoted Tool, Call it once and retain the Quote, Call, Formance reservation/
   settlement, x402 payment identifier and Base Sepolia transaction references.
   Verify amount/network/asset/payee/nonce and usable output before accepting.
6. **Evaluate recovery and parity.** Replay the same Call through HTTP, installed
   CLI, MCP and supported chat status. Exercise one definite pre-submission
   refusal and one controlled interruption after possible submission; prove the
   first releases exactly once and the second retains one uncertain attempt for
   reconciliation without another debit/payment. Reconcile every open effect.

Focused source evidence on current root:

```text
npm exec --offline -- vitest run \
  tests/unit/dev/x402-local-canary.test.ts \
  tests/unit/convex/seller-onboarding-canary-cdp-preflight.test.ts \
  tests/unit/capability-supply/route-transport-x402.test.ts \
  tests/unit/convex/x402-route-rpc-consensus.test.ts \
  tests/unit/convex/capability-call-worker-charge.test.ts \
  --no-file-parallelism
```

Result: the retained focused suites recorded **5 files / 114 tests passed**;
the persisted fixture contract regression is now **13/13 passed**, the Formance
readback suite is **33/33 passed**, and scoped lint/diff checks passed. These
checks prove local wire shape, exact preflight/refusals, signer/transport
observations, RPC receipt consensus and worker charge/recovery invariants under
maintained fixtures. They do not prove a paid Call. The platform-canary
readiness remains `ae_canary_funding_not_ready` until a valid seller onboarding
grant is supplied. The opt-in private-key testnet mode is a direct protocol
diagnostic, not the approved brokered CDP/Formance buyer path.

The bounded authorization-expiry repair additionally passed **4 files / 176
tests** across the CDP signer, x402 route, worker authorization and payment
attempt suites; the affected worker charge suite passed **39/39**. Scoped
Oxlint, full `tsc --noEmit` and `git diff --check` pass. A temporary read-only
runtime check also proved the corrected RPC binding parses and its configured
target returns chain ID `84532`; it created no payment or product mutation.

### Pilot completion and stop condition

The first pilot completes when the exact selected local-or-hosted execution
target produces one paid Base Sepolia buyer Call with usable output, matching
AUD and USDC facts, a verified transaction, durable records, replay parity and
all interruptions reconciled with no duplicate effect. Its Tool must already be
legitimately admitted, or complete the applicable Provider promotion path.
LP-3 hosted acceptance remains a later, separate proof against the frozen hosted
candidate; local real-testnet evidence cannot satisfy it. A successful CDP
preflight, local/fake facilitator result, free Tool, platform canary or Formance
health response alone is insufficient. Stop with the package open if any target
identity remains unknown, any financial effect is uncertain, or the cumulative
allowance cannot cover the next bounded attempt.
