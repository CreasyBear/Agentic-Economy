import { z } from 'zod'

import {
  ADMIN_ACCESS_REFUSED_COPY,
  type AdminObjectKind,
  type AdminParseErrorCode,
} from '@/lib/operator/admin-console/contracts'

export const adminObjectKindSchema = z.enum([
  'call',
  'quote',
  'tool_version',
  'workspace',
  'agent',
  'provider',
])

export const adminObjectSearchSchema = z.strictObject({
  kind: adminObjectKindSchema.optional(),
  ref: z.string().optional(),
})

export const adminParseErrorCodeSchema = z.enum([
  'empty',
  'malformed_call_ref',
  'malformed_quote_ref',
  'malformed_tool_ref',
  'malformed_account_ref',
  'malformed_principal_ref',
  'malformed_slug',
])

export const adminRecentRefsSchema = z.array(z.strictObject({
  kind: adminObjectKindSchema,
  ref: z.string(),
}))

export type AdminObjectSearchParams = z.infer<typeof adminObjectSearchSchema>
export type AdminObjectSearchInput = Readonly<{ kind: AdminObjectKind; ref: string }>
export type AdminRecentRef = Readonly<{ kind: AdminObjectKind; ref: string }>
export type AdminObjectSearchState =
  | Readonly<{ kind: 'idle' }>
  | Readonly<{ kind: 'searching' }>
  | Readonly<{ kind: 'message'; tone: 'error' | 'neutral'; text: string }>

export const ADMIN_OBJECT_KIND_OPTIONS: readonly Readonly<{
  value: AdminObjectKind
  label: string
}>[] = [
  { value: 'call', label: 'Call' },
  { value: 'quote', label: 'Quote' },
  { value: 'tool_version', label: 'Tool version' },
  { value: 'workspace', label: 'Workspace' },
  { value: 'agent', label: 'Agent' },
  { value: 'provider', label: 'Provider' },
]

export const ADMIN_PARSE_ERROR_COPY: Readonly<Record<AdminParseErrorCode, string>> = {
  empty: 'Enter a reference.',
  malformed_call_ref: 'The Call reference is not valid.',
  malformed_quote_ref: 'The Quote reference is not valid.',
  malformed_tool_ref: 'The Tool reference is not valid.',
  malformed_account_ref: 'The Workspace reference is not valid.',
  malformed_principal_ref: 'The Agent reference is not valid.',
  malformed_slug: 'The Provider slug is not valid.',
}

export const ADMIN_OBJECT_SEARCH_COPY = {
  title: 'Search',
  description: 'Find one admin object by its exact reference.',
  adminBreadcrumb: 'Admin',
  kindLabel: 'Object type',
  referenceLabel: 'Reference',
  referencePlaceholder: 'Enter an exact reference',
  submit: 'Search',
  searching: 'Searching…',
  notFound: 'No object with that reference.',
  refused: ADMIN_ACCESS_REFUSED_COPY,
  unavailable: 'Search is unavailable. Try again.',
}

export const ADMIN_RECENT_REFS_STORAGE_KEY = 'ae.admin.recentRefs'
export const ADMIN_RECENT_REFS_LIMIT = 8
