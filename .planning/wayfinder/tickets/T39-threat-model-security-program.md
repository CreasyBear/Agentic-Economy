# T39 — Threat model: spine, studies, commerce

Labels: `wayfinder:research` (AFK). Map: [Framework](../MAP-framework.md).

## Question

STRIDE-style pass over the new surfaces before cutover: project spine control (identity binding,
generation fences, event injection), study engine (prompt injection via web-discovered content —
quarantine boundaries from routing-kernel apply?), gardener-verb proposals (hostile/replayed/cyclic —
port T15 adversarial suite), commerce (mandate abuse, idempotency-key replay, refund fraud),
dependency supply chain (5 new deps this week — audit + pinning policy), secrets handling and
rotation. Output: ranked findings + the security gate checklist that T33 cutover must pass.

## Resolution

**Closed 2026-08-01.** Report: [`research/2026-08-01-threat-model-spine-studies-commerce.md`](../../research/2026-08-01-threat-model-spine-studies-commerce.md)
— ranked findings with file:line citations plus the 10-gate T33 security checklist and rollback
statements. Headlines: P0 spine identity/confused-deputy (projectSpine has no owner binding — T36
dependency); P0 secrets (54-key rotation from the T37 incident still pending); P1 generation
replay (advanceGeneration lacks expectedGeneration CAS); P1 event injection (sendDecision forwards
caller fields unvalidated; appendEvent dedupes operationKey without payload-hash comparison); P1
web-content prompt injection (proposal path appends raw web.discover resultJson to model evidence —
the answer catalog quarantine does not cover imported claims); dependency pinning gap (ranges in
manifest). The OAuth grant-mutation and consent-CSRF findings from the same session were FIXED
the same day (see MAP checkpoint). T15 adversarial suite maps to the three gardener verbs for T28.
