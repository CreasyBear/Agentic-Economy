# PR 3 evidence: contention and recovery

## Result

`PASS`

Native Formance atomic bulk decided the winning reservations under contention.
The existing Package 4 command/reference lifecycle is sufficient for recovery;
the spike adds no queue, saga, command table, retry engine, or workflow state.

## Contention proof

```sh
PATH="$HOME/.nvm/versions/node/v22.22.0/bin:$PATH" npm run test:contention
```

The proof submitted 100 simultaneous managed-Call reservations against exact
capacity for ten. Each reservation used one official atomic bulk with:

```text
atomic=true
parallel=false
continueOnFailure=false
schemaVersion=v1.0.0
```

Observed result:

- exactly 10 Calls committed;
- exactly 90 Calls lost contention;
- Account AUD, shared Agent Principal budget, legal-customer exposure, and
  corporate USDC each reserved exactly 10 units;
- every losing Call had zero buyer reserve and zero Provider obligation;
- replaying a winning atomic bulk changed no balance and created no duplicate;
- each transaction was found through its exact stable reference; and
- no error message or metadata search was used as recovery authority.

Warm local official-SDK performance after the contention burst was:

| Operation | p95 |
|---|---:|
| Idempotent reservation read/write | 3.76 ms |
| Exact-reference readback | 2.30 ms |

The final 100-way burst itself completed at 270.26 ms p95. This is operating-envelope
evidence, not a production capacity promise.

## Restart and lost-response proof

```sh
PATH="$HOME/.nvm/versions/node/v22.22.0/bin:$PATH" npm run test:recovery
```

The proof:

1. submitted one funding command and intentionally discarded the accepted SDK
   response;
2. restarted the official Ledger container;
3. created a fresh SDK client, representing a resumed Action process;
4. recovered the transaction by exact Formance reference;
5. proved an absent reference remains absent;
6. replayed the same command to the original transaction; and
7. proved changed content under the same idempotency key is refused.

No x402 dispatch occurs in either proof. Possible external submission remains
owned by the existing Package 4 submission fence and continues to return
`outcome_unknown`; Formance reference readback closes only the ledger booking
question.

## Crash-matrix disposition

| Fence | Authoritative recovery |
|---|---|
| Before SDK submission | Reference absent; existing command may retry only when no submission is proven |
| Accepted, response lost | Exact reference returns the committed transaction |
| SDK returns before Convex finalization | Existing finalize/reconcile mutation reads the exact reference |
| Convex Action restarts | Durable Convex command identity plus a fresh SDK client |
| Ledger API restarts | PostgreSQL state plus exact reference readback |
| Repeated same command | Native idempotent replay |
| Changed request, same idempotency key | Native refusal |

PostgreSQL restart and backup/restore are assigned to the operations gate,
where persistence is verified end to end.

## Disposition

Continue to pagination, service restart, backup/restore, and pinned-version
upgrade proof. The cutover remains pending until that final operational gate
passes.
