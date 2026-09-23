import { adminObjectHref, type AdminException, type AdminObjectRef } from './contracts'

export function exceptionRef(exception: AdminException): string {
  switch (exception.kind) {
    case 'uncertain_call': return exception.callRef
    case 'removal_dispute': return exception.disputeRef
    case 'source_authority_review': return exception.publicationRef
    case 'admission_case': return exception.caseRef
  }
}

export function exceptionObjectRef(exception: AdminException): AdminObjectRef {
  switch (exception.kind) {
    case 'uncertain_call': return { kind: 'call', ref: exception.callRef }
    case 'source_authority_review': return { kind: 'tool_version', ref: exception.publicationRef }
    case 'removal_dispute':
    case 'admission_case': return { kind: 'provider', ref: exception.businessSlug }
  }
}

export function exceptionHref(exception: AdminException): string {
  return adminObjectHref(exceptionObjectRef(exception))
}
