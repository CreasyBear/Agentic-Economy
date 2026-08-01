# AE parity loop

This is an autoresearch-style loop for the cold-agent supply surface.
The loop optimizes one fixed metric and does not declare a feature complete from
source inspection alone.

## Fixed metric

The metric is the parity score from `check-parity.mjs`.
Run it against the running local server at `http://127.0.0.1:3000`:

```sh
npm run dev
npm run parity:check -- --origin http://127.0.0.1:3000
```

The harness prints seven checks and a score from `0/7` through `7/7`.
It appends the commit, score, status, and check summary to
`eval/parity/results.tsv`. That file is runtime output and is ignored by Git.
The first run is always the baseline. Record its score before changing code.

## Search boundary

The agent may change the existing supply projection, discovery, and sandbox
modules. Keep the services catalog a projection of businesses, offerings, and
access paths. Do not add a second catalog or duplicate source of truth.

The agent MUST NOT modify `eval/parity/check-parity.mjs`. The harness is the
ground truth for this loop. The agent MUST NOT weaken authentication on any
key-gated write route. The agent MUST keep sandbox endpoints and responses
labelled honestly as sandbox; never claim provider fulfilment, payment, or x402
support that the source does not establish.

## Loop

1. Start from the current best score, then pick the smallest change likely to
   improve one failing check.
2. Make one focused change in the allowed source modules.
3. Run only focused tests for the changed boundary. Do not run a broad suite.
4. Run the parity harness and read its seven reasons and appended TSV row.
5. Keep the change only when the score strictly improves. Otherwise revert the
   change and return to the last best state.
6. Repeat from the new best state without stopping. A tie is not an improvement.

Keep changes small enough to identify which check changed. Do not hide a
failure by changing the metric, skipping a check, changing its input, or
hard-coding a response. Follow returned routes and source-owned contracts.

When the loop is stopped, leave the best-scoring source state intact and leave
the TSV history available for comparison. A `7/7` score is parity evidence for
this local sandbox run only; it is not evidence of independent provider
fulfilment, production reachability, payment, or customer value.
