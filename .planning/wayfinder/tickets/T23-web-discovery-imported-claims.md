# T23 — Web discovery as Imported Claims when supply is absent

Labels: `wayfinder:task` (closed 2026-08-01). Map: [Agent engine](../MAP-engine.md).

## Question

Ultraloop 2 blind eval (`output/eval/ultraloop2/verdict.md`) showed live web knowledge was decisive in
3/6 asks — exactly the no-supply ones (funeral Parramatta, fortepiano). Add a registered observation
action (`web.discover` or similar) the kernel can offer when `registry.search` returns zero: it finds
real local businesses on the web and surfaces them as **Imported Claims** (UBIQUITOUS_LANGUAGE:
provenance preserved, never upgraded to AE-verified truth), rendered as "not listed yet — here are real
providers we found; want AE to invite them?" feeding the claim funnel. Boundary: web results NEVER
blend into listed-supply answers as if bookable; discovery is a labelled recovery step and a supply-side
growth loop. Reuse the existing `storefront.enrich` web-search seam.

## Resolution

Resolved 2026-08-01. Added registered read-only `web.discover` observation supply through the existing
OpenRouter web-search seam. Empty registry results can dispatch one bounded web search, persist the
results as Imported Claims, render them separately from AE-listed options with source links, and offer
an invite-to-list path.

Every rendered claim now requires its own model-returned `sourceUrl` to exactly match a provider
citation; unbound claims are discarded. This closes an Ultraloop 3 defect where one citation was copied
onto unrelated businesses.

Evidence: focused action/storefront/answer suites in the 367-test consolidated gate; local browser runs
rendered WN Bull Funerals in Parramatta and Adelaide-area fortepiano restorers with web-source and claim
links before the stricter citation binding landed. Post-binding unit proof rejects an uncited invented
business. Proof ceiling: provider availability remains nondeterministic; one local run proves neither
hosted reliability nor that a claim is true, current, available, or AE-verified.
