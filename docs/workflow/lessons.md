# Workflow lessons

Curated guidance for new work. Product and architecture authorities take
precedence. Existing historical lessons remain at `.superstack/learnings.md`;
consult relevant entries without copying the whole ledger here.

## WF-L-001 — Prove the promised environment

- **Applies to:** platform/client integration and harness configuration.
- **Evidence:** the existing [native connection map](../../.planning/wayfinder/agent-connection/MAP.md)
  explicitly separates source/SDK evidence from clean-profile client proof; the
  September audit keeps `SOURCE_RESOLVED` distinct from live closeout.
- **Action:** name the required client/environment in each acceptance criterion;
  preserve missing native proof as remaining work.
- **Last checked:** 2026-09-05. These local historical records may be unavailable
  in a clean checkout; no new live proof was performed for this workflow setup.
- **Status:** active; does not imply any product journey is currently broken.

## WF-L-002 — A register needs deduplication and ownership

- **Applies to:** findings and housekeeping.
- **Evidence:** `PAPERCUTS.md` has 2,427 lines and explicitly warns that the
  historical logger appends without deduplicating. Multiple dated audit ledgers
  also exist under `.planning`.
- **Action:** check for an existing behavioral finding, keep one current status
  and link original evidence. Promote historical entries only when revalidated.
- **Last checked:** 2026-09-05; no historical entries were migrated or deleted.
- **Status:** active; closure needs evidence rather than a checked box.
