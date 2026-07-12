export function buildPublicAgentSkillMarkdown(options: { canonicalBaseUrl: string; routingBaseUrl?: string }): string {
  const base = trimTrailingSlash(options.canonicalBaseUrl)
  const routingBase = trimTrailingSlash(options.routingBaseUrl ?? options.canonicalBaseUrl)
  return [
    '# Agentic Economy — assistant setup',
    '',
    `Fetch this file from the site origin (\`GET ${base}/SKILL.md\`). It teaches the cold path`,
    'for assistants that discover AE without a human briefing.',
    '',
    '## What AE is',
    '',
    'AE routes a natural-language request across registered capability providers, returns',
    'an inspectable quote, and executes only after bounded caller authorization.',
    '',
    '## Hop sequence (do this in order)',
    '',
    `1. Read \`GET ${base}/llms.txt\` for the public surface index and catalog lines.`,
    `2. Read \`GET ${routingBase}/.well-known/ae-routing.json\` for HTTP and MCP projections.`,
    '3. Sign `route` with the declared caller-authentication profile.',
    '4. Review the quote, cost, effects, disclosures, expiry, and enforcement posture.',
    '5. Authorize before `execute`; use `inspect` and `cancel` on the resulting Root Run.',
    '',
    `Browse without a search query: \`GET ${base}/api/businesses\` (list) or`,
    `\`GET ${base}/api/businesses/search?q=\`.`,
    '',
    '## Refusal recovery',
    '',
    '- `401` means the request is unsigned, invalidly signed, or has no active caller grant.',
    '- `429` or `503` includes `Retry-After`; do not bypass admission through listing APIs.',
    '- An unknown provider outcome must be reconciled or inspected, never blindly retried.',
    '',
    '## Boundaries (hard)',
    '',
    'Business listings are supply facts, not routing or execution authority.',
    'Never choose provider tools directly when delegating the decision to AE.',
    '',
    '## Privacy',
    '',
    `\`${base}/privacy/remove-business\` for listing correction or removal requests.`,
    '',
  ].join('\n')
}

function trimTrailingSlash(value: string): string {
  return value.endsWith('/') ? value.slice(0, -1) : value
}
