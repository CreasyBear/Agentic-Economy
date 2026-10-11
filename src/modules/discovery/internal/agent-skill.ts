import agentSkillMarkdown from '../../../../plugins/agentic-economy/skills/use-agentic-economy/SKILL.md?raw'

import { availabilityStatement } from '@/content/availability-copy'
import { trimTrailingSlashes } from '@/modules/common/trim-trailing-slashes'

export const PublicAgentSkillPath = '/SKILL.md' as const

const packagedSkillBaseUrl = 'https://app.aecon.ai'

/** The packaged file carries the pre-launch availability line; the route swaps in the live one. */
export function buildPublicAgentSkillMarkdown(options: {
  canonicalBaseUrl: string
  availabilityStatement?: string
}): string {
  return agentSkillMarkdown
    .replace(availabilityStatement('soon'), options.availabilityStatement ?? availabilityStatement('soon'))
    .replaceAll(packagedSkillBaseUrl, trimTrailingSlashes(options.canonicalBaseUrl))
}
