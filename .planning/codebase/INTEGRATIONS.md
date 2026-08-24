# External Integrations

## Convex Agent and Clerk

Signed-in chat uses the official Clerk-to-Convex pattern:

1. `ClerkProvider` is outside `ConvexProviderWithClerk` in
   `src/routes/__root.tsx`.
2. UI code uses `useConvexAuth` before durable reads and mutations.
3. Convex derives ownership from Clerk `identity.tokenIdentifier`; callers do
   not submit owner IDs.
4. `@convex-dev/agent@0.7.1` owns thread content, messages, deltas, tool calls,
   results, and streaming state.
5. The app owns only authorization/order/title/busy metadata in `chatThreads`
   and token-free share metadata in `chatThreadShares`.

## Anonymous chat

`POST /api/chat/anonymous` is a browser adapter, not a machine Agent API. The
TanStack route applies existing HTTP admission and proxies to the Convex HTTP
action using `AE_CHAT_PROXY_SECRET`. The protected action repeats admission and
streams through Agent with no saved messages or deltas.

Trust boundaries:

- text-only `user`/`assistant` messages;
- 12 messages, 16 KiB transcript, 2,000-character current prompt;
- no caller-supplied tool calls/results;
- independent edge and Convex rate-limit buckets;
- no component thread or durable transcript.

## OpenRouter

`src/modules/model-gateway/public.ts` is the only model gateway. One model is
selected through `AE_LLM_MODEL` and authenticated with `OPENROUTER_API_KEY`.
The five tools are bounded by canonical Zod contracts, 64 KiB sanitized output,
four steps, four total calls, and one keyless execute.

## Share links

`AE_CHAT_SHARE_SECRET` and `AE_CHAT_SHARE_KEY_ID` mint verifiable HMAC share
tokens. Convex stores an access ID and verifier, never the raw token. Public
shares expose settled sanitized text and compact Operation cards only; revoke
invalidates the link.

## Operation discovery and invocation

- `/llms.txt`, `/SKILL.md`, `/.well-known/ucp`, and `/mcp` advertise canonical
  Operation discovery and invocation.
- `/api/v1/market-operations/*` supplies search/detail/compare/plan reads.
- `/api/v1/operations/*`, MCP, and CLI own consequential invocation, status,
  cancellation, and recovery.
- Stripe, CDP/x402, supplier credentials, and durable workpool recovery stay
  behind the invocation plane. Chat has no payment or supplier mutation tool.
- `/api/v1/services/*` is a retained compatibility view, not discovery/parity
  authority.

Discovery deliberately excludes `/api/chat/anonymous` and removed answer
surfaces.

## Configuration names

Chat/model configuration:

- `OPENROUTER_API_KEY`
- `AE_LLM_MODEL`
- `AE_CHAT_PROXY_SECRET`
- `AE_CHAT_SHARE_SECRET`
- `AE_CHAT_SHARE_KEY_ID`
- `VITE_CONVEX_URL` / `CONVEX_URL`
- `VITE_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`,
  `CLERK_JWT_ISSUER_DOMAIN`

The deployment manifest in `src/lib/deployment/manifest.ts` is the source of
truth for required, conditional, optional, and forbidden environment names.
Never copy secret values into documentation or evidence.

## Other retained integrations

- Convex cloud: database, functions, scheduler, auth verification, components.
- Clerk: human identity and Convex JWT bridge.
- Stripe: top-ups, Connect, payouts, signed webhook handling.
- Coinbase CDP/x402: custody, exact payment signing, settlement verification.
- MCP and admitted HTTP/OpenAPI providers: inbound machine interface and
  outbound Operation transports.
- Sentry/PostHog: optional sanitized observability.
- Vercel: Node-hosted TanStack application.

CDP is externalized through `convex.json`; `@x402/svm` is not a root package or
application import.
