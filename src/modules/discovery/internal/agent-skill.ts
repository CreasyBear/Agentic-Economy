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
    'Give AE a natural-language request. AE asks for decision-changing information, checks',
    'connected registered businesses, and returns unranked options. It does not select,',
    'purchase, or book anything in this workflow.',
    '',
    '## Request sequence (do this in order)',
    '',
    `1. Read \`GET ${base}/llms.txt\` for the current public surface index.`,
    '2. Obtain an AE API key with `customer_requests:create` and send it as a Bearer token.',
    `3. \`POST ${base}/api/v1/requests\` with an idempotency key, opaque request reference, natural-language request, known facts, and spending boundary.`,
    '4. Follow `clarification.answerKind`: send natural-language answers to `/messages`; send only requested typed values to `/facts`.',
    '5. Follow the returned `nextAction`: prepare options, wait, retry, or revise the same Request.',
    '6. Resume at any time with `GET /api/v1/requests/:requestRef` using the same API key.',
    '7. Inspect `options_ready` as an unranked comparison. Do not infer selection or commitment.',
    '',
    `Browse without a search query: \`GET ${base}/api/businesses\` (list) or`,
    `\`GET ${base}/api/businesses/search?q=\`.`,
    '',
    '## Refusal recovery',
    '',
    '- `401` means the API key is missing, invalid, expired, or revoked.',
    '- `403` means the key lacks `customer_requests:create`.',
    '- `preparing_options` means wait or resume the same Request; do not create a replacement.',
    '- `needs_attention` means retry or revise according to `nextAction`.',
    '',
    '## Boundaries (hard)',
    '',
    'Business listings are supply facts, not routing or execution authority.',
    'Never choose provider tools directly when delegating the decision to AE.',
    '',
    '## Advanced routing',
    '',
    `Low-level signed routing remains described at \`${routingBase}/.well-known/ae-routing.json\`.`,
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
