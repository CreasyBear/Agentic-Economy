import { describe, expect, it } from 'vitest'

import { SANDBOX_COMMERCIAL_POLICY_CONTROLS } from '@/modules/money/public'
import { PRODUCTION_COMMERCIAL_POLICY_CONTROLS } from '../../../../../tests/helpers/commercial-policy-fixtures'
import { commercialPolicyStatus } from './CommercialPolicyTable'

const NOW = 1_800_000_000_000
const base: Pick<Parameters<typeof commercialPolicyStatus>[0], 'family' | 'conflict' | 'deploymentProfileValid' | 'pending'> = {
  family: 'tax', conflict: false, deploymentProfileValid: true, pending: [],
}
const current = {
  policyRef: 'policy:tax', revision: 1, lifecycle: 'active',
  effectiveAt: NOW - 1, expiresAt: NOW + 1,
  control: SANDBOX_COMMERCIAL_POLICY_CONTROLS.tax,
  evidenceRef: 'evidence:tax', approvedByPrincipalRef: 'principal:owner', stateDigest: 'sha256:state',
} as const

describe('commercial policy record status', () => {
  it('keeps missing, pending, active, expired and conflicted records distinct', () => {
    expect(commercialPolicyStatus({ ...base, current: null }, NOW)).toBe('Missing')
    expect(commercialPolicyStatus({ ...base, current: null, pending: [{
      family: 'tax', proposalRef: 'proposal:tax', proposerRef: 'principal:owner', expiresAt: NOW + 1,
    }] }, NOW)).toBe('Missing')
    expect(commercialPolicyStatus({ ...base, current }, NOW)).toBe('Active')
    expect(commercialPolicyStatus({ ...base, current: { ...current, expiresAt: NOW } }, NOW)).toBe('Expired')
    expect(commercialPolicyStatus({ ...base, current, conflict: true }, NOW)).toBe('Conflicting active records')
    expect(commercialPolicyStatus({ ...base, family: 'treasury_custody', current: {
      ...current, control: PRODUCTION_COMMERCIAL_POLICY_CONTROLS.treasury_custody,
    }, deploymentProfileValid: false }, NOW)).toBe('Custody cap unavailable or below recorded buffer')
    expect(commercialPolicyStatus({ ...base, family: 'treasury_custody', current: {
      ...current, control: SANDBOX_COMMERCIAL_POLICY_CONTROLS.treasury_custody,
    } }, NOW)).toBe('Invalid recorded terms')
  })
})
