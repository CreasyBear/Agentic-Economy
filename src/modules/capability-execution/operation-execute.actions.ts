
import { sourceQuery, callPublicSourceQuery } from '@/lib/server/convex-source'
import { isLocalE2EAuthBypassEnabled } from '@/lib/server/local-e2e-bypass'
import { isRecord } from '@/modules/common/is-record'
import { isPublicOperationRef, rankOperationSearchText } from '@/modules/capability-supply/public'
import { readCapabilityOperationSearch } from '@/modules/capability-supply/operation-source'
import type { OperationExecutableDescriptor } from './operation-execute.functions'
import { seededDescriptorFor, seededKeylessSeeds } from './seed-supply'

export type KeylessExecutableToolDescriptor = Readonly<{
  operationRef: string
  capabilityId: string
  name: string
  summary: string
  searchTerms: readonly string[]
  inputExamples?: readonly Readonly<{
    label?: string | undefined
    input: Readonly<Record<string, unknown>>
  }>[]
  inputSchema: Record<string, unknown>
}>

type KeylessExecutableListing = Readonly<
  Omit<KeylessExecutableToolDescriptor, 'inputSchema' | 'inputExamples'> & {
    inputSchemaJson: string
    inputExamplesJson?: string
  }
>

type KeylessExecutableDescriptorWire = Readonly<
  Omit<OperationExecutableDescriptor, 'inputSchema' | 'outputSchema'> & {
    inputSchemaJson: string
    outputSchemaJson?: string
  }
>

export type KeylessExecutableSourcePort = Readonly<{
  list(): Promise<readonly KeylessExecutableToolDescriptor[]>
  read(operationRef: string): Promise<OperationExecutableDescriptor | null>
  search(
    query: string,
    descriptors: readonly KeylessExecutableToolDescriptor[],
  ): Promise<readonly string[]>
}>

const readKeylessExecutableQuery = sourceQuery<
  { operationRef: string },
  KeylessExecutableDescriptorWire | null
>('capabilitySupplyOperations:readKeylessExecutable')

const listKeylessExecutableQuery = sourceQuery<
  {},
  KeylessExecutableListing[]
>('capabilitySupplyOperations:listKeylessExecutable')

async function readConvexDescriptor(operationRef: string): Promise<OperationExecutableDescriptor | null> {
  if (!isPublicOperationRef(operationRef)) return null
  const db = await callPublicSourceQuery(readKeylessExecutableQuery, { operationRef })
  if (db === null || !isPublicOperationRef(db.operationRef) || db.operationRef !== operationRef) {
    return null
  }
  const { inputSchemaJson, outputSchemaJson, ...descriptor } = db
  const inputSchema = parseSchemaJson(inputSchemaJson)
  const outputSchema = outputSchemaJson === undefined ? undefined : parseSchemaJson(outputSchemaJson)
  return {
    ...descriptor,
    inputSchema,
    ...(outputSchema === undefined ? {} : { outputSchema }),
  }
}

function parseSchemaJson(value: string): Record<string, unknown> {
  const parsed: unknown = JSON.parse(value)
  if (!isRecord(parsed)) throw new Error('keyless_operation_schema_invalid')
  return parsed
}

function parseInputExamplesJson(value: string | undefined): KeylessExecutableToolDescriptor['inputExamples'] {
  if (value === undefined) return undefined
  const parsed: unknown = JSON.parse(value)
  if (!Array.isArray(parsed)) throw new Error('keyless_operation_input_examples_invalid')
  return parsed.map((example) => {
    if (!isRecord(example) || !isRecord(example.input)) {
      throw new Error('keyless_operation_input_examples_invalid')
    }
    return {
      ...(typeof example.label === 'string' ? { label: example.label } : {}),
      input: example.input,
    }
  })
}


async function listConvexDescriptors(): Promise<readonly KeylessExecutableToolDescriptor[]> {
  const rows = await callPublicSourceQuery(listKeylessExecutableQuery, {})
  return rows
    .filter((row) => isPublicOperationRef(row.operationRef))
    .map(({ inputSchemaJson, inputExamplesJson, ...row }) => {
      const inputSchema: unknown = JSON.parse(inputSchemaJson)
      if (!isRecord(inputSchema)) throw new Error('keyless_operation_input_schema_invalid')
      const inputExamples = parseInputExamplesJson(inputExamplesJson)
      return { ...row, inputSchema, ...(inputExamples === undefined ? {} : { inputExamples }) }
    })
}

async function searchConvexDescriptors(
  query: string,
  descriptors: readonly KeylessExecutableToolDescriptor[],
): Promise<readonly string[]> {
  if (descriptors.length === 0 || query.trim().length === 0) return []
  const allowed = new Set(descriptors.map((descriptor) => descriptor.operationRef))
  const result = await readCapabilityOperationSearch({ query, limit: 10 })
  if (result.kind === 'unavailable') throw new Error('keyless_operation_search_unavailable')
  if (result.kind !== 'ok') return []
  return result.items
    .map((item) => item.operationRef)
    .filter((operationRef) => isPublicOperationRef(operationRef) && allowed.has(operationRef))
}

export const convexKeylessExecutableSource: KeylessExecutableSourcePort = {
  list: listConvexDescriptors,
  read: readConvexDescriptor,
  search: searchConvexDescriptors,
}

export const seedKeylessExecutableSource: KeylessExecutableSourcePort = {
  list: seededKeylessSeeds,
  read: async (operationRef) => isPublicOperationRef(operationRef)
    ? await seededDescriptorFor(operationRef) ?? null
    : null,
  search: async (query, descriptors) => rankOperationSearchText(
    query,
    descriptors.map((descriptor) => ({
      value: descriptor.operationRef,
      operationRef: descriptor.operationRef,
      searchText: [descriptor.capabilityId, descriptor.name, descriptor.summary, ...descriptor.searchTerms],
    })),
  ),
}

export const defaultKeylessExecutableSource: KeylessExecutableSourcePort =
  isLocalE2EAuthBypassEnabled()
    ? seedKeylessExecutableSource
    : convexKeylessExecutableSource
