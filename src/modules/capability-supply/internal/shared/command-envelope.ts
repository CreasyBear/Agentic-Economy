export const MAX_CONTEXT_VALUE_LENGTH = 200
export const MAX_EVIDENCE_REF_LENGTH = 500

export type RegistrationContext = Readonly<{
  operationKey: string
  correlationId: string
  reasonCode: string
  evidenceRefs: readonly string[]
}>

export type SupplyCommandActor = Readonly<{ kind: 'admin' | 'owner' | 'system'; ref: string }>

export function validRegistrationContext(input: RegistrationContext): boolean {
  return boundedTrimmed(input.operationKey, MAX_CONTEXT_VALUE_LENGTH)
    && boundedTrimmed(input.correlationId, MAX_CONTEXT_VALUE_LENGTH)
    && boundedTrimmed(input.reasonCode, MAX_CONTEXT_VALUE_LENGTH)
    && validEvidenceRefs(input.evidenceRefs)
}

export function validCommandEnvelope(actor: SupplyCommandActor, context: RegistrationContext): boolean {
  return boundedTrimmed(actor.ref, MAX_CONTEXT_VALUE_LENGTH) && validRegistrationContext(context)
}

export function validEvidenceRefs(references: readonly string[]): boolean {
  return references.length > 0
    && references.length <= 64
    && references.every((reference) => boundedTrimmed(reference, MAX_EVIDENCE_REF_LENGTH))
}

export function boundedTrimmed(value: string, maximumLength: number): boolean {
  return value.length > 0 && value.length <= maximumLength && value === value.trim()
}
