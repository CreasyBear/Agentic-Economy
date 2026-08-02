import {
  defineCapabilityContract,
  parseCapabilityContractJson,
  sameCapabilityContractRef,
  type CapabilityContract,
  type CapabilityContractDocument,
  type CapabilityContractRef,
} from '@/modules/capability-contract/public'
import { stableStringify, type StableHashValue } from '@/modules/common/stable-hash'

const MAX_CONTRACT_DOCUMENT_BYTES = 300_000
const encoder = new TextEncoder()

export type DurableCapabilityContract = Readonly<{
  ref: CapabilityContractRef
  documentJson: string
  status: 'active' | 'retired'
  registeredAt: number
  retiredAt?: number
}>

export type EncodedCapabilityContractDocument = Readonly<{
  contract: CapabilityContract
  document: CapabilityContractDocument
  documentJson: string
}>

export type ExactCapabilityContractResult =
  | Readonly<{ kind: 'found'; contract: CapabilityContract; registeredAt: number }>
  | Readonly<{ kind: 'unavailable'; reason: 'not_found' | 'not_active' | 'integrity_failure' }>

export function encodeCapabilityContractDocument(input: unknown): EncodedCapabilityContractDocument {
  const contract = defineCapabilityContract(input)
  const { ref: _ref, ...document } = contract
  const documentJson = stableStringify(document as StableHashValue)
  if (encoder.encode(documentJson).byteLength > MAX_CONTRACT_DOCUMENT_BYTES) {
    throw new Error('capability_contract_too_large')
  }
  return { contract, document, documentJson }
}

export function encodeCapabilityContractDocumentJson(input: string): EncodedCapabilityContractDocument {
  const { ref: _ref, ...document } = parseCapabilityContractJson(input)
  return encodeCapabilityContractDocument(document)
}

export function decodeDurableCapabilityContract(record: DurableCapabilityContract): ExactCapabilityContractResult {
  if (record.status !== 'active') return { kind: 'unavailable', reason: 'not_active' }
  let encoded: EncodedCapabilityContractDocument
  try {
    encoded = encodeCapabilityContractDocumentJson(record.documentJson)
  } catch {
    return { kind: 'unavailable', reason: 'integrity_failure' }
  }
  if (
    encoded.documentJson !== record.documentJson
    || !sameCapabilityContractRef(encoded.contract.ref, record.ref)
  ) {
    return { kind: 'unavailable', reason: 'integrity_failure' }
  }
  return { kind: 'found', contract: encoded.contract, registeredAt: record.registeredAt }
}
