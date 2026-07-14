import type { Infer } from 'convex/values'

import { canonicalDigest } from '@/modules/common/canonical-digest'
import type { StableHashValue } from '@/modules/common/stable-hash'
import {
  routeMandateIssueEvidenceValue,
  routeMandateValue,
} from '@/modules/customer-request/runtime'

type StoredMandate = Infer<typeof routeMandateValue>
type IssueEvidence = Infer<typeof routeMandateIssueEvidenceValue>

type IssueRecord = Readonly<{
  mandateRef: string
  mandateDigest: string
  principalId: string
  requestId: string
  requestRevision: number
  generationRef: string
  routePlanId: string
  mandate: StoredMandate
  evidence: IssueEvidence
  recordedAt: number
}>

export type RouteMandateRevocationRecord = Readonly<{
  revocationRef: string
  mandateRef: string
  mandateDigest: string
  principalId: string
  requestId: string
  reason: 'customer_revoked' | 'request_revised' | 'route_generation_superseded'
  requestRevision: number
  generationRef: string
  supersededByRequestRevision?: number
  supersededByGenerationRef?: string
  evidenceDigest: string
  recordedAt: number
}>

export function routeMandateIssueRecordIsValid(issue: IssueRecord): boolean {
  const mandate = issue.mandate
  const { mandateRef: _mandateRef, mandateDigest: _mandateDigest, ...material } = mandate
  return canonicalDigest(material) === issue.mandateDigest
    && mandate.mandateDigest === issue.mandateDigest
    && mandate.mandateRef === issue.mandateRef
    && mandate.mandateRef === `route-mandate:v1:${issue.mandateDigest}`
    && mandate.principal.principalId === issue.principalId
    && mandate.request.requestId === issue.requestId
    && mandate.request.requestRevision === issue.requestRevision
    && mandate.route.generationRef === issue.generationRef
    && mandate.route.routePlanId === issue.routePlanId
    && mandate.issuedAt === issue.recordedAt
    && routeMandateIssueEvidenceIsValid(mandate, issue.evidence)
}

export function routeMandateHeadMatchesIssue(
  head: Readonly<{
    requestId: string
    principalId: string
    currentMandateRef: string
    currentMandateDigest: string
    currentRequestRevision: number
    currentGenerationRef: string
  }>,
  issue: IssueRecord,
): boolean {
  return head.currentMandateRef === issue.mandateRef
    && head.currentMandateDigest === issue.mandateDigest
    && head.principalId === issue.principalId
    && head.requestId === issue.requestId
    && head.currentRequestRevision === issue.requestRevision
    && head.currentGenerationRef === issue.generationRef
    && routeMandateIssueRecordIsValid(issue)
}

export function routeMandateRevocationRecordIsValid(
  revocation: RouteMandateRevocationRecord,
  issue: IssueRecord,
): boolean {
  if (!routeMandateIssueRecordIsValid(issue)
    || revocation.mandateRef !== issue.mandateRef
    || revocation.mandateDigest !== issue.mandateDigest
    || revocation.principalId !== issue.principalId
    || revocation.requestId !== issue.requestId
    || revocation.requestRevision !== issue.requestRevision
    || revocation.generationRef !== issue.generationRef
    || revocation.recordedAt < issue.recordedAt) return false
  if (revocation.reason === 'customer_revoked') {
    if (revocation.supersededByRequestRevision !== undefined
      || revocation.supersededByGenerationRef !== undefined) return false
  } else if (revocation.supersededByRequestRevision === undefined) return false
  const evidenceDigest = canonicalDigest(routeMandateRevocationEvidence(revocation))
  return revocation.evidenceDigest === evidenceDigest
    && revocation.revocationRef === `route-mandate-revocation:v1:${evidenceDigest}`
}

export function routeMandateRevocationEvidence(value: RouteMandateRevocationRecord): StableHashValue {
  return {
    mandateRef: value.mandateRef,
    mandateDigest: value.mandateDigest,
    principalId: value.principalId,
    requestId: value.requestId,
    requestRevision: value.requestRevision,
    generationRef: value.generationRef,
    reason: value.reason,
    ...(value.supersededByRequestRevision === undefined
      ? {}
      : { supersededByRequestRevision: value.supersededByRequestRevision }),
    ...(value.supersededByGenerationRef === undefined
      ? {}
      : { supersededByGenerationRef: value.supersededByGenerationRef }),
    recordedAt: value.recordedAt,
  }
}

function routeMandateIssueEvidenceIsValid(mandate: StoredMandate, evidence: IssueEvidence): boolean {
  if (mandate.authorization.kind !== 'explicit') return false
  const authenticatedActor = {
    issuer: evidence.authentication.issuer,
    subject: evidence.authentication.subject,
    tokenIdentifier: evidence.authentication.tokenIdentifier,
  }
  const authenticationEvidenceRef = `clerk-identity:${canonicalDigest(authenticatedActor)}`
  const authorizationMaterial = {
    kind: 'explicit' as const,
    commandDigest: evidence.authorization.commandDigest,
    principalId: evidence.authorization.principalId,
    requestId: evidence.authorization.requestId,
    requestRevision: evidence.authorization.requestRevision,
    generationRef: evidence.authorization.generationRef,
    selectedRoutePlanId: evidence.authorization.selectedRoutePlanId,
    maximumTotalSpend: evidence.authorization.maximumTotalSpend,
    issuedAt: evidence.authorization.issuedAt,
    expiresAt: evidence.authorization.expiresAt,
    authenticatedBy: evidence.authorization.authenticatedActor,
  }
  const authorizationEvidenceDigest = canonicalDigest(authorizationMaterial)
  return evidence.authentication.evidenceRef === authenticationEvidenceRef
    && canonicalDigest(evidence.authorization.authenticatedActor) === canonicalDigest(authenticatedActor)
    && evidence.authorization.evidenceDigest === authorizationEvidenceDigest
    && evidence.authorization.evidenceRef === `route-authorization:explicit:${authorizationEvidenceDigest}`
    && mandate.principal.principalId === evidence.authorization.principalId
    && mandate.principal.authenticationEvidenceRef === evidence.authentication.evidenceRef
    && mandate.authorization.authorizationEvidenceRef === evidence.authorization.evidenceRef
    && mandate.authorization.authorizationEvidenceDigest === evidence.authorization.evidenceDigest
    && mandate.request.requestId === evidence.authorization.requestId
    && mandate.request.requestRevision === evidence.authorization.requestRevision
    && mandate.route.generationRef === evidence.authorization.generationRef
    && mandate.route.routePlanId === evidence.authorization.selectedRoutePlanId
    && canonicalDigest(mandate.route.maximumTotalSpend)
      === canonicalDigest(evidence.authorization.maximumTotalSpend)
    && mandate.issuedAt === evidence.authorization.issuedAt
    && mandate.expiresAt === evidence.authorization.expiresAt
}
