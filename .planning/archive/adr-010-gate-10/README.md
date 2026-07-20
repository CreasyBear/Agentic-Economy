# ADR-010 Gate 10 archive

**Disposition:** `NARROW_OR_REDESIGN`
**Archived:** 2026-07-20
**Frozen direct baseline:** `1873de02b20fe548671f506315e23dbe693bd1e7`
**Last implementation evidence revision:** `90f6ce7c`
**Last recorded packet digest:** `sha256:c457e54b9b224b6b8d68d959ea919698c18d98ba1e141e8d8585b26e40e86da3`

## Finding

For the labelled local PublishedOperation comparison, direct and embedded hosts
required equal measured human effort. Gate 10 therefore did not establish an
experience payoff and is terminally `NARROW_OR_REDESIGN` for that class.

## What remains trustworthy

- the direct comparator was frozen before the integrated measurement;
- Request-owned and standalone hosts used one source-owned Action Invocation
  transition;
- rich and structured projections derived from the same invocation/version;
- uncertainty refused blind retry and reconciled through attributable evidence;
- the negative human-effort result is conservative because several measurement
  weaknesses favoured the embedded path.

## Why the comparator is retired

- its dirty-source allowlist omitted executable dependencies while naming clean
  `HEAD` provenance;
- accessibility requirements were derived from the embedded projection;
- embedded reconciliation burden was undercounted;
- direct and embedded privacy used asymmetric measurement;
- automated recovery was fixture-authored choreography rather than scheduler or
  operator evidence;
- it replaced global `Date.now` across awaited work.

The archived TypeScript is provenance, not an active or supported CLI. It may
not be used to claim accessibility in use, real-human effort, hosted operation,
provider fulfilment, customer value or production safety.
