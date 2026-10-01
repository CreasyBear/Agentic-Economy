# Journey SLI alerts

Create each rule in the destination that actually receives its events. Web metrics can use Sentry; backend journey logs require a log destination. Do not script the Sentry API. Each rule is one journey.

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

Quote, Call, funding, chat, and publish reach their terminal state inside Convex. Convex does not load the Sentry SDK. Those attempts emit the `[ae.journey]` log line.

Convex's native Sentry integration reports **exceptions**, not ordinary journey logs or Sentry metrics. Configure it in **Convex → Deployment Settings → Integrations**, using the existing Sentry project's DSN. Convex tags its deployment type as `prod`, `dev` or `preview`; this does not establish AE's financial environment.

For journey logs, use Convex's native **PostHog log stream** to the existing US project. Set the service name to the explicit AE environment/deployment and verify a real journey line in PostHog before creating alerts. Log-stream events use OTLP bodies; the JSON log text is inside the console event's `message`. Do not assume the illustrative metric query below works unchanged on logs. Both exception reporting and log streams require Convex Pro.

Sources verified 1 October 2026: [Convex exception reporting](https://docs.convex.dev/production/integrations/exception-reporting), [Convex log streams](https://docs.convex.dev/production/integrations/log-streams). No custom bridge or new monitoring service is required. If the connected log product cannot express the ratio and minimum together, retain the query as a dashboard and use a verified supported alert; do not substitute a misleading ratio.

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

Logs alert, if the metric is not in the project yet: count lines containing `[ae.journey]` and `"journey":"search"` and `"outcome":"error"`, divided by lines containing `[ae.journey]` and `"journey":"search"`. Same threshold, window, and minimum.

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
