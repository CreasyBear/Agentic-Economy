import { AgentRun } from '@/components/arc/chat/AgentRun'
import type { WorkDisclosureProps } from './generative.contracts'

export function WorkDisclosure({ view }: WorkDisclosureProps) {
  return <AgentRun view={view} />
}
