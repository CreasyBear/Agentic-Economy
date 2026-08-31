/**
 * Brand-core voice strings for primary public surfaces.
 * Functional labels, accessibility copy, and machine descriptors stay with
 * their owning feature modules.
 *
 * Voice: sell Agentic Economy. Agent-first, short, concrete. Price before
 * the call. One connection, one wallet. Named jobs, not internal unit names.
 * Do not invent catalog counts, waitlists, or fees.
 */
import {
  AE_CLI_ARCHIVE_FILENAME,
  AE_MCP_INSTALLER_VERSION,
} from '@/lib/cli-distribution'

/** Canonical category sentence, kept for public metadata rather than the person-facing hero. */
const CORE_SENTENCE =
  'The marketplace built for agents. Discover, compare, and call. Pay per use. No per-provider accounts.'

/** Public market entry (`/`). */
export const HOME = {
  metaTitle: 'The marketplace built for agents | Agentic Economy',
  metaDescription: CORE_SENTENCE,
  heroHeading: 'The marketplace built for agents.',
  heroSubhead:
    'Search first. Inspect the price and access terms. Connect only when the selected call needs it.',
  catalogHeading: 'Current Operations',
  catalogBody: 'Current Operations, with price and readiness shown before you choose.',
  catalogUnavailable: 'The Operation catalog is temporarily unavailable',
  catalogUnavailableBody: 'Try again shortly. Existing Operation links continue to work.',
  catalogEmpty: 'No Operations are published yet',
  catalogEmptyBody: 'Publish the first bounded job, or check again after suppliers finish setup.',
  closeBody: 'Give your agent one instruction. It can search the catalog, inspect the price, and show the next valid action.',
  aboutLink: 'About',
} as const

export type AgentPasteInstruction = {
  heading: string
  body: string
  label: string
  code: string
  copyText: string
}

/** Market paste on `/`. Do not rewrite `copyText`. */
export const AGENT_INSTRUCTION: AgentPasteInstruction = {
  heading: 'Give this to your agent',
  body: 'One paste. It searches the live catalog, shows the strongest matches, and explains what each one can do now.',
  label: 'agent setup instruction',
  code: 'Search the catalog for my task. Show the best matches, total price, required inputs, and the next valid action.',
  copyText:
    'Read $ORIGIN/llms.txt. Preserve my full task, find viable capabilities, show the real differences, total price, required inputs, and the next valid action. Connect only if a callable capability requires it.',
}

/** Setup paste on `/for-agents`. Install and search first; connect only when required. */
export const AGENT_SETUP_INSTRUCTION: AgentPasteInstruction = {
  heading: 'Set this up with your agent',
  body: 'One paste installs the pinned CLI, adds the public MCP endpoint, and verifies both entry points. Connect only if a chosen call asks for it.',
  label: 'agent setup message',
  code: 'Install Agentic Economy and verify it in this coding agent.',
  copyText:
    `Set up Agentic Economy at $ORIGIN for this coding agent.\n\n1. Install the pinned CLI:\n   npm install --global "$ORIGIN/downloads/${AE_CLI_ARCHIVE_FILENAME}"\n2. Verify the CLI:\n   ae --version\n3. Identify this harness as exactly one of: codex, claude-code, cursor. Add the public MCP endpoint to that harness:\n   npx --yes add-mcp@${AE_MCP_INSTALLER_VERSION} "$ORIGIN/mcp" --name agentic-economy --transport http --global --agent "<agent>" --yes\n4. Verify that exact harness config and the live AE endpoints:\n   npx --yes add-mcp@${AE_MCP_INSTALLER_VERSION} list --global --agent "<agent>"\n   ae doctor --base-url "$ORIGIN" --json\n\nIf npm reports EACCES, use this one-shot user-owned prefix instead. Do not use sudo or change npm configuration:\n   npm install --global --prefix "$HOME/.local" "$ORIGIN/downloads/${AE_CLI_ARCHIVE_FILENAME}"\n   "$HOME/.local/bin/ae" --version\n   "$HOME/.local/bin/ae" doctor --base-url "$ORIGIN" --json\n\nRestart this harness after MCP installation. Confirm that ae_registry_operations_search is visible. The setup is usable when the server, MCP, readiness, and release checks pass; buyer warnings only mean paid or authenticated calls are not connected yet. Do not connect unless a selected callable Operation requires it.\n\nReport whether CLI installation, MCP config, live MCP discovery, and public tool visibility worked. If anything failed, include the exact failing check and one exact recovery command.`,
}

/** First post-restart task on `/for-agents`. Exercises the actual market loop. */
export const AGENT_STARTER_INSTRUCTION: AgentPasteInstruction = {
  heading: 'Starter prompt after restarting',
  body: 'Use the market once on a real task. The agent must compare current Operations, state the price before a paid call, and return evidence instead of claiming success from setup alone.',
  label: 'starter prompt',
  code: 'Research the latest developments in AI coding agents with Agentic Economy.',
  copyText:
    'Use Agentic Economy to research the latest developments in AI coding agents. Search the live market and compare the best available Operations. Inspect the strongest option, including its total price, required inputs, readiness, and access requirements. Run it once if it is free and callable now; if it is paid, ask me to approve the exact total before running it. Summarize the result with sources and the Agentic Economy evidence or receipt. If no Operation can run, do not claim that it did—give me the single exact next command.',
}

/** Agent/Runtime door on `/` (routes to /for-agents). */
export const AGENT_DOOR = {
  heading: 'For your agent',
  body: 'Search and inspect without a key. Connect once when a call needs it.',
  cta: 'Connect your agent',
  href: '/for-agents',
} as const

/** Agent/Runtime landing (`/for-agents`) — setup for named harnesses, then the market. */
export const AGENT_PAGE = {
  metaTitle: 'One connection, every tool | Agentic Economy',
  metaDescription:
    'Claude Code, Cursor, and Codex connect once. Then search, compare, and call listed tools from one wallet. No per-provider accounts.',
  eyebrow: 'Connections',
  heading: 'One connection to the market.',
  harnesses: 'Claude Code, Cursor, and Codex',
  subhead: 'Search and inspect first. Connect only when a callable Operation requires it.',
} as const

/** Supplier door on `/` (routes to the existing supply mode). */
export const BUSINESS_DOOR = {
  heading: 'Publish an Operation',
  body: 'Publish one bounded job, its price, readiness, and access terms. Agents inspect before they call.',
  cta: 'Publish an Operation',
  href: '/for-providers',
} as const

/** Company page (`/about`). No team roster, logos, or invented customers. */
export const ABOUT = {
  metaTitle: 'About | Agentic Economy',
  metaDescription: CORE_SENTENCE,
  eyebrow: 'About',
  heading: 'Who this market is for.',
  subhead:
    'Agents find, compare, and call. Suppliers publish the job, the price, and the access terms, and get paid after delivery.',
  doorsHeading: 'Agents and suppliers',
  settlementHeading: 'Pay per call',
  settlementBody:
    'Browse and inspect without a provider account. The price sits on the card before a call. Suppliers are paid when the job is delivered.',
  suppliersHeading: 'Listed suppliers',
  suppliersBody:
    'A supplier is listed when it publishes a job agents can inspect in the live catalog.',
  machinesHeading: 'Files for agents',
  machinesBody: 'The same facts the site shows: an index, a skill file, and a handshake.',
} as const

/** Public footer wordmark line. */
export const FOOTER = {
  tagline: 'The marketplace built for agents.',
} as const
