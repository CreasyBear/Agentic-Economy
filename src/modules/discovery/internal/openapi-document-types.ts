import type { JSONSchema } from '@tanstack/ai'

export type OpenApiDocument = Readonly<Record<string, unknown>>

export type OpenApiBuildResult = Readonly<{
  document: OpenApiDocument
  operationCount: number
  refBytes: number
  inlineBytes: number
  chosen: 'ref' | 'inline'
}>

export type NormalizedParam = Readonly<{
  name: string
  description: string
  required: boolean
  schema: JSONSchema
}>

export type NormalizedResponse = Readonly<{ status: number; schema: JSONSchema; mediaType: string; description: string }>

export type NormalizedOperation = Readonly<{
  operationId: string
  summary: string
  tags: readonly string[]
  method: 'GET' | 'POST'
  path: string
  security: 'none' | Readonly<{ scope: string }>
  pathParams: readonly NormalizedParam[]
  queryParams: readonly NormalizedParam[]
  requestBodySchema?: JSONSchema
  responses: readonly NormalizedResponse[]
}>
