import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import { findFiles } from '@/lib/ui/contract-scans'

// Files that call fetch() with a non-literal (dynamic) URL argument but are known,
// reviewed provider clients hitting a fixed, hardcoded provider host rather than an
// owner- or user-supplied endpoint. A path lands here only after a human confirms
// its target cannot be attacker- or owner-influenced. Every other fetch(nonLiteralUrl)
// call site discovered by this scan must import the shared SSRF guard
// (`src/modules/storefront/internal/network-guard.ts`) instead of being added here.
// Extending this list is a conscious security decision, never a way to silence drift.
const KNOWN_PROVIDER_CLIENT_FILES: Record<string, true> = {
  // OpenRouter chat/model/follow-up-chip calls: fixed OpenRouter host, server-only API key.
  'src/modules/answer/internal/answer-tool-use-agent.ts': true,
  'src/modules/answer/internal/openrouter-models.ts': true,
  'src/modules/answer-thread/internal/llm-follow-up-chips.ts': true,
  // Autumn billing readback/reconciliation client: fixed Autumn host, server-only secret.
  'src/modules/billing/internal/provider-readback.ts': true,
  // Stripe Checkout Session creation: fixed Stripe host, server-only secret.
  'src/modules/business-action/internal/stripe-checkout.ts': true,
  // Web Bot Auth directory lookup at the caller-declared signature agent origin, used
  // only to verify inbound request signatures, never to import owner content.
  'src/modules/clearance/internal/web-bot-auth.ts': true,
  // Meilisearch search client: fixed, operator-configured search host.
  'src/modules/registry/internal/catalog-search-port.ts': true,
}

// A "non-literal" fetch(...) call is one whose first argument is not a single plain
// quoted string (identifiers, property access, template literals, and `new URL(...)`
// all count as non-literal). `\b` keeps this off `refetch(`/`prefetch(` call sites.
const NON_LITERAL_FETCH_PATTERN = /\bfetch\(\s*(?!['"][^'"$]*['"]\s*[,)])/
const NETWORK_GUARD_IMPORT_PATTERN = /from\s+['"][^'"]*network-guard['"]/

describe('SSRF surface drift', () => {
  it('requires every non-allowlisted fetch(nonLiteralUrl) call site to import the shared network guard', () => {
    const files = findFiles([
      { root: 'src/routes', includeExtensions: ['.ts'] },
      { root: 'src/modules', includeExtensions: ['.ts'] },
    ])

    const violations: string[] = []

    for (const file of files) {
      const normalized = file.replaceAll('\\', '/')
      if (KNOWN_PROVIDER_CLIENT_FILES[normalized] === true) {
        continue
      }

      const content = readFileSync(file, 'utf8')
      if (!NON_LITERAL_FETCH_PATTERN.test(content)) {
        continue
      }
      if (NETWORK_GUARD_IMPORT_PATTERN.test(content)) {
        continue
      }

      violations.push(normalized)
    }

    expect(violations).toEqual([])
  })

  it('keeps the storefront import fetch surface documented in the security spec', () => {
    const spec = readFileSync('.planning/SECURITY-SPEC.md', 'utf8')

    expect(spec).toContain('network-guard')
    expect(spec).toContain('api.storefront.import-draft')
  })
})
