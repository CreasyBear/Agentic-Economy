import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import { findFiles } from '@/lib/ui/contract-scans'

const providerSecretEnvNamePattern = /\bCLERK_SECRET_KEY\b/

const operatorRawPrivateMarkerPattern =
  /\b(?:privatePayloadRef|rawPayload|rawBody|rawContact|contactEmail|providerPayload|webhookSecret|secretKey|cardNumber|customerEmail)\b|customer@example\.test|private-endpoint:\/\//i

describe('provider secret UI surface', () => {
  it('keeps provider secret env names out of rendered route and component source', () => {
    const files = findFiles([
      { root: 'src/components', includeExtensions: ['.ts', '.tsx'] },
      { root: 'src/routes', includeExtensions: ['.tsx'] },
    ])

    const violations = files
      .filter((file) => providerSecretEnvNamePattern.test(readFileSync(file, 'utf8')))
      .map((file) => file.replaceAll('\\', '/'))

    expect(violations).toEqual([])
  })

  it('keeps raw private readback markers out of operator route and readback component source', () => {
    const files = findFiles([
      { root: 'src/components/ae/readback', includeExtensions: ['.ts', '.tsx'] },
      { root: 'src/routes/_operator', includeExtensions: ['.tsx'] },
    ])

    const violations = files
      .filter((file) => operatorRawPrivateMarkerPattern.test(readFileSync(file, 'utf8')))
      .map((file) => file.replaceAll('\\', '/'))

    expect(violations).toEqual([])
  })
})
