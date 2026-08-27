import { describe, expect, it } from 'vitest'

import {
  probeTargetDigest,
  type ProbeDigestBinding,
  type ProbeDigestOffering,
  type ProbeDigestPublication,
} from '@/modules/capability-supply/internal/graph/probe-digest'

const digest = `sha256:${'1'.repeat(64)}`

const publication: ProbeDigestPublication = {
  publicationRef: 'offering:probe-digest',
  revision: 1,
  capabilityId: 'probe.lookup',
  businessId: 'business:probe-digest',
  contractDigest: digest,
}

const offering: ProbeDigestOffering = {
  registrationHash: digest,
  eligibilityHash: digest,
  status: 'active',
}

function binding(authority: ProbeDigestBinding['authority']): ProbeDigestBinding {
  return {
    bindingId: 'binding:probe-digest',
    endpointUrl: 'https://probe.example.test/lookup',
    authority,
    adapterId: 'http-json:v1',
    configDigest: digest,
    registrationHash: digest,
    eligibilityHash: digest,
    admission: 'admitted',
    conformance: 'conformant',
  }
}

describe('capability readiness probe target digest', () => {
  it('omits the absent connection authority for keyless bindings', () => {
    expect(() => probeTargetDigest(publication, offering, binding({ kind: 'public_upstream' }))).not.toThrow()
  })

  it('omits a missing provider snapshot instead of hashing undefined', () => {
    expect(() => probeTargetDigest(publication, offering, binding({
      kind: 'provider_connection',
      connectionRef: 'connection:probe-digest',
      providerRef: 'provider:probe-digest',
    }))).not.toThrow()
  })
})
