import { v } from 'convex/values'

import type { AdminObjectRef } from '@/lib/operator/admin-console/contracts'
import { parseAdminObjectRef } from '@/lib/operator/admin-console/ref-parsers'

import type { QueryCtx } from './_generated/server'
import { readAdminAgentView } from './lib/adminConsole/reads/agent'
import { readAdminCallView } from './lib/adminConsole/reads/call'
import {
  adminObjectKindValue,
  adminObjectRefValue,
  adminObjectViewValue,
} from './lib/adminConsole/reads/objectValues'
import { readAdminQuoteView } from './lib/adminConsole/reads/quote'
import { readAdminToolVersionView } from './lib/adminConsole/reads/toolVersion'
import { readAdminWorkspaceView } from './lib/adminConsole/reads/workspace'
import { defineAdminQuery } from './lib/adminConsole/registrars'

const objectNotFoundValue = v.object({ kind: v.literal('object_not_found') })

export const readAdminObject = defineAdminQuery({
  action: 'read_admin_readbacks',
  args: { ref: adminObjectRefValue },
  returns: v.union(adminObjectViewValue, objectNotFoundValue),
  handler: async (ctx, args) => {
    const parsed = parseAdminObjectRef(args.ref.kind, args.ref.ref)
    return parsed.kind === 'malformed'
      ? { kind: 'object_not_found' as const }
      : await readParsedAdminObject(ctx, parsed.ref)
  },
})

export const searchAdminObjects = defineAdminQuery({
  action: 'read_admin_readbacks',
  args: { kind: adminObjectKindValue, ref: v.string() },
  returns: v.union(
    v.object({ kind: v.literal('found'), ref: adminObjectRefValue }),
    v.object({ kind: v.literal('malformed'), code: v.string() }),
    objectNotFoundValue,
  ),
  handler: async (ctx, args) => {
    const parsed = parseAdminObjectRef(args.kind, args.ref)
    if (parsed.kind === 'malformed') return parsed
    const view = await readParsedAdminObject(ctx, parsed.ref)
    return view.kind === 'object_not_found'
      ? view
      : { kind: 'found' as const, ref: parsed.ref }
  },
})

async function readParsedAdminObject(ctx: QueryCtx, ref: AdminObjectRef) {
  switch (ref.kind) {
    case 'call': {
      const view = await readAdminCallView(ctx, ref.ref)
      if (view.kind === 'object_not_found') return view
      const { previousInput: _privateInput, ...receipt } = view.receipt
      return {
        ...view,
        receipt: {
          ...receipt,
          stages: receipt.stages.map((stage) => ({ ...stage })),
        },
        timeline: view.timeline.map((entry) => ({ ...entry })),
      }
    }
    case 'quote':
      return await readAdminQuoteView(ctx, ref.ref)
    case 'workspace':
      return await readAdminWorkspaceView(ctx, ref.ref)
    case 'agent': {
      const view = await readAdminAgentView(ctx, ref.ref)
      return view.kind === 'object_not_found'
        ? view
        : { ...view, recentCallRefs: [...view.recentCallRefs] }
    }
    case 'tool_version':
      return await readAdminToolVersionView(ctx, ref.ref)
    case 'provider':
      // F2-1 replaces this branch with readAdminProviderView.
      return { kind: 'object_not_found' as const }
  }
}
