# Phase 3A UI contract — one reliable paid operation

## Customer task

Get the latest BTC price in USD from one named provider for no more than $0.01.

The surface is one compact operation card. Chat may host the card, but the
durable invocation—not the chat instance—owns its state. It is not a
marketplace, wallet, workflow, mandate dashboard, Activity hub or crypto
terminal.

The renderer is operation-agnostic. An operation-owned adapter supplies a
closed set of typed presentation blocks (`text`, `measurement`, `money`,
`timestamp`, `source`, `reference` and `status`). The shared component renders
those blocks and the paid-operation lifecycle; it never parses provider
payloads or contains BTC, crypto or quote schema. This is constrained
generative UI, not model-generated components. BTC/USD is the first operation
fixture, not the UI contract.

## Information order

1. **Task and state** — “Get the latest BTC price in USD” and the current
   ordinary-language status.
2. **Material consequence** — named provider, maximum or evidenced charge, and
   the BTC/USD fields shared.
3. **Result or uncertainty** — normalized quote and time, or the dominant
   statement that payment/result remains uncertain.
4. **Safe continuation** — only the command allowed by durable state.
5. **Environment** — persistent “Local mock demonstration” label.
6. **Technical detail** — endpoint, payment rail/material digests, invocation,
   attempt and evidence references behind progressive disclosure.

## Canonical states

| State | Customer statement | Primary continuation |
| --- | --- | --- |
| Prepared | AE is ready to ask the named provider for BTC/USD for up to $0.01 USD. | Pay up to $0.01 and get quote |
| Refused before release | Nothing was sent or paid; name the exact material reason. | Correct or re-authorize when available |
| Query released, no authorization | The provider received BTC/USD, but no payment authorization was created. | Inspect or correct |
| Payment prepared | Exact payment permission is prepared and durably held. | Continue the same operation |
| Possibly submitted | The paid request may have been sent; do not run it again. | Check status |
| Settlement unknown | Payment may have occurred; AE is checking attributable evidence. | Check status |
| Quote invalid after submission | Payment may have occurred, but the returned quote cannot be trusted. | Check status |
| Completed | Show BTC/USD price, source, observation/receipt time and evidenced payment status separately. | Get a fresh quote as a new paid operation |
| Reconciled not settled | Evidence shows the prior payment was not submitted or settled. | Start a new explicitly authorized operation |
| Reconciled settled | Evidence shows payment settled; retain quote-validity truth separately. | Inspect result/evidence |

No uncertain state exposes retry. Reload reads the same durable state and never
starts a fresh quote.

## Comprehension contract

Without opening technical detail, a person must be able to answer:

1. What will AE do?
2. Who will receive the request or payment?
3. What is the maximum charge?
4. What information leaves AE?
5. Is anything known to have been sent or paid?
6. What is the only safe action now?

Human and structured-agent projections answer these questions from the same
`agentic-paid-operation:v1` semantic object. A non-crypto paid operation must
render through the same component without changing the shared schema.

## Interaction and accessibility

- Use Astryx neutral Card, Badge, Banner, Button, Text and disclosure primitives.
- Use the semantic token bridge; add no route-local palette or component system.
- Keep labels persistent and status non-colour-dependent.
- All controls have at least 44px practical targets and visible keyboard focus.
- Use one concise atomic live region for background status changes. Do not
  reread the whole card.
- Move focus only after a user-triggered transition or refusal.
- At 320px and 400% zoom, information reflows without horizontal scrolling.
- Motion is optional, 120–250ms and removed under reduced-motion preference.

## Claim boundary

Every state is labelled local/mock. Provider payment headers are described as
provider-asserted evidence, never independent settlement. A receipt proves only
the named event. The surface makes no hosted, real-provider, fulfilment,
customer-value or production-safety claim.
