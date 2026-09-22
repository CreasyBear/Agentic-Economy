import { useNavigate } from '@tanstack/react-router'
import { useConvex } from 'convex/react'
import { useState } from 'react'

import { api } from '../../../../../convex/_generated/api'
import { parseAdminObjectRef } from '@/lib/operator/admin-console/ref-parsers'
import type { AdminObjectSearchInput, AdminObjectSearchState, AdminRecentRef } from './object-search.contracts'
import {
  ADMIN_OBJECT_SEARCH_COPY,
  ADMIN_PARSE_ERROR_COPY,
  ADMIN_RECENT_REFS_LIMIT,
  ADMIN_RECENT_REFS_STORAGE_KEY,
  adminObjectHref,
  adminParseErrorCodeSchema,
  adminRecentRefsSchema,
} from './object-search.contracts'

export function useAdminObjectSearch(): Readonly<{
  state: AdminObjectSearchState
  submit: (input: AdminObjectSearchInput) => Promise<void>
}> {
  const convex = useConvex()
  const navigate = useNavigate()
  const [state, setState] = useState<AdminObjectSearchState>({ kind: 'idle' })

  async function submit(input: AdminObjectSearchInput): Promise<void> {
    if (state.kind === 'searching') return
    setState({ kind: 'searching' })
    try {
      const result = await convex.query(api.adminConsoleObjects.searchAdminObjects, input)
      if (result.kind === 'malformed') {
        const code = adminParseErrorCodeSchema.safeParse(result.code)
        setState({
          kind: 'message',
          tone: 'error',
          text: code.success ? ADMIN_PARSE_ERROR_COPY[code.data] : ADMIN_OBJECT_SEARCH_COPY.unavailable,
        })
        return
      }
      if (result.kind === 'object_not_found') {
        setState({ kind: 'message', tone: 'neutral', text: ADMIN_OBJECT_SEARCH_COPY.notFound })
        return
      }
      if (result.kind === 'refused') {
        setState({ kind: 'message', tone: 'error', text: ADMIN_OBJECT_SEARCH_COPY.refused })
        return
      }
      const parsedRef = parseAdminObjectRef(result.ref.kind, result.ref.ref)
      if (parsedRef.kind === 'malformed') {
        setState({ kind: 'message', tone: 'error', text: ADMIN_OBJECT_SEARCH_COPY.unavailable })
        return
      }
      rememberAdminRef({ kind: parsedRef.ref.kind, ref: parsedRef.ref.ref })
      await navigate({ href: adminObjectHref(parsedRef.ref) })
    } catch (cause) {
      void cause
      setState({ kind: 'message', tone: 'error', text: ADMIN_OBJECT_SEARCH_COPY.unavailable })
    }
  }

  return { state, submit }
}

function rememberAdminRef(recent: AdminRecentRef): void {
  try {
    const stored = window.localStorage.getItem(ADMIN_RECENT_REFS_STORAGE_KEY)
    const parsed: unknown = stored === null ? [] : JSON.parse(stored)
    const current = adminRecentRefsSchema.safeParse(parsed)
    const recents = current.success ? current.data : []
    const next = [
      recent,
      ...recents.filter((item) => item.kind !== recent.kind || item.ref !== recent.ref),
    ].slice(0, ADMIN_RECENT_REFS_LIMIT)
    window.localStorage.setItem(ADMIN_RECENT_REFS_STORAGE_KEY, JSON.stringify(next))
  } catch (cause) {
    void cause
  }
}
