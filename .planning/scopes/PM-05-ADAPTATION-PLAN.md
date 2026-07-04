# PM-05 adaptation plan

**Status:** active prerequisite, not yet complete; promise fixture, claim ledger, and empty reviewer-evidence template now exist.  
**Source:** `.planning/scopes/PM-05-trust-language-red-team.md`.  
**Blocks:** public/demo copy and assistant-visible descriptors for Scopes 2-5, plus any action descriptor widening.

## Objective

Turn the PM-05 ADAPT verdict into an executable copy/descriptor gate before any downstream plan changes public wording, demo scripts, SEO metadata, `llms.txt`, agent JSON payloads, or action summaries/boundaries.

## Required work

1. **Rename table consumption.** Every consuming plan must use the PM-05 replacements:
   - `agent-native supply` -> `assistant-readable listings`.
   - `capability registry` / `capability` -> `available next steps`, `published contact options`, `listing detail`, or `contact option` on human surfaces.
   - `business_endpoint` / `endpoint` -> `business reply channel` on human surfaces.
   - `operationMode` -> `how replies are handled`.
   - `agent-operated demo business` -> `AE-operated demo reply path` or `demo business reply simulator`.
   - `readback` -> `status`, `thread status`, or `receipt status`.
   - `receipt-backed action` -> `receipt-backed local demo` or `receipt record`.
   - `businessAction.propose` -> `request an owner-reviewed proposal`.
   - `quote acceptance` -> `intent to continue` or `next-step request`.
   - `verified` -> `checked`, `business-supplied`, `published`, `last checked`, or `needs confirmation` unless paired with a named standard and evidence row.
   - Handshake/HSK/kernel/greenlight/clearance/mandate/protocol/ActionContract terms -> omit publicly; if unavoidable in machine descriptors, describe only `signed request` / `owner approval` boundaries.

2. **Scan additions.** Patch copy/SEO/descriptor tests so public human surfaces and assistant-visible descriptors fail on PM-05 banned patterns. Allow internal `.planning/**`, tests, and code identifiers only through named allowlists.

3. **Promise fixture.** Write a single revised promise/copy fixture before reviewers see it. Required truths:
   - AE can read, compare, summarize, route, and submit a qualified inquiry where available.
   - AE does not book, charge, dispatch, auto-fulfil, imply live availability, imply marketplace liquidity, or claim unqualified verification.
   - Current tools remain `registry.search`, `registry.detail`, `inquiry.submit`; only `inquiry.submit` writes, and it sends a qualified inquiry for owner review.
   - Scope 4/5 demo terms must say source/local/test-mode and no live payment/production proof when applicable.

4. **Three-reviewer evidence.** Collect three uninvolved reviewer answers to the PM-05 questions. Passing means every reviewer correctly answers: no booking, no payment, no dispatch, no auto-fulfilment, no unqualified verification, and only gated qualified inquiry / owner-reviewed proposal / status lookup where explicitly available.

5. **Claim ledger.** For every changed public/demo/agent descriptor claim, add a row with claim text, surface, proof level, evidence pointer, missing gates, allowed wording, forbidden adjacent wording, and owner phase.

## Current artifacts

| Artifact | Status | Notes |
|---|---|---|
| `.planning/scopes/PM-05-PROMISE-FIXTURE.md` | Scaffolded | Reviewer fixture only; not shipped public/demo/assistant copy. |
| `.planning/scopes/PM-05-CLAIM-LEDGER.md` | Scaffolded | Seed rows cover the fixture claims; every future changed surface needs a row. |
| `.planning/scopes/PM-05-REVIEWER-EVIDENCE.md` | Empty template | No uninvolved reviewer answers recorded; PM-05 remains ADAPT. |
| `tests/copy/pm05-trust-language-gate.test.ts` | Added/passing focused test | `npm run test:copy` now covers PM-05 public/assistant-visible banned terms, allowlists, named-standard verified exception, and SEO copy. |


## Consumers

| Consumer | Required PM-05 artifact before it proceeds |
|---|---|
| Scope 2 / 02-04 registry search, discovery, disclosure, copy | Rename table + public/agent descriptor scan additions; no human-facing `capability`, `endpoint`, `operationMode`, or `verified`. |
| Scope 3 / 03-02 agent-door identity public posture | Handshake/identity vocabulary scan additions; descriptor says signed request does not grant authority. |
| Scope 4 / 04-04 provenance/demo | Copy fixture distinguishing delivered vs read, quote vs transaction, AE demo reply vs real business reply, and intent vs booking/payment. |
| Scope 5 / 05-04 demo/verifier | Evidence-boundary matrix; every Stripe/pay/paid/checkout term paired with `test-mode` or `source/local` and `no live payment`; no registered/exposed propose claim. |
| Any action descriptor widening | Deliberate snapshot diff + boundary review + current tool list comparison. |

## Verification

- PM-05 renamed fixture exists and is linked from the consuming plan: `.planning/scopes/PM-05-PROMISE-FIXTURE.md`.
- Claim ledger exists and is linked from the consuming plan: `.planning/scopes/PM-05-CLAIM-LEDGER.md`.
- Three real reviewer responses are recorded with date, reviewer role, answers, and PASS/FAIL in `.planning/scopes/PM-05-REVIEWER-EVIDENCE.md`.
- `npm run test:copy` and `npm run test:seo` pass after scan additions.
- If agent descriptor payloads change, the focused agent-tools snapshot test passes and the diff is reviewed for boundaries.

## Done

PM-05 moves from ADAPT to GO only after the scan diffs, promise fixture, and three reviewer responses exist. Until then, all public/demo copy and assistant-visible descriptor work remains blocked or internal/source-local only.
