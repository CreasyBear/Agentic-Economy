# Agent surface: MCP and `ae` CLI, 2026-10-09

## The problem, measured

Agents get too much context and can't tell what to do next.

- **Searching returns things nobody can use.** `weather` returns 8 results, all "External listing (not AE callable)". None has a reference that `describe` accepts, and every result's next step is empty.
- **About 38 KB lands before the first call:** 4 KB of MCP instructions plus 34 KB of `tools/list`. Of that, 31 KB is output schemas.
- **The search "Next" line is 1.5 KB,** mostly a 722-character cursor.
- **The workflow is restated three times,** in the MCP instructions, `/llms.txt` and `/SKILL.md`, and they drift apart.
- **The CLI has about 60 commands and about 20 global flags,** and no `--quiet`.

## References studied

- **Anthropic, "Writing effective tools for agents":** few task-level tools, concise vs detailed responses, errors that teach, human-meaningful IDs.
- **Anthropic, code execution with MCP, and the Claude tool search docs:** progressive disclosure. Tool choice degrades past 30–50 tools, so keep 3–5 loaded up front.
- **GitHub MCP:** default toolsets. **Stripe MCP:** a small set of named tools plus approval links for writes.
- **treg:** `catalog_search` returns a verdict (strong, closest, none), and `none` points to `catalog_request`. Its errors name the recovery. It caps spend per call.
- **Mercator:** `nextTool` on every response, a free quote, and `approved_total` on execute.
- **Composio:** search returns 4–6 tools plus a recommended plan and `next_steps_guidance`.
- **Executor:** search, describe, call, then resume. Credentials never reach the agent.
- **clig.dev, gh, Vercel and Stripe CLIs:** terse human output plus `--json`, the next command on success, errors with the fix, no prompts without a TTY, `--yes` and `--dry-run`, and named exit codes.

## The design

**The core loop is four verbs plus account:** search, inspect, call, status, account. Everything else is deferred.

| MCP tool | CLI | Returns | Ends with |
|---|---|---|---|
| `ae_search(task, limit=5)` | `ae search "<task>"` | Up to 5 callable tools: readable `id` (`provider/tool`), name, one line, price per call, success rate if measured, and a verdict (strong, closest or none) | `next: ae_inspect id=<top id>`. On `none`, the next step is `ae_request`. |
| `ae_inspect(id)` | `ae inspect <id>` | Input schema, one example input, price, readiness | `next: ae_call id=… input=<example>` |
| `ae_call(id, input, max_price)` | `ae call <id> --input … --max-price … --yes` | The result, the price paid and a receipt id. It refuses above `max_price`, naming the exact re-run. | `next: ae_status call=…` only if the call is pending |
| `ae_status(call)` | `ae status <call>` | State, with a poll hint while pending | The finished result |
| `ae_account()` | `ae account` | Balance, connected or not, and connect or top-up links | The link to open. Credentials never enter the model. |

**Rules:**
1. **Callable only, by default.** External Bazaar listings appear only with `include_external`. Each one then shows an honest reason ("not callable through aecon yet") and `ae_request`.
2. **Readable IDs.** Agents see `provider/tool`. The `operation:v1:<hex>` reference stays internal, and both forms are accepted as input.
3. **Context budget.** `tools/list` is at most 4 KB, which means no large output schemas inline. The instructions are at most 3 lines and point to `SKILL.md`. Five search results take at most 2 KB. A "next" line is at most 120 characters, and paging is `page=2`, never a raw cursor.
4. **Errors teach.** Each error carries what happened, whether you were charged, and the exact next call.
5. **Deferred toolsets.** Compare, request, feedback, plans, saved items and provider tools load behind toolsets, the way GitHub's MCP does. They don't sit in the default list.
6. **CLI.** Short help shows the 5 core commands, and full help shows the rest as `noun verb`. Human output is the default, and `--json` takes fields, like gh. There are no prompts without a TTY. Exit codes: 0 ok, 2 usage, 3 needs approval or price, 4 not connected or out of funds, 5 provider failed.
7. **One source of truth.** `SKILL.md`, `/llms.txt` and the MCP instructions are generated from the same action manifest. `/llms.txt` becomes a short pointer.

## Proof by real use

- A fresh Claude Code session with only the MCP URL, told "find a weather API and get Sydney's forecast", finishes in 4 tool calls or fewer, with under 10 KB of aecon context.
- An agent with only `ae` installed does the same.
- Record the before and after numbers: 38 KB cold start and an 8-of-8 unusable search, against the targets.

## Build order

1. Search defaults to callable tools, with readable IDs and a per-result next step. This is the biggest win.
2. Shrink `tools/list` and the instructions, and move non-core tools behind toolsets.
3. Make the CLI core 5 match the MCP tools, with `--max-price`, `--yes`, exit codes and short help.
4. Generate the docs from one source.
