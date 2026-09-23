import { useQuery } from 'convex/react'

import { parseAdminObjectRef } from '@/lib/operator/admin-console/ref-parsers'
import type { CallRef } from '@/modules/capability-execution/call-contracts'
import type { PublicToolRef } from '@/modules/capability-supply/public'
import type { AccountRef } from '@/modules/principal-account/account/public'
import type { PrincipalRef } from '@/modules/principal-account/principal/public'
import { api } from '../../../../../convex/_generated/api'
import type {
  AdminObjectPageRef,
  AdminObjectPageView,
} from './object-pages.contracts'

type AdminObjectPageRead =
  | AdminObjectPageView
  | Readonly<{ kind: 'object_not_found' }>
  | Readonly<{ kind: 'refused'; code: string }>
  | undefined

const OBJECT_NOT_FOUND: Readonly<{ kind: 'object_not_found' }> = {
  kind: 'object_not_found',
}

export function useAdminObjectPage(ref: AdminObjectPageRef): AdminObjectPageRead {
  const result = useQuery(api.adminConsoleObjects.readAdminObject, { ref })
  if (result === undefined || result.kind === 'object_not_found' || result.kind === 'refused') {
    return result
  }

  switch (result.kind) {
    case 'quote': {
      const quote = parseAdminObjectRef('quote', result.ref)
      if (quote.kind !== 'valid' || quote.ref.kind !== 'quote') return OBJECT_NOT_FOUND

      let toolRef: PublicToolRef | null = null
      if (result.toolRef !== null) {
        const tool = parseAdminObjectRef('tool_version', result.toolRef)
        if (tool.kind !== 'valid' || tool.ref.kind !== 'tool_version') return OBJECT_NOT_FOUND
        toolRef = tool.ref.ref
      }
      let workspaceRef: AccountRef | null = null
      if (result.workspaceRef !== null) {
        const workspace = parseAdminObjectRef('workspace', result.workspaceRef)
        if (workspace.kind !== 'valid' || workspace.ref.kind !== 'workspace') return OBJECT_NOT_FOUND
        workspaceRef = workspace.ref.ref
      }
      let agentRef: PrincipalRef | null = null
      if (result.agentRef !== null) {
        const agent = parseAdminObjectRef('agent', result.agentRef)
        if (agent.kind !== 'valid' || agent.ref.kind !== 'agent') return OBJECT_NOT_FOUND
        agentRef = agent.ref.ref
      }
      let consumedCallRef: CallRef | null = null
      if (result.consumedCallRef !== null) {
        const call = parseAdminObjectRef('call', result.consumedCallRef)
        if (call.kind !== 'valid' || call.ref.kind !== 'call') return OBJECT_NOT_FOUND
        consumedCallRef = call.ref.ref
      }
      return {
        ...result,
        ref: quote.ref.ref,
        toolRef,
        workspaceRef,
        agentRef,
        consumedCallRef,
      }
    }
    case 'tool_version': {
      const tool = parseAdminObjectRef('tool_version', result.ref)
      const provider = parseAdminObjectRef('provider', result.businessSlug)
      if (
        tool.kind !== 'valid' || tool.ref.kind !== 'tool_version'
        || provider.kind !== 'valid' || provider.ref.kind !== 'provider'
      ) return OBJECT_NOT_FOUND
      return {
        ...result,
        ref: tool.ref.ref,
        businessSlug: provider.ref.ref,
      }
    }
    case 'workspace': {
      const workspace = parseAdminObjectRef('workspace', result.ref)
      if (workspace.kind !== 'valid' || workspace.ref.kind !== 'workspace') return OBJECT_NOT_FOUND
      return { ...result, ref: workspace.ref.ref }
    }
    case 'agent': {
      const agent = parseAdminObjectRef('agent', result.ref)
      if (agent.kind !== 'valid' || agent.ref.kind !== 'agent') return OBJECT_NOT_FOUND
      let workspaceRef: AccountRef | null = null
      if (result.workspaceRef !== null) {
        const workspace = parseAdminObjectRef('workspace', result.workspaceRef)
        if (workspace.kind !== 'valid' || workspace.ref.kind !== 'workspace') return OBJECT_NOT_FOUND
        workspaceRef = workspace.ref.ref
      }
      const recentCallRefs: CallRef[] = []
      for (const value of result.recentCallRefs) {
        const call = parseAdminObjectRef('call', value)
        if (call.kind !== 'valid' || call.ref.kind !== 'call') return OBJECT_NOT_FOUND
        recentCallRefs.push(call.ref.ref)
      }
      return {
        ...result,
        ref: agent.ref.ref,
        workspaceRef,
        recentCallRefs,
      }
    }
    default:
      return OBJECT_NOT_FOUND
  }
}
