import { z } from 'zod'

import type { PublicToolDescriptor } from '@/modules/capability-supply/public'
import { publicToolDescriptorSchema } from '@/modules/capability-supply/tool-schemas'
import type { X402DirectoryEntry, X402DirectoryInput } from './x402-directory'

export const DIRECTORY_SAVED_TOOLS_LIMIT = 100

// Search cards still use this ephemeral presentation input; nothing from it is persisted.
export type SavedDirectoryTool = Readonly<{ entry: X402DirectoryEntry; search: X402DirectoryInput }>

export const savedToolIdentitySchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('ae_callable'), toolRef: z.string().regex(/^operation:v1:[0-9a-f]{64}$/u) }),
  z.strictObject({ kind: z.literal('external_listing'), resource: z.url().max(8192).refine(value => value.startsWith('https://'), 'HTTPS resource required') }),
])
export const savedToolSaveInputSchema = z.union([
  savedToolIdentitySchema,
  z.strictObject({ kind: z.literal('external_listing'), id: z.string().regex(/^registry:[a-f0-9]{64}$/u) }),
])
export const savedToolRemoveInputSchema = savedToolIdentitySchema
export const savedToolsListInputSchema = z.strictObject({})
export type SavedToolIdentity = z.infer<typeof savedToolIdentitySchema>
export type SavedToolSaveInput = z.infer<typeof savedToolSaveInputSchema>
export type SavedToolListItem = Readonly<{
  identity: SavedToolIdentity
  createdAt: number
  detail: Readonly<{ kind: 'found'; tool: PublicToolDescriptor }> | Readonly<{ kind: 'found'; entry: X402DirectoryEntry }>
    | Readonly<{ kind: 'not_found' | 'unavailable' }>
}>
const publicToolSchema = publicToolDescriptorSchema
const directoryFieldSchema = z.strictObject({
  name: z.string(), path: z.string(),
  location: z.enum(['body', 'queryParams', 'pathParams', 'headers', 'output']),
  source: z.enum(['schema', 'example']), type: z.string().optional(),
  required: z.boolean().optional(), description: z.string().optional(),
  enumValues: z.array(z.string()).optional(), defaultJson: z.string().optional(),
  exampleJson: z.string().optional(), constraints: z.array(z.string()).optional(),
})
const directoryContractSchema = z.strictObject({
  fields: z.array(directoryFieldSchema), type: z.string().optional(), schemaJson: z.string().optional(),
  exampleJson: z.string().optional(), schemaOmitted: z.literal(true).optional(),
  exampleOmitted: z.literal(true).optional(), fieldsTruncated: z.literal(true).optional(),
})
const directoryEntrySchema = z.strictObject({
  resource: z.string(), title: z.string(), description: z.string(), protocol: z.string(),
  provider: z.string(), metadataJson: z.string(),
  prices: z.array(z.strictObject({
    network: z.string(), networkLabel: z.string().optional(), scheme: z.string(),
    amount: z.string(), asset: z.string().optional(), symbol: z.string().optional(),
    decimalAmount: z.string().optional(), payTo: z.string().optional(),
  })),
  serviceName: z.string().optional(), iconUrl: z.string().optional(), skillUrl: z.string().optional(),
  category: z.string().optional(), input: directoryContractSchema.optional(), output: directoryContractSchema.optional(),
  method: z.string().optional(), methodLabel: z.string().optional(),
  outputSummary: z.string().optional(), schemaSummary: z.string().optional(),
  tags: z.array(z.string()).optional(), curated: z.literal(true).optional(),
  bundleSlugs: z.array(z.string()).optional(), slug: z.string().optional(),
  provenance: z.strictObject({
    directory: z.literal('Coinbase Bazaar'), metadata: z.literal('provider_declared'), updatedAt: z.string().optional(),
  }).optional(),
  activity: z.strictObject({
    calls30d: z.number().optional(), payers30d: z.number().optional(), lastCalledAt: z.string().optional(),
  }).optional(),
  choice: z.strictObject({
    access: z.enum(['external_listing', 'ae_callable', 'setup_required', 'unavailable']),
    toolRef: z.string().optional(), sourceRouteRef: z.string().optional(),
  }).optional(),
  audEstimate: z.string().optional(),
})
export const savedToolListItemSchema = z.strictObject({
  identity: savedToolIdentitySchema,
  createdAt: z.number().int().nonnegative(),
  detail: z.union([
    z.strictObject({ kind: z.literal('found'), tool: publicToolSchema }),
    z.strictObject({ kind: z.literal('found'), entry: directoryEntrySchema }),
    z.strictObject({ kind: z.literal('not_found') }),
    z.strictObject({ kind: z.literal('unavailable') }),
  ]),
})
export type SavedToolsListResult = Readonly<{ kind: 'available'; items: readonly SavedToolListItem[] }>
  | Readonly<{ kind: 'error'; code: 'unauthenticated' | 'source_unavailable' }>
export const savedToolsListResultSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('available'), items: z.array(savedToolListItemSchema).max(DIRECTORY_SAVED_TOOLS_LIMIT) }),
  z.strictObject({ kind: z.literal('error'), code: z.enum(['unauthenticated', 'source_unavailable']) }),
]) as z.ZodType<SavedToolsListResult>
export const savedToolSaveResultSchema = z.union([
  z.strictObject({ kind: z.enum(['saved', 'already_saved']), identity: savedToolIdentitySchema, createdAt: z.number().int().nonnegative() }),
  z.strictObject({ kind: z.literal('refused'), code: z.enum(['unauthenticated', 'limit_reached', 'not_found', 'source_unavailable', 'invalid_identity']) }),
])
export const savedToolRemoveResultSchema = z.union([
  z.strictObject({ kind: z.enum(['removed', 'not_found']) }),
  z.strictObject({ kind: z.literal('error'), code: z.enum(['unauthenticated', 'source_unavailable']) }),
])
export type SavedToolSaveResult = z.infer<typeof savedToolSaveResultSchema>
export type SavedToolRemoveResult = z.infer<typeof savedToolRemoveResultSchema>
