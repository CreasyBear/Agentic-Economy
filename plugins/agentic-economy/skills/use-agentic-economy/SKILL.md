---
name: agentic-economy
description: Find and acquire a bounded outside service through Agentic Economy when a task needs a capability the current tools do not provide. Use for Tool discovery, authorized Calls, and recovery of existing Calls; leave the user's project and planning in their current harness.
---

# Use Agentic Economy

## First use and returning to the task

Keep the user's need, selected Tool and input in the current harness. Website
and Agent discovery use the same Quote → authorized Call → result and receipt
path. Refresh tools/list after connection and follow pagination. Setup, browser
return, key issuance and authenticated reads do not complete Tool use. Browse
only access permits discovery; explain the approval needed to purchase. Recover
an existing Call before buying again. Report unavailable supply, refused
authority and uncertainty honestly.

Share the exact verification link; **Follow live onboarding** observes that
request before credential issuance. Once authenticated, follow this Agent at
`/agent-access?caller=<principalRef>` on the connected server, using
`ae_agentAccess_whoami`. Add `callRef=<original Call reference>` after acceptance
to follow that attempt, or `resumeTool=<toolRef>` for a selected Tool. This page
shows recorded access and Calls; planning stays in the harness. Never put
credentials or private input in the URL.

## Find a suitable Tool

Use the installed server's tools/list before calling a tool. Public discovery has
three tools: `ae_registry_tools_search`, `ae_registry_tools_describe` and
`ae_registry_tools_compare`.

Search with a short capability phrase. Describe a returned Tool to understand
its required input and public terms; compare only actual returned references.
Public discovery does not require an account connection. A result is a candidate,
not a promise that the current caller can buy or use it.

Set `includeLatency: true` on describe/compare for recorded admission-to-completion
`latency`, including recovery, across the last 30 days. `window.from` is the
cutoff; `window.to` is the observation time. Median/p95 require five valid
samples and use up to the latest 48 completed Calls. `insufficient_sample`
reports the count; an absent opted-in field means unavailable history. Omitting
the option preserves older response shapes. The current CLI requests it; Tool
pages show the chart. This excludes unfinished Calls and measures neither first
byte nor Provider execution alone. It is not a deadline or SLA; slow is not failed.

If no Tool fits, explain the missing capability without inventing a listing.
`tool_read_unavailable` means no catalogue read completed. It is retryable,
never proof that a Tool is absent, and never permission to reuse stale terms.

## Connect when protected work is needed

Use the host's account-connection prompt or plugin settings for protected work;
some hosts connect at installation. If tools remain unavailable, start a fresh
task and refresh tools/list. Never call an unlisted tool to force sign-in.
Keep the selected Tool and input in the harness. AE does not store the user's
project or conversation. Never put private input in sign-in URLs or ask for
pasted tokens. Alternatives: https://app.aecon.ai/for-agents.

Plugin configuration does not prove connection. An authenticated read confirms
access; use `ae_agentAccess_whoami` for diagnosis. Connection is not spending authority.

## Quote and make the Call

With connected tools available, use `ae_tool_quote` for the exact Tool and input.
Read its caller-specific price, effects, data use, authority fit and expiring
Quote. Respect the user's limits and the returned approval
requirements. Existing delegated authority can cover a Call; do not create an
extra approval ceremony. A free price does not remove authority requirements.

Call through `ae_tool_call` only with the returned `quoteRef` and one stable
`idempotencyKey` for that intended Call. Identical material with the same
key replays the recorded work; changed material needs a new quote.
Never substitute a Provider, endpoint, price or credential.

If a human must act, give the returned owner handoff and retain its reference.
For insufficient credit, follow the returned `funding.handoff.create` action,
share only its hosted Checkout URL with the payer, retain the funding session
reference and use `funding.handoff.status`. After confirmed funding, quote
again before explicitly resubmitting the intended Tool. Funding is not
authority or a purchase.

## Price a task with more than one Tool

Before the first paid Call, quote **every** contribution with its exact `toolRef`
and input. Record each committed `quoteRef`, `normalizedInput`, exact `price`
(`currency`, integer `units`, `exponent`), `expiresAt`, `account.accountRef` and
`budget.principalRef`/`maximumPerCall`. Check the intended Account/Agent, matching
currency/exponent and expiry. Sum integer units against the task ceiling, never
rounded display prices. Refused/expired Quotes leave the total unknown. Re-quote
changed inputs, prices or authority. This sum does not create an AE bundle,
reserve a task budget or guarantee later authorization.

Retain each contribution's `quoteRef` and stable `idempotencyKey` before
`ae_tool_call`, then its `callRef`. After interruption, pending delivery or an
unknown outcome, use `ae_call_status` and the offered reconciliation with the
original identity; never repurchase with a fresh key. Earlier completed Calls
remain spent if later ones fail. `ae quote --json` exposes the exact Quote;
`ae call` quotes afresh. Use explicit Quote/Call actions to spend against the
previously inspected QuoteRef.

## Read the result and recover safely

Return the actual result or explain its current state. Delivery, settlement and
commercial closure are separate facts; report only what the response establishes.

For pending or uncertain work, retain the Call reference and follow the
returned `ae_call_status` or `ae_call_reconcile` continuation. A timeout is not
permission to create another Call. Check the original Call before retrying,
respect Retry-After when supplied, and do not change its command identity to get
past an error. Use `ae_call_cancel` only when the current Call offers
cancellation. If access or evidence is missing, explain the specific next step.
CLI JSON reads allow 15 seconds; Quote and Call requests allow 60 seconds each.
`call --wait` starts a separate 60-second polling window after acceptance;
`ae wait` also allows 60 seconds, bounding each status read by remaining time.
Human output announces Quote/Call requests on stderr; `--json` keeps progress
quiet and stdout machine readable. Preserve the original Call or local recovery
reference on interruption. A timeout never authorizes another purchase.
When reconciliation requires historical evidence fields, preserve the exact
`invocationRef` and `operationRef` keys and values returned by the runtime.

## Provider setup

Start at https://app.aecon.ai/for-providers using source-native setup. Retain
draft and connection-attempt references across handoffs; re-read status on
return. A browser callback alone proves neither connection nor publication.
Reopen the saved attempt's secure owner handoff, or use
`ae_supply_connection_detail` with the connection reference when listed.
Never start a duplicate connection because its callback failed. Provider
credentials belong only in the secure connection form, never prompts, MCP input
or CLI arguments.

## Help and detailed contracts

- API and CLI documentation: https://app.aecon.ai/llms.txt
- Account and setup help: https://app.aecon.ai/support
- Private support: support@aecon.ai

Include only safe request or Call references in support requests. Keep the
`x-ae-request-id` response header and include it when contacting support or
reconciling a Call. Do not include credentials, private inputs or private
results in public issues.
If the documented server or help page is unavailable, report that limitation.
Do not guess another server address or send credentials to an alternate host.
