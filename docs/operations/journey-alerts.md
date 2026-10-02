# Journey SLI alerts

Create these six alerts in the configured monitoring destination. Use the Sentry
UI for streams actually received there; do not script the Sentry API. Each rule
is one journey. Until delivery and a test notification are verified, the rule is
not operational.

## What is counted

A valid event is one terminal outcome of one attempt. The SLI is `good events / valid events` (Google SRE workbook). Each attempt writes **one** line:

```text
[ae.journey] {"journey":"search","outcome":"match","good":true}
```

`journey` is `search`, `quote`, `call`, `funding`, `chat`, or `publish`.

When `SENTRY_DSN` is set, the web server also sends:

- metric `ae.journey`, value `1`, attributes `journey`, `outcome`, `good` (`"true"` or `"false"`)
- one Sentry event, message `[ae.journey]`, with those three tags

Alert on the **metric**, not on the message as well. Counting both double-counts one attempt.

Quote, Call, funding, chat, and publish reach their terminal state inside Convex.
Convex does not load the Sentry SDK; those attempts emit the `[ae.journey]` log
line. Convex's [Sentry integration reports exceptions](https://docs.convex.dev/production/integrations/exception-reporting).
Enabling it does not establish delivery of these logs or creation of `ae.journey`
metrics.

Configure a separate [Convex log stream](https://docs.convex.dev/production/integrations/log-streams)
to the approved receiver, then verify the actual journey line arrives. Log
streams require Convex Pro and support dedicated destinations or a custom webhook;
neither a new receiver nor a log-to-metric transformation is provisioned by this
runbook. Use the receiver's log-based rules until an explicit, tested metric
transformation exists. Count each terminal event through one representation.
Record the receiving destination, rule, responder and test notification/acknowledgement
before claiming alert coverage. Missing delivery is unavailable evidence, not a
healthy zero-event window.

Do not fire a ratio when the window has fewer events than the minimum. One failure in an empty window is not a ratio.

## Search

Results returned are good. An error is not.

| | |
|---|---|
| Good | `match`, `scoped`, `noMatch` |
| Bad | `error` |
| Valid | all four |
| Query | `sum(ae.journey{journey:search,good:true}) / sum(ae.journey{journey:search})` |
| Threshold | below `0.95` |
| Window | 15 minutes |
| Minimum | 20 valid events (`journey:search`) |

Logs alert, once the receiver contains these events: count lines containing
`[ae.journey]`, `"journey":"search"` and `"outcome":"error"`, divided by valid
Search lines (`match`, `scoped`, `noMatch` or `error`). Alert **above `0.05`**,
using the same 15-minute window and minimum of 20 valid events. This failure ratio
is equivalent to the success ratio being below `0.95`: one error in 20 is exactly
the boundary; two errors in 20 cross it.

## Quote

An ordinary refusal (no balance, bad input, unknown tool) is recorded as `refused` and is **not** in this ratio. A fault is the service failing to price.

| | |
|---|---|
| Good | `issued` |
| Bad | `refused_by_fault` |
| Valid | `issued` + `refused_by_fault` |
| Query | `sum(ae.journey{journey:quote,outcome:refused_by_fault}) / (sum(ae.journey{journey:quote,outcome:issued}) + sum(ae.journey{journey:quote,outcome:refused_by_fault}))` |
| Threshold | above `0.10` |
| Window | 30 minutes |
| Minimum | 10 valid events |

`outcome:refused` stays out of both the numerator and the denominator.

## Call

The first leave from `pending` is the attempt. A later repair of an unknown Call is not a second attempt. `cancelled` is recorded and is not in this ratio.

| | |
|---|---|
| Good | `completed` |
| Bad | `outcome_unknown` |
| Valid | `completed` + `refused` + `outcome_unknown` |
| Query | `sum(ae.journey{journey:call,outcome:outcome_unknown}) / (sum(ae.journey{journey:call,outcome:completed}) + sum(ae.journey{journey:call,outcome:refused}) + sum(ae.journey{journey:call,outcome:outcome_unknown}))` |
| Threshold | above `0.05` |
| Window | 60 minutes |
| Minimum | 5 valid events |

## Funding

`failed` is a finished payment that did not credit (the buyer was not left waiting). `stuck` is `outcome_unknown`: the command left `pending` without a credit. A retry of a command that is already terminal does not emit again.

| | |
|---|---|
| Good | `completed` |
| Bad | `stuck` |
| Valid | `completed` + `failed` + `stuck` |
| Query | `sum(ae.journey{journey:funding,outcome:stuck}) / (sum(ae.journey{journey:funding,outcome:completed}) + sum(ae.journey{journey:funding,outcome:failed}) + sum(ae.journey{journey:funding,outcome:stuck}))` |
| Threshold | above `0` |
| Window | 15 minutes |
| Minimum | 1 valid event |

Any stuck funding command in the window pages. Honest payment failures do not, because they are not in the numerator.

## Chat

A clarification (`input_required`) is a finished answer. Anonymous and signed-in answers use the same tags. A second write of the same turn does not emit again.

| | |
|---|---|
| Good | `completed` + `input_required` |
| Bad | `failed` |
| Valid | those three |
| Query | `sum(ae.journey{journey:chat,outcome:failed}) / (sum(ae.journey{journey:chat,outcome:completed}) + sum(ae.journey{journey:chat,outcome:input_required}) + sum(ae.journey{journey:chat,outcome:failed}))` |
| Threshold | above `0.10` |
| Window | 30 minutes |
| Minimum | 10 valid events |

## Publish

A validation refusal is `refused` and is not in this ratio. `failed` is a commit that threw after the publish operation started. A replay of a publish that already completed does not emit again.

| | |
|---|---|
| Good | `completed` |
| Bad | `failed` |
| Valid | `completed` + `failed` |
| Query | `sum(ae.journey{journey:publish,outcome:failed}) / (sum(ae.journey{journey:publish,outcome:completed}) + sum(ae.journey{journey:publish,outcome:failed}))` |
| Threshold | above `0` |
| Window | 60 minutes |
| Minimum | 1 valid event |
