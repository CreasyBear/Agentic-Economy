# Architecture

**Current source candidate:** `codex/prune-operation-chat` at the post-prune
Release-B source shape. This document describes repository source, not deployed
production state.

## Product boundary

The product is the Operation market and catalogue. Chat is a small website
adapter that lets a person use the same canonical Operation contracts. Machine
agents use the API, MCP, or CLI for consequential work.

```text
Website
├── Operation catalogue
└── Thin chat
    ├── anonymous: bounded, ephemeral browser transcript
    └── signed-in: durable Clerk-authenticated Convex Agent thread
                         │
                         ▼
                five canonical chat tools
                         │
              ┌──────────┴──────────┐
              ▼                     ▼
      Operation registry      safe keyless execution

API · MCP · CLI ──► invocation · payment · recovery · supplier management
```

The five `ChatToolId` values are:

1. `registry.operations.search`
2. `registry.operations.detail`
3. `registry.operations.compare`
4. `registry.operations.inspectPlan`
5. `operation.execute`

There is no generic Action, arbitrary-URL, payment, recovery, invoke, or supply
tool in chat. Canonical Action Zod schemas validate inputs and outputs. Tool
results are sanitized and capped at 64 KiB. Each generation stops after four
steps, permits at most four total tool invocations, and admits at most one
`operation.execute`. The execution adapter crosses into the Node action in
`convex/chatExecute.ts`, then reuses the keyless execution core and SSRF-safe
network guard.

## Chat flows

### Anonymous

1. `/t/new` renders the shared transcript and composer in
   `src/components/ae/operation-chat/`.
2. The browser sends only `{ role, content }` messages to
   `POST /api/chat/anonymous` in `src/routes/api.chat.anonymous.ts`.
3. The TanStack boundary applies bounded-body and HTTP admission checks, derives
   a privacy-preserving admission key, and proxies to the protected Convex HTTP
   action using `AE_CHAT_PROXY_SECRET`.
4. `convex/chatAnonymous.ts` repeats admission, accepts at most 12 text-only
   messages and 16 KiB total, and caps the current prompt at 2,000 characters.
   Supplied tool calls/results and extra fields are rejected.
5. Convex Agent streams a UI-message response with
   `storageOptions: { saveMessages: 'none' }`. It creates no component thread
   and saves no messages or stream deltas.
6. On sign-in, the browser keeps the anonymous transcript visible. The next
   send creates a durable thread and persists that send onward, not the earlier
   anonymous transcript.

### Signed-in durable thread

`ClerkProvider` wraps `ConvexProviderWithClerk` on chat routes in
`src/routes/__root.tsx`; components use `useConvexAuth` before durable reads or
writes.

1. `convex/chatMessages.ts` authenticates the Clerk `tokenIdentifier`, applies
   the 30-submissions-per-hour limit, admits one non-stale generation, and uses
   Agent `saveMessage`.
2. It schedules `convex/chatGenerate.ts`, which calls Agent `streamText` with
   the single OpenRouter model selected by `AE_LLM_MODEL`.
3. `useUIMessages` calls `convex/chatMessages.listMessages` with `threadId`,
   bounded `paginationOpts`, and `streamArgs`. Owner reads include `syncStreams`.
4. A busy lease lasts ten minutes. Concurrent sends and deletion during a live
   lease fail; a stale lease can be cleared on the next send.
5. Thread title, list/search order, authorization, busy admission, and share
   metadata are app responsibilities. Thread content and streaming are not.

`@convex-dev/agent@0.7.1` owns:

- component thread content and metadata;
- messages and deltas;
- tool calls and results;
- stream state and synchronization.

The application owns only two tables:

- `chatThreads`: `threadId`, Clerk `ownerId`, title, `updatedAt`, and optional
  active-generation fields. `_creationTime` supplies creation time.
- `chatThreadShares`: access ID, generation, verifier, key ID, state, and
  create/revoke times. Raw share tokens are never stored.

Owner list and message pages default to 20 and cap at 50. Agent context contains
20 recent messages, with no embeddings or RAG. Titles derive from the first
durable prompt and cap at 80 characters. Missing and cross-owner threads both
surface as `thread_not_found`.

### Sharing

`AE_CHAT_SHARE_SECRET` and `AE_CHAT_SHARE_KEY_ID` protect the HMAC access-ID,
verifier, generation, and constant-time comparison scheme. `/s/:shareToken` is
read-only and `noindex`. Public reads call `listUIMessages` without
`syncStreams`, omit pending/streaming messages, and project only sanitized text
and compact Operation cards. A shared page cannot continue a conversation and
never exposes raw tool payloads. Pre-prune share links intentionally do not
resolve against the new token scheme.

Rename updates both app and Agent component titles in one mutation. Delete is
rejected while a generation is live; otherwise it removes app/share access and
schedules Agent component thread deletion.

## Market and machine plane

Canonical discovery is the Operation surface:

- `POST /api/v1/market-operations/search`
- `POST /api/v1/market-operations/detail`
- `POST /api/v1/market-operations/compare`
- `POST /api/v1/market-operations/inspect-plan`
- `POST /api/v1/operations/call` plus status, cancel, and reconcile
- `/mcp` and `@agentic-economy/cli`

Discovery advertises Operation reads and invocation. It deliberately excludes
anonymous browser chat and removed answer endpoints. `/api/v1/services/*` is a
retained business/catalog compatibility projection; it is not parity authority.
Invocation, money, agent access, capability supply, recovery, and the durable
action-invocation kernel remain independent of chat.

## Routes and ownership

| Surface | Current owner |
| --- | --- |
| `/market`, `/operations`, `/operations/:operationRef` | Catalogue UI and Operation projections |
| `/t/new`, `/t/:threadId` | Thin owner/anonymous chat UI |
| `/s/:shareToken` | Settled, read-only shared projection |
| `/api/chat/anonymous` | Browser-only protected stateless proxy |
| `/api/v1/market-operations/*` | Canonical machine reads |
| `/api/v1/operations/*` | Consequential invocation and recovery |
| `/mcp`, CLI | Machine Operation contract |

There is no `/api/answer/*` or `/admin/runs` route in the generated route tree.

## Production migration and rollback runbook

The source is ready to be evaluated as a Release-B candidate, but none of the
following production actions is evidenced by this branch.

### 1. K1 drain deployment

Deploy the deterministic retired response candidate from `b16de9846` for old
answer HTTP admission while legacy Convex functions are still present. Stop new
old-stack work. Observe old reservations for two consecutive 30-second lease
intervals and inspect Convex
`_scheduled_functions` for pending old deletion/finalization jobs. If activity
remains after 10 minutes, abort and diagnose. Do not freeze writers under active
work.

### 2. Release A

Deploy the new chat and the writer-freeze candidate anchored by `5616abaf3`,
including cross-module writer exports. Retain old readers and the exact eleven
legacy schema declarations. Prove old mutations fail closed and row counts
remain stable across two reads.

### 3. Production rollback packet

Confirm the exact production deployment; a local environment file is not proof.
Create a full Convex export. Retain the original ZIP and extract each of these
eleven tables' `documents.jsonl`:

1. `answerThreads`
2. `answerTurns`
3. `answerTurnReservations`
4. `answerToolCalls`
5. `answerThreadShares`
6. `harnessSessions`
7. `harnessSessionEntries`
8. `externalRunManifests`
9. `externalRunStarts`
10. `externalRunEvidence`
11. `externalRunGateDecisions`

Record table counts, bytes, SHA-256 digests, deployment identity, source
revision, and timestamps. Treat the ZIP and JSONL files as sensitive production
data.

### 4. Release B

Remove old readers/functions and all eleven schema declarations, then deploy.
The old data remains as undeclared tables. This repository currently has that
source shape; this is not evidence that production received it.

### 5. Verify before deletion

Verify new signed-out and signed-in chat, share/revoke behavior, Operation API,
MCP, CLI, parity, and gateway smoke against the exact deployed revision. Do not
continue on deployment-identity drift.

### 6. Final human operation

Require a separate typed human confirmation for each of the eleven table names.
Delete only the confirmed undeclared table in the production dashboard, record
the operation, then verify that no old table, function, index, route, or
scheduled job remains.

### 7. Rollback before deletion

Before table deletion, rollback is redeploying Release A, which restores reader,
writer-freeze, and schema compatibility without replacing unrelated data.

### 8. Recovery after deletion

Restore Release A's schema first. Import each saved `documents.jsonl` using its
exact table name. Never restore the full ZIP with replacement semantics into the
active product: it could overwrite unrelated market or new-chat writes.

## Recent shape checkpoints

- `b4a07abd2` made the catalogue the product front door.
- `76e31dc72` completed the capability market loop.
- `1958e45d3` made `chat` the Operation Action surface.
- `5207cbe7e` mounted Convex Agent; `c742476ac` added the five tools.
- `7d13715d8` and `62eb5b20d` added durable and anonymous chat.
- `c75aaf729` and `5dbd37140` replaced the UI and routes.
- `ec2977e74` moved release proof to chat conformance.
- `b16de9846` and `5616abaf3` supplied drain and writer-freeze candidates.
- `aa1485afc` removed the old runtime.
- `43ace4bf` removed old dependencies; `cc3c688e` preserved CDP through Convex
  external-package configuration.

## Evidence still required outside source

- exact-revision staging chat smoke;
- confirmed production K1 drain and scheduled-function observation;
- exact deployment export with the eleven verified JSONL files;
- verified Release A and Release B deployments;
- separate typed confirmations and records for all eleven deletions;
- explicitly selected retention/disposal policy for production snapshots.
