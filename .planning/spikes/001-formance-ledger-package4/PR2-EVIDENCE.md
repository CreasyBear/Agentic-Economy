# PR 2 evidence: native Package 4 bookings

## Result

`PASS`, with the official API boundary recorded below.

The pinned Ledger, Gateway, PostgreSQL, and TypeScript SDK completed the
Package 4 commercial lifecycle with one immutable strict schema and ten named
templates. The customer AUD sale and Provider USDC cost remain separate and
are linked only by the Call digest.

## Executed proof

Run from this directory with Node 22:

```sh
PATH="$HOME/.nvm/versions/node/v22.22.0/bin:$PATH" npm run test:lifecycle
```

The executable proof:

- credits settled Account AUD funding once;
- reserves Account AUD, Agent budget, legal-customer exposure, corporate USDC,
  and the pending Provider obligation with native atomic bulk;
- recognizes buyer revenue and GST separately;
- settles the Provider obligation from corporate USDC;
- appends a partial buyer adjustment;
- performs and idempotently replays a full native transaction reversal;
- idempotently replays the same funding command;
- rejects changed content under the same idempotency key;
- rejects an absent schema version, an unknown template, direct postings,
  insufficient funds, negative amounts, and malformed amounts; and
- reads the resulting balances through official SDK account queries.

Expected and observed balances matched exactly. The lifecycle uses only
official SDK methods and public decoded models; it does not read
`rawResponse`, parse errors, issue raw HTTP, or inspect PostgreSQL.

## Native enforcement boundary

Ledger v2.4.12 strict schemas enforce the chart shape and require named
templates. The current `ChartAccountRules` type is empty, however, and the
stable `machine` interpreter accepts full account and monetary variables.
Consequently, the official API itself also accepts:

- a valid but semantically wrong admitted account family;
- a syntactically valid but semantically wrong asset;
- a zero monetary value;
- `force=true`; and
- a request-level `experimental-interpreter` override.

This is not delegated to a new AE policy or ledger framework. The existing
Package 4 money Action boundary is the only caller of the private Gateway and
must expose closed command constructors that:

1. derive every account address from canonical server-side references;
2. bind the one expected asset to each named command;
3. accept only canonical positive integer strings inside the adopted range;
4. always send `runtime: machine`;
5. never expose or set `force`; and
6. submit only the exact immutable schema version and named template.

Gateway and Ledger remain private infrastructure. Browser and public protocol
callers never receive Ledger credentials or a Ledger endpoint. This mapping is
the minimum required translation from Package 4 domain commands to official
Formance templates; it is not a second ledger rules engine.

## Commercial observations

| Account | Asset | Observed units |
|---|---|---:|
| Account available | AUD/6 | 90,000,000 |
| Reversed Account | AUD/6 | 0 |
| Buyer adjustment | AUD/6 | 1,000,000 |
| Agent budget available | AUD_BUDGET/6 | 10,000,000 |
| Legal exposure available | AUD_EXPOSURE/6 | 990,000,000 |
| Sales revenue | AUD/6 | 8,090,909 |
| GST | AUD/6 | 909,091 |
| Treasury available | USDC/6 | 93,500,000 |
| Treasury committed | USDC/6 | 0 |
| Provider obligation accrued | USDC/6 | 0 |
| Provider obligation settled | USDC/6 | 6,500,000 |
| Provider settlement | USDC/6 | 6,500,000 |

## Disposition

Continue to contention and crash-recovery proof. The cutover is not yet
authorized: the existing Convex ledger remains paused until those and the
operational gates pass.
