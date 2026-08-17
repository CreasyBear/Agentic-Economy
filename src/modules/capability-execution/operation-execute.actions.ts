import {
  callPublicSourceQuery,
  createConvexServerFunctionAssertion,
  sourceQuery,
  type ConvexServerFunctionAssertion,
} from '@/lib/server/convex-source'
import { isRecord } from '@/modules/common/is-record'
import {
  isPublicOperationRef,
  type PublicOperationDescriptor,
} from '@/modules/capability-supply/public'
import {
  readCapabilityOperationDetail,
  readCapabilityOperationSearch,
} from '@/modules/capability-supply/operation-source'
import type { OperationExecutableDescriptor } from './operation-execute.functions'

export type { PublicOperationDescriptor }

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
  /** Public registry projection used only for candidate presentation/binding. */
  publicOperation?: PublicOperationDescriptor
  /** Digest of the exact executable descriptor read during selection. */
  executionBindingDigest?: string
}>

type KeylessExecutableListing = Readonly<
  Omit<KeylessExecutableToolDescriptor, 'inputSchema' | 'inputExamples' | 'publicOperation'> & {
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
  /** Optional current registry projection; absence is supported by fixtures. */
  readPublic?: (operationRef: string) => Promise<PublicOperationDescriptor | null>
  search(
    query: string,
    descriptors: readonly KeylessExecutableToolDescriptor[],
  ): Promise<readonly string[]>
}>

const readKeylessExecutableQuery = sourceQuery<
  { operationRef: string; serviceAuth: ConvexServerFunctionAssertion },
  KeylessExecutableDescriptorWire | null
>('capabilitySupplyOperations:readKeylessExecutable')

const listKeylessExecutableQuery = sourceQuery<
  {},
  KeylessExecutableListing[]
>('capabilitySupplyOperations:listKeylessExecutable')

async function readConvexDescriptor(operationRef: string): Promise<OperationExecutableDescriptor | null> {
  if (!isPublicOperationRef(operationRef)) return null
  const serviceAuth = await createConvexServerFunctionAssertion({
    operation: 'capabilitySupplyOperations:readKeylessExecutable',
    scope: 'capability_supply:read_executable',
    command: { operationRef },
  })
  const db = await callPublicSourceQuery(readKeylessExecutableQuery, { operationRef, serviceAuth })
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
async function readPublicOperation(operationRef: string): Promise<PublicOperationDescriptor | null> {
  if (!isPublicOperationRef(operationRef)) return null
  const result = await readCapabilityOperationDetail({ operationRef })
  return result.kind === 'found' ? result.operation : null
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
  readPublic: readPublicOperation,
  search: searchConvexDescriptors,
}

