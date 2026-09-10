import agentSkillMarkdown from '../../../../plugins/agentic-economy/skills/use-agentic-economy/SKILL.md?raw'

export const PublicAgentSkillPath = '/SKILL.md' as const

/** The public route and native plugin distribute the same maintained instructions. */
export function buildPublicAgentSkillMarkdown(_options: {
  canonicalBaseUrl: string
  routingBaseUrl?: string
}): string {
  return agentSkillMarkdown
}
