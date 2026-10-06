import { AgentRun } from '@/components/ae/shared/arc-pro/chat/AgentRun'
import type { WorkDisclosureProps } from './generative.contracts'

export function WorkDisclosure({ view }: WorkDisclosureProps) {
  return <AgentRun view={view} />
}
