import agentSkillMarkdown from '../../../../plugins/agentic-economy/skills/use-agentic-economy/SKILL.md?raw'

import { availabilityStatement } from '@/content/availability-copy'
import { trimTrailingSlashes } from '@/modules/common/trim-trailing-slashes'

export const PublicAgentSkillPath = '/SKILL.md' as const

const packagedSkillBaseUrl = 'https://app.aecon.ai'

/** The public route and native plugin distribute the same maintained instructions. */
export function buildPublicAgentSkillMarkdown(options: {
  canonicalBaseUrl: string
  availabilityStatement?: string
}): string {
  return agentSkillMarkdown
    .replace('{{availability}}', options.availabilityStatement ?? availabilityStatement('soon'))
    .replaceAll(packagedSkillBaseUrl, trimTrailingSlashes(options.canonicalBaseUrl))
}
