# Operation kernel wayfinder

**Status:** supporting kernel design; Package 4 sequence is owned by
[`IMPLEMENTATION_ROADMAP.md`](../../IMPLEMENTATION_ROADMAP.md)  
**Product authority:** `PRODUCT.md`  
**Purpose:** rebuild confidence in the stripped execution kernel without
reintroducing several independent failure dimensions at once.

> **2026-08-31 rebaseline:** Use the
> [agent operating contract](agent-operating-contract.md) for the system around
> this kernel. AgentMux/Agentmuxer comparisons have been withdrawn: they are not
> Agentic Economy product or architecture evidence.

## Decision in one sentence

Expose one canonical managed Call over an explicitly selected, exact-revision
x402 Operation and Commitment; keep execution, authority and money as durable
correlated owners behind that interface; add each new protocol or transport axis
only after the existing cell passes its proof gate.

The Operation remains the market unit. It does not become a generic tool,
workflow, agent session, or protocol abstraction.

## Why this is the right restart point

The current simplification is directionally correct. `operation-invoke.ts` now
reads as an application coordinator with four principal dependencies:

1. resolve the current Operation;
2. reserve invocation identity and idempotency;
3. decide authority;
4. dispatch the accepted call.

The focused invocation tests pass: 31 tests across admission, authority,
dispatch, recovery, and legacy-result parity.

However, the kernel is not yet small in the architectural sense:

- the public result contract still knows fixed Base/USDC receipt details;
- the refusal vocabulary includes policy, money, leasing, provider, and
  recovery concerns at once;
- the dispatch port can enqueue, refuse, or lose certainty, but cannot return a
  completed result directly;
- the worker path still contains preparation, release, charging, x402
  authorization and settlement, leasing, and recovery;
- public result kinds mix command responses (`needs_authority`), execution
  state (`pending`), terminal results (`completed`, `refused`), and an operator
  workflow (`reconciliation_required`).

That means the deleted legacy layer is gone, but several later capability
rings still reach into the center. Adding features now would make failures
ambiguous again: a broken call might be contract resolution, authority,
queueing, provider transport, charging, settlement, projection, or recovery.

The way out is progressive certainty, not progressive feature count.

## What to harvest from the examples

| Source | Pattern worth taking | What not to copy |
|---|---|---|
| [treg](https://github.com/superdesigndev/treg) | Relay upstream calls instead of modelling every provider; inject credentials server-side; let the caller choose the provider; never silently fail over; keep a small stable market tool surface; use caller-supplied idempotency; route all surfaces through the same enforcement path. | A broad generic API proxy, one market entry per arbitrary endpoint, or assumptions that an unknown call is safe. |
| [Executor](https://github.com/UsefulSoftwareCo/executor) | Normalize callable integrations at one execution boundary; validate inputs before dispatch; keep policy decisions pure; distinguish an integration specification from a live authenticated connection; return structured expected failures and opaque internal defects with correlation IDs. | Code-mode, sandbox orchestration, dynamic plugin breadth, or a generic tool runtime as the Agentic Economy product. |
| [x402](https://github.com/x402-foundation/x402) | Treat payment as a protocol adapter with an explicit challenge, authorization payload, verification, settlement, and a recoverable uncertain outcome; retain transaction evidence when finality is unknown. | Putting x402 types at the center of every invocation, treating a payment challenge as the market contract, or expecting x402 to own caller budgets and delegated authority. The [x402 v2 specification](https://github.com/x402-foundation/x402/blob/main/specs/x402-specification-v2.md) explicitly leaves client-side budget and session policy outside the protocol. |

The common lesson is not “copy their architecture.” It is this:

> One canonical call boundary, one owner of mutable lifecycle state, thin
> adapters, explicit uncertainty, and no duplicated enforcement path.

For Package 4, this also means the agent is not an application coordinator. It
selects an Operation, supplies input and an idempotency key, then follows the
returned safe continuation. The managed-Call module coordinates identity,
Mandate, AUD reservation, corporate treasury, x402, Provider obligation and
recovery through their owning interfaces.

## Target shape

The smallest useful center has five domain concepts.

### 1. Operation snapshot

The immutable facts a call is bound to:

- canonical Operation reference and revision;
- provider identity;
- input and output contracts;
- consequence and retry classification;
- access mode;
- quoted price and material terms, if any;
- runtime route reference, not provider secrets.

An invocation binds to a snapshot. It must not reread mutable publication facts
halfway through the effect.

### 2. Call command

The caller's intent:

- Operation reference;
- literal input;
- caller-supplied idempotency key;
- principal and delegated context;
- correlation identifier.

The request fingerprint is the canonical digest of the Operation revision,
literal input, and any decision-critical constraints. Reusing a key with a
different fingerprint is a conflict. Reusing it with the same fingerprint is a
replay. The service must never invent an idempotency key from the input because
two identical calls at different times may be new work.

### 3. Invocation record

The one durable owner of lifecycle truth:

```text
reserved
  -> awaiting_authority
  -> ready
  -> dispatching
       -> succeeded
       -> failed
       -> uncertain
```

`cancelled` is valid only before `dispatching`. `uncertain` means an effect may
have occurred and blind retry is forbidden. Reconciliation is an action on an
uncertain invocation, not a second execution path.

Public responses are projections of this record. They do not define a second
state machine.

### 4. Execution driver

One port receives an already bound and already authorised call. It returns only
generic effect facts:

```text
succeeded(output, provider evidence)
failed_before_effect(error)
uncertain(effect evidence)
```

HTTP JSON, MCP, a provider-specific SDK, and x402-backed HTTP are drivers or
driver collaborators. They may have rich internal errors, but they map those
errors into the three effect outcomes at the kernel boundary.

### 5. Transition journal

Every lifecycle mutation flows through one transition function. The host may
persist snapshots rather than implement full event sourcing, but transitions
must be versioned and attributable:

- previous state;
- accepted intent;
- resulting state;
- time and correlation ID;
- effect generation;
- evidence reference, where applicable.

This is the narrow lesson from AgentMux: one place answers “what changed this
invocation?” Convex actions, HTTP handlers, workers, and recovery commands must
not mutate competing versions of the lifecycle.

When money is introduced, payment gets a separate, correlated state axis. Do
not force payment progress into the invocation enum:

```text
execution: reserved -> ready -> dispatching -> output_buffered
                                      |              |
                                      v              v
                                    failed     succeeded | uncertain

payment:   not_required
           or required -> authorized -> verified -> settling
                                                    -> settled
                                                    -> failed
                                                    -> pending
```

The two axes explain cases a single enum cannot: an upfront payment can settle
before provider execution fails; an authorization-flow provider can produce an
output while settlement becomes uncertain. Their transitions share an
invocation reference and journal, but neither impersonates the other.

## Rings around the kernel

```text
agent:  self/balance -> search -> inspect -> invoke -> continue safely
                         |
                         v
          [ Operation snapshot + Commitment + call command ]
                         |
                 [ invocation reducer ]
                         |
                 [ execution driver ]
                         |
                    usable result

the first product slice includes:
  durability + exact x402 acquisition

later rings, opened by evidence:
  second supplier -> second access mode -> second transport surface
```

The market loop selects the Operation. It does not execute providers itself.
The kernel executes one selected Operation. It does not search, rank, plan,
remember, or choose suppliers.

## The dependency-ordered build sequence

Each waypoint adds one principal uncertainty. A waypoint is complete only when
its proof packet passes. Time estimates are deliberately omitted: move on
evidence, not calendar confidence.

These waypoints record kernel risk order, not the current platform package
order. Packages 1–3 already established authority and identity. Package 4 uses
the roadmap's 4A–4H sequence and applies the waypoint proof discipline within
each slice rather than rebuilding the product in this historical order.

### Waypoint 0 — Declare the transaction-native baseline

**Goal:** make the current simplification legible before changing behavior.

Do:

- choose one deterministic x402 resource fixture for contract tests;
- choose one real or official-compatible exact-price x402 testnet Operation for
  the walking skeleton;
- document a support matrix whose first cell is only:
  `x402 HTTP v2 × wallet authorization × exact fixed price × read-only × direct`;
- prohibit AE-owned reusable provider credentials in this slice;
- mark reusable credentials, consequential approval, alternative payment
  schemes, cancellation, and additional transports as explicitly unsupported;
- label current worker/payment/recovery modules as **parked** rather than
  allowing the first slice to depend on them accidentally;
- capture one golden trace from request through usable output.

Do not:

- recover deleted fixtures because a historical test mentions them;
- choose the first real market category by convenience of old code;
- refactor every remaining execution file before the walking skeleton exists.

**Exit proof:** a new contributor can name the supported cell, the canonical
entry point, the effect boundary, and every intentionally parked ring.

### Waypoint 1 — Complete one exact-price x402 call without the full worker stack

**Goal:** prove the irreducible market value: an agent chooses one exact
Operation, accepts its inspected price, acquires it, and receives literal
validated output.

Add only:

- current Operation resolution and revision binding;
- input validation;
- one persisted invocation identity and request fingerprint written before the
  provider call;
- caller-supplied idempotency reservation and terminal-result replay;
- one x402 HTTP v2 client driver pinned to one `exact`/`authorization`
  mechanism, network, asset, and facilitator;
- validation of `PAYMENT-REQUIRED` against the inspected Operation price,
  resource, payee, network, asset, scheme, and buyer ceiling before signing;
- one wallet/signer boundary with no AE-owned provider API key;
- correlated but separate execution and payment states;
- output validation;
- buffered output until successful settlement evidence is present;
- a direct `succeeded` result with evidence hash, timing, and protocol-neutral
  receipt projection;
- status read from the same invocation record;
- structured refusal for invalid input, unavailable provider, and invalid
  provider output.

The dispatch boundary must be able to return a completed result. A queue is a
hosting choice, not a kernel requirement.

**Proof matrix:** valid 402 challenge and paid retry; mismatched amount, payee,
network, asset, scheme, or resource; invalid input; timeout; upstream 4xx/5xx;
malformed or schema-invalid output; same key/same fingerprint replay; same
key/different fingerprint conflict; and proof that no signer is contacted on a
preflight mismatch.

**Exit proof:** one real exact-price Operation returns something a caller can
use, the call and payment have durable correlated identity and status, and no
general balance, reusable provider credential, queue, lease, broad authority,
or multi-scheme payment framework is on the call path.

### Waypoint 2 — Harden invocation, payment, and uncertainty

**Goal:** prove the first paid slice remains safe under concurrency, crashes,
lost responses, and uncertain settlement before adding breadth or
consequential effects.

Harden only:

- the invocation record behind one transition reducer;
- caller-key reservation as an atomic shared claim;
- payment identifier bound to invocation identity and request fingerprint;
- write `dispatching` before crossing the effect boundary;
- replay of a stored terminal result;
- `uncertain` when dispatch began but the outcome cannot be established;
- payment `pending` with transaction hash and network when x402 reports
  `settlement_pending`;
- reconciliation of the recorded transaction without replaying provider work;
- status read as a projection of the invocation record.

The transition and effect write ordering is the core design problem here. Do
not add a second scheme, network, asset, facilitator, or access mode while
learning it.

**Proof matrix:** same key/same fingerprint replay; same key/different
fingerprint conflict; concurrent duplicate calls; crash before dispatch; crash
after `dispatching` but before response persistence; terminal replay after
restart.

**Exit proof:** retries cannot duplicate a provider call in every knowable
case, and the unknowable case becomes `uncertain` rather than an automatic
retry.

### Waypoint 3 — Reattach the smallest market loop

**Goal:** prove this is a market call, not a hard-coded connector.

Add only:

- two canonical Operations in one narrow demand category;
- search that returns both when viable;
- comparable facts: total price, readiness, access, data use, consequence, and
  evidence;
- explicit caller selection;
- invocation of the selected immutable Operation revision;
- search-miss and selection evidence.

Take treg's rule: show alternatives; do not silently select or fail over. A
provider failure returns against the chosen Operation. Trying another supplier
is a new explicit selection and invocation.

**Exit proof:** a caller can search, compare, choose supplier A or B, invoke the
chosen one, use the result, and the evidence explains the allocation.

### Waypoint 4 — Add one alternative access mode only if demanded

**Goal:** prove the Operation model can express a non-x402 access requirement
without turning AE into a platform-key proxy.

Add only:

- one caller-owned or supplier-delegated connection kind;
- server-side credential resolution and injection;
- redaction guarantees;
- a stable distinction between missing, expired, and refused credentials;
- connection readiness in inspection.

Follow Executor's distinction: an integration or Operation contract can exist
without a live authenticated connection. Follow treg's relay rule: injected
credentials override caller-supplied credential headers and are never returned
in output, logs, or evidence.

**Proof matrix:** no connection, valid connection, expired connection, provider
rejects credential, attempted header override, logs/evidence contain no secret.

**Exit proof:** the x402 path is unchanged and the connected path differs only
in the access collaborator used by the same execution driver. No platform-owned
credential inventory or invisible provider substitution is introduced.

### Waypoint 5 — Add authority as a pure pre-dispatch decision

**Goal:** admit consequential work without distributing policy throughout the
worker.

Add only:

- a pure decision over principal, bound Operation snapshot, literal input, and
  declared constraints;
- three outcomes: allow, require authority, deny;
- one exact-Operation approval path;
- re-evaluation immediately before dispatch if authority can expire;
- an immutable decision reference stored on the invocation.

Begin with one consequential class. Do not add every authority mode together.
The decision function does not execute, enqueue, charge, or mutate provider
state.

**Proof matrix:** allowed; denied; approval required; approval scoped to wrong
Operation; input changed after approval; expired/revoked before dispatch;
concurrent approval and cancellation.

**Exit proof:** no effect can cross `dispatching` without an attributable
current decision, while the original paid read-only call still uses the same
kernel.

### Waypoint 6 — Extract a protocol-neutral payment seam only from evidence

**Goal:** generalise payment only when a second real lane proves which concepts
are genuinely shared with x402.

Add only when a second payment mechanism or internal settlement path exists:

- an immutable fixed-price quote bound into the Operation snapshot;
- buyer maximum and currency/asset equality checks;
- a second real or protocol-faithful payment driver;
- a protocol-neutral receipt attached to the invocation;

Reuse the correlated execution/payment state axes established by the first
x402 slice. A provider output may be buffered while capture/settlement
completes; it is not released as a usable result while the system still claims
payment is required or settlement has failed.

Keep chain, facilitator, and x402 fields inside the payment driver's evidence,
not in the base invocation result.

**Proof matrix:** price within ceiling; price exceeds ceiling; authorization
fails before effect; provider fails before effect and authorization releases;
provider succeeds and capture succeeds; duplicate capture; capture outcome
unknown.

**Exit proof:** the invariant “no provider effect without sufficient authority,
no double charge, and no false claim of settlement” holds under injected
failures.

### Waypoint 7 — Expand x402 by one dimension

**Goal:** prove the pinned x402 adapter can grow without changing the invocation
lifecycle.

Add exactly one new dimension:

- a second facilitator, **or**
- a second network/asset, **or**
- a second supported flow/scheme.

Do not add more than one of these in the same waypoint. Keep x402 v1,
subscriptions, general balances, and automatic scheme selection unsupported.

The adapter owns:

1. receiving and validating `PAYMENT-REQUIRED` requirements;
2. matching them to the Operation's inspected price and buyer ceiling;
3. constructing or obtaining the signed payment payload;
4. retrying the same resource request with `PAYMENT-SIGNATURE`;
5. recording `PAYMENT-RESPONSE`, output, and transaction evidence;
6. mapping `settlement_pending` to payment `pending` and preserving the
   transaction hash and network for reconciliation;
7. projecting an invocation as uncertain when payment uncertainty makes the
   overall usable outcome uncertain.

Use the invocation reference or a bound derivative as the payment identifier.
Atomically reserve it before the paid provider call: the official illustrative
in-memory cache is not sufficient for concurrent duplicates. Payment nonce and
signature replay protection do not prove the provider effect ran exactly once.
Keep AE authority and budget decisions outside x402; the protocol does not own
them.

**Proof matrix:** valid challenge; price/asset/network drift; invalid challenge;
verification refused; settlement succeeded; response lost after broadcast;
same payment identifier replay; payment identifier with changed payload.

**Exit proof:** the new x402 dimension changes no kernel execution state or
public market tool contract; only payment-driver configuration and evidence
expand.

### Waypoint 8 — Broaden recovery, then add cancellation

**Goal:** support real observed uncertainty, not hypothetical recovery breadth.

Extend the narrow settlement reconciliation from Waypoint 2 only for additional
uncertain conditions actually seen in Waypoints 5–7. Each reconciler consumes
evidence and proposes a transition through the same invocation reducer. It
never mutates the invocation independently.

Add cancellation only for states where the effect boundary has not been
crossed. After `dispatching`, cancellation becomes a provider-specific
compensating Operation if the supplier offers one; it is not a claim that the
original effect vanished.

**Proof matrix:** reconcile to succeeded; reconcile to failed; still uncertain;
stale evidence; conflicting evidence; repeated reconciliation; cancel before
dispatch; cancel racing with dispatch; cancel after effect boundary.

**Exit proof:** every uncertain call has a truthful status and bounded next
action; no recovery command creates a second call accidentally.

### Waypoint 9 — Add another transport or surface, not both

**Goal:** prove the boundary generalises from evidence, not imagination.

Choose one:

- a second provider transport such as MCP; or
- a second caller surface such as the public MCP market tools.

If adding a caller surface, route it through the same application service. Do
not reimplement policy, metering, idempotency, or relay behavior in the surface.
Treg's in-process reuse of the real routes is the model: distinct public
contracts may share the same enforcement path.

If adding a provider transport, implement the existing execution-driver
contract. Change the contract only where two real drivers prove the first
shape insufficient.

**Exit proof:** parity tests show intentional public differences and identical
shared behavior.

## The proof discipline that prevents whack-a-mole

### Add one axis per waypoint

The axes are independent sources of failure:

- provider transport;
- access/credential mode;
- consequence class;
- authority mode;
- price mode;
- payment protocol;
- synchronous versus asynchronous hosting;
- recovery action;
- caller surface.

A pull request that introduces two new axis values should normally be split.

### Use three test layers only

1. **Reducer and policy tests:** pure transition and decision tables.
2. **Driver contract tests:** every driver must satisfy the same effect outcome,
   validation, secret, timeout, and evidence contract.
3. **Golden trace:** one end-to-end trace per supported capability cell.

Avoid duplicating large scenario fixtures at every architectural layer. That
creates many tests without creating a single source of behavioral truth.

### Maintain a live capability matrix

Example starting matrix:

| Transport | Access | Consequence | Price | Hosting | Status |
|---|---|---|---|---|---|
| x402 HTTP v2 | wallet authorization | read-only | exact fixed | direct | prove first |
| HTTP JSON | caller-owned connection | read-only | supplier-defined | direct | Waypoint 4, only if demanded |
| x402 HTTP v2 | wallet authorization | external effect | exact fixed | direct | Waypoint 5 |
| second payment lane | explicit | read-only/effect | exact fixed | direct | Waypoint 6 |
| expanded x402 | wallet authorization | read-only/effect | one added dimension | direct | Waypoint 7 |
| MCP | any | any | any | any | unsupported until Waypoint 9 |

“Unsupported” is a valid product fact. Implicit partial support is the dangerous
state.

### Require an effect-boundary review

For every feature, answer:

1. What is validated before the effect?
2. What durable fact is written before the effect?
3. What exact line or port crosses the effect boundary?
4. What proves success?
5. What state represents lost certainty?
6. What makes replay safe?
7. What evidence can recovery use?

If any answer is “another layer probably handles it,” the feature is not ready.

### Do not generalise before the second example

- one HTTP provider: keep the driver concrete;
- two HTTP providers with the same needs: extract the shared adapter;
- one payment lane: keep it inside the payment driver;
- two payment lanes: extract the proven protocol-neutral contract;
- one caller surface: call the application service directly;
- two surfaces: add parity tests around their intentional differences.

This reverses the previous risk: abstractions are harvested from working
examples rather than filled with predicted flexibility.

## What should happen next in this repository

The active next work is Package 4A–4D in the implementation roadmap:

1. freeze the existing action descriptors and compact response semantics;
2. resolve Account, Agent Principal and Mandate from authentication;
3. move budget aggregation from credential to Agent Principal;
4. replace the money internals with the exact AUD ledger and reservation model;
5. put one managed-Call coordinator behind the thin invoke route;
6. prove one fixed-price x402 test cell, including unknown recovery; and
7. prove that a fresh agent process can complete the loop from stable references.

Do not plan a general payment abstraction. Implement the pinned x402 lane
concretely and extract a broader adapter seam only when a second real payment
lane forces it.

## Wayfinder checkpoint template

At the end of every waypoint, record:

```text
Supported capability cell:
New invariant proved:
Golden trace:
Failures injected:
Effect boundary:
State owner:
New evidence emitted:
Explicitly unsupported:
Code parked or deleted:
Unexpected learning:
Decision for next waypoint: proceed / revise / stop
```

This is the anti-whack-a-mole mechanism. The sequence is allowed to change when
evidence changes, but the system never advances without knowing which new fact
has actually been proved.
