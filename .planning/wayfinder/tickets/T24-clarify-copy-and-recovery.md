# T24 — Clarification discipline and no-supply recovery on the ask→plan axis

Labels: `wayfinder:task` (AFK). Map: [Agent engine](../MAP-engine.md).

## Question

Blind-judge gaps from ultraloop 2 (`output/eval/ultraloop2/verdict.md`), all on the ask→plan axis:
(1) vague-ask template leaks routing slots — "What kind of service do you need in Can you help me?"
interpolates the raw ask as a place; ask one natural open question instead. (2) No-supply plan
outcomes end dead: "No current listed option is ready to recommend" with no recovery — must offer a
bounded continuation (broaden area, capture a portable brief, or T23 discovery) in the same turn.
(3) Funeral ask asked to "broaden to Parramatta" when Parramatta WAS the request (misspelling was
normalized silently, then echoed as if new) — clarifications must never re-ask what the person already
said. (4) Judge's context gap: attach compact domain-critical context to results (appointment window,
red flags, quote guidance) from listed data only.

## Resolution

In progress. The vague-ask and repeated-place failures are fixed: `Can you help me?` returns exactly
`What do you need help with?`; concise no-supply prose and recovery controls exist; the public voice now
leads with `Your AI knows who to call.` rather than directory/defensive copy.

Ultraloop 3 (`output/eval/ultraloop3/verdict.md`) keeps this ticket open. AE ranked last on every
non-vague ask because `continue nearby or carry this request forward` still describes recovery without
executing or confirming it, and a rendered plan can terminate with pending steps. Close only when one
no-supply turn visibly widens supply or persists a carry-forward Request with a named next event, and
the plan card reaches completed/failed/blocked truth rather than stale `pending`.
