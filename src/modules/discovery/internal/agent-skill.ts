import agentSkillMarkdown from '../../../../plugins/agentic-economy/skills/use-agentic-economy/SKILL.md?raw'

import { withUtm } from '@/lib/attribution/with-utm'
import { availabilityStatement } from '@/content/availability-copy'
import { trimTrailingSlashes } from '@/modules/common/trim-trailing-slashes'

export const PublicAgentSkillPath = '/SKILL.md' as const

const packagedSkillBaseUrl = 'https://app.aecon.ai'

/** Human-followed pages only; /mcp and API paths stay bare because clients call them. */
const humanPagePaths = ['/for-agents', '/for-providers', '/support'] as const
const skillUtm = { source: 'aecon', medium: 'agent', campaign: 'install', content: 'skill_md' } as const
const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')

/** The packaged file carries the pre-launch availability line; the route swaps in the live one. */
export function buildPublicAgentSkillMarkdown(options: {
  canonicalBaseUrl: string
  availabilityStatement?: string
}): string {
  const baseUrl = trimTrailingSlashes(options.canonicalBaseUrl)
  let markdown = agentSkillMarkdown
    .replace(availabilityStatement('soon'), options.availabilityStatement ?? availabilityStatement('soon'))
    .replaceAll(packagedSkillBaseUrl, baseUrl)
  for (const path of humanPagePaths) {
    const bare = `${baseUrl}${path}`
    markdown = markdown.replace(new RegExp(`${escapeRegExp(bare)}(?![\\w/?-])`, 'gu'), withUtm(bare, skillUtm))
  }
  return markdown
}
