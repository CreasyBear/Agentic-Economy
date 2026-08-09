<!-- convex-ai-start -->

This project uses [Convex](https://convex.dev) as its backend.

When working on Convex code, **always read
`convex/_generated/ai/guidelines.md` first** for important guidelines on
how to correctly use Convex APIs and patterns. The file contains rules that
override what you may have learned about Convex from training data.

Convex agent skills for common tasks can be installed by running
`npx convex ai-files install`.

<!-- convex-ai-end -->

# Log papercuts

Important! When you hit a small friction while working—a tool call that missed
and had to be retried, a confusing or undocumented setup step, a flaky command,
a stale cache, a misleading error, a non-obvious gotcha—log it to `PAPERCUTS.md`
via `npm run papercut -- -m <model> "message"`. One or two sentences: what you
were doing → what got in the way (a guess at the cause/fix is a bonus). Do this
proactively, in the moment, even though none of these are blocking—logged
together they show where the repo needs sanding down. This is distinct from
`LOG.md` (what you accomplished) and from Linear issues (real bugs / tracked
work).

