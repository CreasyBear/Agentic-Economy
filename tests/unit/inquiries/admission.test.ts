import { describe, expect, it } from 'vitest'

import {
  createEmptyInquirySourceState,
  evaluateR1TargetAdmission,
  type AdmissionBlocker,
  type CapabilityLaunchSupportRecord,
  type InquirySourceState,
  type InquiryTargetRef,
} from '@/modules/inquiries/public'

const businessId = 'business:admission-test' as InquiryTargetRef['businessId']
const serviceId = 'service:admission-test' as InquiryTargetRef['serviceId']
const ownerId = 'owner:admission-test' as InquirySourceState['owners'][number]['ownerId']
const slug = 'admission-test' as InquirySourceState['businesses'][number]['slug']
const serviceSlug = 'inquiry' as InquirySourceState['businessServices'][number]['serviceSlug']
const claimId = 'claim:admission-test' as InquirySourceState['claims'][number]['claimId']
const sourceHash = 'source:admission-test' as InquirySourceState['businesses'][number]['sourceHash']
const correlationId = 'correlation:admission-test' as CapabilityLaunchSupportRecord['correlationId']

const targetRef: InquiryTargetRef = {
  businessId,
  serviceId,
  capabilityKind: 'phone_inquiry',
}

const business = {
  businessId,
  ownerId,
  slug,
  name: 'Admission Test Plumbing',
  normalizedName: 'admission test plumbing',
  category: 'Plumbing',
  suburb: 'Parramatta',
  stateTerritory: 'NSW',
  publicStatus: 'published',
  trustTier: 'claimed',
  claimStatus: 'published',
  sourceHash,
  createdAt: 1,
  updatedAt: 1,
} satisfies InquirySourceState['businesses'][number]

const service = {
  serviceId,
  serviceSlug,
  businessId,
  name: 'Plumbing inquiry',
  category: 'Plumbing',
  summary: 'Owner-handled plumbing inquiries.',
  serviceArea: 'Parramatta',
  hoursOrUnknown: 'Owner supplied hours',
  status: 'published',
  sortOrder: 0,
  sourceHash,
  createdAt: 1,
  updatedAt: 1,
} satisfies InquirySourceState['businessServices'][number]

const capability = {
  businessId,
  serviceId,
  kind: 'phone_inquiry',
  status: 'available',
  firstRequest: {
    mode: 'inquiry_available',
    publicChannel: 'public_business_contact',
    publicDisclosure: 'Use the source-owned inquiry form for a first contact.',
    rawContactExcluded: true,
  },
  callable: false,
  paymentRequired: false,
  sourceHash,
  createdAt: 1,
  updatedAt: 1,
} satisfies InquirySourceState['serviceCapabilities'][number]

const owner = {
  ownerId,
  clerkUserId: 'clerk:admission-test',
  createdAt: 1,
  updatedAt: 1,
} satisfies InquirySourceState['owners'][number]

const claim = {
  claimId,
  ownerId,
  businessId,
  slug,
  status: 'published',
  submittedFactsHash: sourceHash,
  createdAt: 1,
  updatedAt: 1,
} satisfies InquirySourceState['claims'][number]

const recipient = {
  ownerId,
  recipientRef: 'recipient:admission-test',
  resolvedAt: 1,
} satisfies InquirySourceState['resolvableOwnerRecipients'][number]

const supportRecord = {
  capability: 'human_inquiry_owner_inbox',
  primaryOwnerRef: 'owner:admission-test',
  primaryAdminOperatorRef: 'admin:primary',
  backupOwnerRef: 'owner:backup',
  backupAdminOperatorRef: 'admin:backup',
  supportedStage: 'manual_support',
  supportedChannels: ['public_inquiry'],
  capacityThreshold: {
    maxOpenThreads: 10,
    maxFailedNotifications: 0,
  },
  backlogAgeThresholdMs: 60_000,
  phaseIncidentCounts: {
    retryExhausted: 0,
    noRepair: 0,
    unresolvedDeliveryFailures: 0,
    abuseBlocked: 0,
    privacyDeletes: 0,
  },
  supportEscalationPath: 'Owner inbox support queue.',
  claimDisablePath: 'Disable inquiry availability at the source.',
  perChannelKillRules: [{
    channel: 'public_inquiry',
    trigger: 'Owner handling becomes unavailable.',
    action: 'Disable public inquiry admission.',
  }],
  evidenceRefs: ['evidence:admission-test'],
  sourceHash,
  correlationId,
  lastReviewedAt: 1,
} satisfies CapabilityLaunchSupportRecord

const suppressionRule = {
  targetType: 'business',
  targetRef: businessId,
  status: 'active',
  reasonCode: 'privacy_review',
  evidenceRefs: ['evidence:suppression'],
  createdByAdminRef: 'admin:test',
  createdAt: 1,
  beforePublicStatus: 'published',
  beforeClaimStatus: 'published',
} satisfies InquirySourceState['suppressionRules'][number]

function admissionState(overrides: Partial<InquirySourceState> = {}): InquirySourceState {
  return createEmptyInquirySourceState({
    businesses: [business],
    businessServices: [service],
    serviceCapabilities: [capability],
    owners: [owner],
    claims: [claim],
    resolvableOwnerRecipients: [recipient],
    suppressionRules: [],
    capabilityLaunchSupportRecords: [supportRecord],
    ...overrides,
  })
}

type IndependentBlockerCase = Readonly<{
  name: string
  overrides: Partial<InquirySourceState>
  blocker: AdmissionBlocker
}>

const independentBlockerCases = [
  {
    name: 'an unpublished business page',
    overrides: { businesses: [{ ...business, publicStatus: 'unpublished' }] },
    blocker: { kind: 'not_published', ownerLabel: 'Publish this business page' },
  },
  {
    name: 'an unpublished claim status even when a published claim record exists',
    overrides: { businesses: [{ ...business, claimStatus: 'draft' }] },
    blocker: { kind: 'not_claimed', ownerLabel: 'Complete the business claim' },
  },
  {
    name: 'a published claim status without a matching claim record',
    overrides: { claims: [] },
    blocker: { kind: 'not_claimed', ownerLabel: 'Complete the business claim' },
  },
  {
    name: 'an absent resolvable owner recipient',
    overrides: { resolvableOwnerRecipients: [] },
    blocker: { kind: 'recipient_unresolvable', ownerLabel: 'Add a usable owner notification email' },
  },
  {
    name: 'a resolvable owner recipient with a blank recipient ref',
    overrides: { resolvableOwnerRecipients: [{ ...recipient, recipientRef: '   ' }] },
    blocker: { kind: 'recipient_unresolvable', ownerLabel: 'Add a usable owner notification email' },
  },
  {
    name: 'an active target suppression rule',
    overrides: { suppressionRules: [suppressionRule] },
    blocker: { kind: 'suppressed', ownerLabel: 'Turn inquiry receiving back on' },
  },
  {
    name: 'missing capability launch support readiness',
    overrides: { capabilityLaunchSupportRecords: [] },
    blocker: { kind: 'not_ready', ownerLabel: 'Finish inquiry setup' },
  },
] satisfies readonly IndependentBlockerCase[]

describe('evaluateR1TargetAdmission', () => {
  it.each(independentBlockerCases)('refuses $name independently', ({ overrides, blocker }) => {
    expect(evaluateR1TargetAdmission(admissionState(overrides), targetRef)).toEqual({
      version: 'r1-target-admitted:v1',
      admitted: false,
      blockers: [blocker],
    })
  })

  it('collects every failing conjunct in canonical order with the stable refused version', () => {
    const state = admissionState({
      businesses: [{ ...business, publicStatus: 'unpublished', claimStatus: 'draft' }],
      claims: [],
      resolvableOwnerRecipients: [],
      suppressionRules: [suppressionRule],
      capabilityLaunchSupportRecords: [],
    })

    expect(evaluateR1TargetAdmission(state, targetRef)).toEqual({
      version: 'r1-target-admitted:v1',
      admitted: false,
      blockers: [
        { kind: 'not_published', ownerLabel: 'Publish this business page' },
        { kind: 'not_claimed', ownerLabel: 'Complete the business claim' },
        { kind: 'recipient_unresolvable', ownerLabel: 'Add a usable owner notification email' },
        { kind: 'suppressed', ownerLabel: 'Turn inquiry receiving back on' },
        { kind: 'not_ready', ownerLabel: 'Finish inquiry setup' },
      ],
    })
  })

  it('returns claimed_owner proof without fabricated destination verification when every conjunct is green', () => {
    expect(evaluateR1TargetAdmission(admissionState(), targetRef)).toEqual({
      version: 'r1-target-admitted:v1',
      admitted: true,
      proof: {
        kind: 'claimed_owner',
        claimRef: 'claim:admission-test',
        recipientRef: 'recipient:admission-test',
      },
    })
  })

  it('skips an earlier blank recipient ref and admits with the later usable recipient', () => {
    const state = admissionState({
      resolvableOwnerRecipients: [
        { ...recipient, recipientRef: '   ' },
        { ...recipient, recipientRef: 'recipient:later-usable' },
      ],
    })

    expect(evaluateR1TargetAdmission(state, targetRef)).toEqual({
      version: 'r1-target-admitted:v1',
      admitted: true,
      proof: {
        kind: 'claimed_owner',
        claimRef: 'claim:admission-test',
        recipientRef: 'recipient:later-usable',
      },
    })
  })

  it('is deterministic across repeated evaluation and does not mutate authoritative input', () => {
    const state = admissionState()
    const originalState = structuredClone(state)

    const first = evaluateR1TargetAdmission(state, targetRef)
    const second = evaluateR1TargetAdmission(state, targetRef)

    expect(second).toEqual(first)
    expect(state).toEqual(originalState)
  })
})
