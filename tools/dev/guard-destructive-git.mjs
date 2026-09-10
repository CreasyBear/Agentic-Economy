#!/usr/bin/env node
// Claude Code PreToolUse hook (Bash): refuse destructive git commands on this
// shared checkout. Subagents run concurrently in one working tree; `git stash`,
// `git checkout -- <path>`, `git restore`, `git reset --hard` and `git clean`
// discard or reshuffle other agents' uncommitted edits. Exit code 2 blocks the
// call and returns the message to the agent (Claude Code hooks contract).
import { readFileSync } from 'node:fs'

const BLOCKED = [
  /\bgit\s+stash\b/,
  /\bgit\s+checkout\s+(--|\.)(\s|$)/,
  /\bgit\s+checkout\s+--\s+\S/,
  /\bgit\s+restore\b/,
  /\bgit\s+reset\s+--(hard|merge|keep)\b/,
  /\bgit\s+clean\b/,
  /\bgit\s+push\s+.*--force\b/,
]

let input = ''
try {
  input = readFileSync(0, 'utf8')
} catch {
  process.exit(0)
}
let command = ''
try {
  command = String(JSON.parse(input)?.tool_input?.command ?? '')
} catch {
  process.exit(0)
}
const hit = BLOCKED.find((pattern) => pattern.test(command))
if (hit === undefined) process.exit(0)
process.stderr.write(
  `blocked: "${command.slice(0, 120)}" matches ${hit}. This checkout is shared by concurrent agents; ` +
    'stash/checkout --/restore/reset --hard/clean/force-push discard their edits. Report the need instead.\n',
)
process.exit(2)
