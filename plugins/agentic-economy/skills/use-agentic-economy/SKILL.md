---
name: agentic-economy
description: Find and acquire a bounded outside service through Agentic Economy when a task needs a capability the current tools do not provide. Use for Tool discovery, authorized Calls, and recovery of existing Calls; leave the user's project and planning in their current harness.
---

# Use Agentic Economy

## Find a suitable Tool

Use the installed server's tools/list before calling a tool. Public discovery has
four tools: `ae_registry_tools_search`, `ae_registry_tools_list`,
`ae_registry_tools_describe` and `ae_registry_tools_compare`.

Search with a short capability phrase. Describe a returned Tool to understand
its required input and public terms; compare only actual returned references.
Public discovery does not require an account connection. A result is a candidate,
not a promise that the current caller can buy or use it.

If no Tool fits, explain the missing capability without inventing a listing.
`tool_read_unavailable` means no catalogue read completed. It is retryable,
never proof that a Tool is absent, and never permission to reuse stale terms.

## Connect when protected work is needed

Use the host's native account-connection prompt or plugin settings before
protected Calls. Some hosts connect during installation. If tools remain
unavailable, start a fresh task after connection and refresh the tool list.
Do not call an unlisted protected tool to force sign-in.

Keep the selected Tool reference and intended input in the current task.
The host owns that task; Agentic Economy does not store the user's project or
conversation. Do not put private input in a sign-in URL or ask the user to paste a
token. Native alternatives are documented at
https://app.aecon.ai/for-agents.

A configured plugin is not proof of connection. A successful authenticated read
confirms access; `ae_agentAccess_whoami` is available when connection diagnosis is
needed. Account connection does not grant spending authority.

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

## Read the result and recover safely

Return the actual result or explain its current state. Delivery, settlement and
commercial closure are separate facts; report only what the response establishes.

For pending or uncertain work, retain the Call reference and follow the
returned `ae_call_status` or `ae_call_reconcile` continuation. A timeout is not
permission to create another Call. Check the original Call before retrying,
respect Retry-After when supplied, and do not change its command identity to get
past an error. Use `ae_call_cancel` only when the current Call offers
cancellation. If access or evidence is missing, explain the specific next step.
When reconciliation requires historical evidence fields, preserve the exact
`invocationRef` and `operationRef` keys and values returned by the runtime.

## Provider setup

For publishing a Tool, start at https://app.aecon.ai/for-providers and use
the existing source-native setup. Retain the saved draft and connection attempt
references across a human handoff. Re-read status when returning; a browser
return alone does not prove that the connection or publication succeeded.
If only a connection attempt is known, reopen its returned secure owner handoff
to read the saved attempt. If a connection reference is available and
`ae_supply_connection_detail` is listed, use it to read the current connection.
Do not start another connection merely because its callback failed.
Provider credentials belong only in the secure connection form, never in a
prompt, MCP input or CLI argument.

## Help and detailed contracts

- API and CLI documentation: https://app.aecon.ai/llms.txt
- Account and setup help: https://app.aecon.ai/support
- Private support: support@aecon.ai

Include only safe request or Call references in support requests. Do not include
credentials, private inputs or private results in public issues.
If the documented server or help page is unavailable, report that limitation.
Do not guess another server address or send credentials to an alternate host.
