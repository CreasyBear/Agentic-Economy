import { spawnSync } from 'node:child_process'
import { generateText, Output } from 'ai'
import { z } from 'zod'
import { openRouterCostUsd, openRouterModel, DEFAULT_OPENROUTER_MODEL } from '../../src/modules/model-gateway/public'

const intentSchema = z.strictObject({ kind: z.enum(['research', 'discover', 'audit']),
  keyword: z.string(), url: z.string() })

// Explicit local opt-in. Retrieve only this provider-owned secret, into process memory.
// No production chat, customer data or payment endpoint is called by this planner.
export function createLivePlanner() {
  const secret = spawnSync(process.execPath, ['node_modules/convex/bin/main.js', 'env', 'get',
    'OPENROUTER_API_KEY', '--deployment', 'upbeat-cricket-954'], { encoding: 'utf8' })
  const apiKey = secret.status === 0 ? secret.stdout.trim() : ''
  if (!apiKey) throw new Error('trial_model_credential_unavailable')
  const model = openRouterModel({ apiKey, model: DEFAULT_OPENROUTER_MODEL }, DEFAULT_OPENROUTER_MODEL, { structuredOutputs: true })
  let requests = 0, knownCostUsd = 0
  const observations: unknown[] = []
  return {
    observations,
    async plan(query: string) {
      if (requests >= 12 || knownCostUsd >= 0.05) throw new Error('trial_model_budget_exhausted')
      requests += 1
      const begin = performance.now()
      const result = await generateText({ model, maxRetries: 0, maxOutputTokens: 700,
        timeout: { totalMs: 30_000 }, output: Output.object({ schema: intentSchema }),
        system: 'Classify a synthetic research/action request into kind, keyword, url. Research means obtain information. Discover means find a Tool without purchasing. Audit means perform a webpage audit, including when its URL is missing. Preserve the exact requested URL; use empty string when absent. Never invent a URL. You cannot grant spending authority. Examples: "Audit https://example.com" -> {"kind":"audit","keyword":"","url":"https://example.com"}; "Audit my page" -> {"kind":"audit","keyword":"","url":""}; "Find a Tool for batteries" -> {"kind":"discover","keyword":"batteries","url":""}; "Research batteries" -> {"kind":"research","keyword":"batteries","url":""}. Return only the object.',
        prompt: query,
      })
      const cost = openRouterCostUsd(result.providerMetadata)
      if (cost !== undefined) knownCostUsd += cost
      observations.push({ query, model: DEFAULT_OPENROUTER_MODEL, ms: Math.round(performance.now() - begin),
        costUsd: cost ?? null, usage: result.usage, intent: result.output })
      if (result.output.kind === 'audit' && !query.includes(result.output.url)) throw new Error('trial_model_invented_url')
      return result.output
    },
  }
}
