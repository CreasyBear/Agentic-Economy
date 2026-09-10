# Catalogue and purchase-loop infrastructure stress review

Date: 2026-09-08. Environment: this checkout's local AE gateway at
http://127.0.0.1:3025 and local Convex at http://127.0.0.1:3210.
Node 22.22.0 / npm 11.5.1.

## Decision

Discovery and pre-purchase refusal now survive the bounded exercise. The complete
purchase loop is not yet demonstrated in this environment. The next package
should make the development environment repeatable and make Call recovery survive
a fresh process, then prove the complete sandbox purchase and remedy flow.

This exercise followed the instruction to reach the unfunded boundary. It did
not fund an Account, configure an approved production commercial policy, release
a paid Provider request, or demonstrate production capacity.

## Observed results

The baseline ran 76 CLI/HTTP checks. After fixes, the same 76-check exercise ran
again, followed by four concurrent catalogue reads. The official MCP client also
exercised the local HTTP MCP endpoint, including reconnecting with a fresh client.

| Boundary | Evidence after fixes | Interpretation |
| --- | --- | --- |
| Native Coinbase catalogue | First page: 20 Tools; second page: 15 Tools; both valid responses and continuation cursors | The original first page returned seven Tools and the second page failed. Not every upstream record is admitted. |
| Repeated discovery | Four first-page reads, concurrency two; all returned 20 identical Tool references | No identity churn observed in this repeated-read sample. |
| Detail and comparison | Three selected Tool descriptions and their comparison succeeded | Fresh canonical references resolve through the gateway. |
| Authentication | 16 account reads, concurrency eight, all authenticated | The saved origin-bound connection works across CLI processes. |
| Valid Call inputs | 24 CLI calls across ENS, block number and ERC20 balance, concurrency four | All stopped at Quote with commercial_policy_unavailable. No Call was created. |
| Invalid inputs | 12 requests | All returned input_invalid. |
| Invalid credentials | Four requests | All rejected with agent_access_key_invalid and reconnect guidance. |
| Unknown Tool / Quote | Four unknown Tools and four direct unknown-Quote submissions | Refused; repeated unknown-Quote identity created no Calls. |
| Account state | History and activity available; history remained empty | Balance returned source_unavailable, now with CLI exit status 1. |
| MCP | 19 authenticated tools discovered; search, describe, identity, Quote refusal, unknown-Quote Call refusal and history read worked | Same boundaries as HTTP/CLI. A fresh MCP client also read empty history. |

Local timing includes CLI process startup. In the 76-check rerun, description
p95 was 251 ms, account identity p95 851 ms, and valid-input Quote refusal p95
931 ms. The two native catalogue pages took 3.49 s and 2.91 s. Concurrent
first-page reads ranged from 2.71 s to 6.07 s. These are small development samples,
not throughput or paid-Call latency commitments.

Second-page follow-up observed 20 upstream records, 16 passing initial admission
and 15 public Tools. Three records were rejected as transport_unsupported and one
as source_invalid. Otto AI's crypto-news endpoint passed initial admission but
did not appear in the public page; the downstream exclusion remains unresolved.
The current API does not explain that loss to the caller. Catalogue completeness
must therefore remain an open acceptance item.

Evidence files, with credentials omitted:

- ../../../output/catalogue-stress/baseline.json
- ../../../output/catalogue-stress/live.json
- ../../../output/catalogue-stress/repeated-discovery.json
- ../../../output/catalogue-stress/mcp.json
- ../../../output/catalogue-stress/doctor.json

## Repairs made during the exercise

1. **Refresh immutable registrations correctly.** Changed imported terms or
   transport material previously reused immutable Offering/Binding identities
   and failed with identity conflicts. Refresh now creates new internal
   registration identities when their canonical material changes, retains the
   publication revision chain, and preserves old registration hashes.
2. **Keep refreshed imports discoverable.** Refresh revoked supply admission
   while waiting for a background readiness probe. Imported managed x402 Tools
   now inspect the selected customer request at Quote time, so that probe never
   restored admission. Their reconciliation now admits validated supply as first
   publication does. This does not establish live readiness or authorize payment.
3. **Align public schema handling with admitted contracts.** A narrower
   128-property projection limit broke the entire second page. Public projection
   now uses the contract's bounded byte/depth envelope and treats JSON Schema
   const, enum, default and examples as data. External schema references remain
   refused.
4. **Make balance failure visible to automation.** Account balance/activity
   errors now produce a failing CLI exit status instead of an exit-zero error
   body.

The affected boundaries are supply refresh, public schema projection and CLI
account error handling. No new dependency, service or table was added. Changes
remain in this worktree and have been loaded by the local Convex watcher.

## Remaining product-loop gaps

**Environment readiness is incomplete.** The live doctor reports working server,
MCP, authentication and Call recovery reads, but no release identity and an
unavailable balance. The general readiness endpoint passes while the commercial
policy required for a Quote is unavailable. Server reachability is therefore
insufficient evidence that this environment can sell a Tool.

**CLI recovery is now durable.** The Call recovery journal at
tools/ae/lib/call-recovery-journal.ts is locked with proper-lockfile, persisting
the pre-dispatch record so a fresh process can resume safely after credential
rotation or process death. The journal records the Principal, idempotency key,
dispatch timestamp, and recovery state, enabling deterministic replay without
recreating the purchase. Wells 1+2 implemented recovery-journal locking.

**Discovery needs explicit exclusion and failure evidence.** Candidate failures
can disappear behind a successful page response, as the Otto AI example shows.
Web source browsing and canonical machine admission still need a complete parity
check. Freshness and indicative AUD pricing also rely on live upstream reads, so
repeated browsing carries upstream latency.

**Money, delivery and remedy remain unproven together here.** Existing tests
exercise queue ownership, worker leases, charge handling, recovery and managed
x402 inspection. They do not establish that this local Account can fund, receive
a binding AUD Quote, settle through the configured infrastructure, receive usable
delivery and recover an uncertain purchase.

## Proposed next package: a repeatable complete development loop

Reuse the installed CLI, HTTP/MCP actions, Convex, existing queues, Formance,
funding integration and x402 SDKs. Do not introduce another orchestration service
or a per-Provider installation step.

| Sequence | Customer/agent outcome | Completion evidence |
| --- | --- | --- |
| 1. Complete environment startup | One documented start path produces a working app, backend, test Account, connection, spending policy and money dependencies. A diagnostic identifies the first missing operator or customer action. | A fresh checkout starts without manual row edits or copied one-off credentials. Diagnostics distinguish discovery, quoting and purchase readiness. Test authority and funding are explicit. |
| 2. Make interruption safe | Before dispatch, retain the exact origin, Quote and idempotency identity; attach Call identity when acknowledged. A fresh process can recover without recreating the purchase. | Drop the response after acceptance, restart the CLI, and recover one Call with at most one Provider release and one Charge. Also cover expired Quotes, malformed responses and status outages. Keep credentials and unnecessary input out of recovery records. |
| 3. Close catalogue parity | The same endpoint resolves to the same current Tool across web, CLI and MCP. Imported failures and exclusions have bounded reasons. | Repeated/concurrent refresh retains stable identities; changed material retires the old revision; one bad candidate does not break a page; every omitted candidate is accounted for. Preserve SDK pagination. |
| 4. Prove the whole sandbox purchase | An agent can discover, quote, call and use the result, while the customer sees the corresponding account and purchase records. | Demonstrate success, insufficient balance/authority, duplicate submission, Provider failure before release, and uncertain outcome after release. Reservation, Charge, Provider obligation, delivery and remedy remain distinct and reconcile. |
| 5. Make this repeatable in release checks | The product can be upgraded and operated without losing the loop. | Run the same bounded scenario corpus through installed CLI and official MCP client; verify compatible release identity, dependency failures and fresh-process recovery. Use existing telemetry with Call/Quote references and stage timings. |

The first implementation priority is environment startup and durable recovery.
The first end-to-end acceptance target is the complete sandbox loop. A later,
separately authorized funded proof must establish actual external settlement and
delivery. The complete Australian Seller, tax and business-document record
remains subject to PRODUCT.md's explicit implementation boundary.

## Verification run

109 tests passed across the following distinct suites during this exercise:

- 58 lifecycle/managed-x402 tests: capability-call-workpool,
  capability-call-recovery, capability-call-worker-lease,
  capability-call-worker-charge, money-managed-call, managed-x402-inspection,
  x402-directory-resolution.
- 16 refresh tests: facilitator-discovery and publication-commands-refresh.
- 35 related tests: tool-public-schema, market-terminal/account,
  capability-supply-native-admission, tool-catalog-native-search,
  mcp-api-official-client.

Project commands used Node 22 through the NVM runner. Relevant checks:

- npm run build:cli — passed.
- npm run typecheck — passed after final source changes.
- npm exec -- vitest run <the suites above> --no-file-parallelism — passed;
  affected refresh suites were rerun after the final refactor.
- npm exec --offline -- oxlint <the eight changed source/test files>
  --deny-warnings — passed.

No claim is made for a full repository release suite, production deployment,
installed-package compatibility, a funded external Call or saturation testing.
