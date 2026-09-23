import { describe, expect, it } from 'vitest'

import { normalizeAbn } from '@/modules/money/public'

import { diagnosticForProfileValidation } from './provider-identity-validation'

const VALID_ABN = '51824753556'

describe('diagnosticForProfileValidation', () => {
  it('returns name diagnostic before website or ABN (first failure wins)', () => {
    const result = diagnosticForProfileValidation('', 'https://acme.example.com', VALID_ABN)
    expect(result?.whatHappened).toMatch(/supplier \/ brand name/i)
    expect(result?.financialImpact).toBe('A$0.00 affected — profile was not updated.')
  })

  it('treats whitespace-only name as empty', () => {
    const result = diagnosticForProfileValidation('   '.trim(), 'https://acme.example.com', VALID_ABN)
    expect(result?.whatHappened).toMatch(/supplier \/ brand name/i)
  })

  it('returns the same HTTPS triplet for protocol mismatch, parse failure, and non-URL input', () => {
    const insecure = diagnosticForProfileValidation('Acme', 'http://insecure.example.com', VALID_ABN)
    const notUrl = diagnosticForProfileValidation('Acme', 'not-a-url', VALID_ABN)
    const emptyHost = diagnosticForProfileValidation('Acme', 'https://', VALID_ABN)

    expect(insecure).toEqual(notUrl)
    expect(insecure).toEqual(emptyHost)
    expect(insecure?.whatHappened).toBe('Enter a valid HTTPS provider website.')
    expect(insecure?.nextStep).toMatch(/full https:\/\/ origin/i)
  })

  it('accepts a full HTTPS URL with path and query', () => {
    const result = diagnosticForProfileValidation(
      'Acme',
      'https://api.acme.example.com/v1/tools?env=sandbox',
      VALID_ABN,
    )
    expect(result).toBeUndefined()
  })

  it('validates ABN after name and HTTPS using normalized digits (checksum: tax-invoice-control.test.ts)', () => {
    const spacedAbn = normalizeAbn('51 824 753 556')
    expect(diagnosticForProfileValidation('Acme', 'https://acme.example.com', spacedAbn)).toBeUndefined()

    const badChecksum = diagnosticForProfileValidation('Acme', 'https://acme.example.com', '12345678901')
    expect(badChecksum?.whatHappened).toMatch(/invalid australian business number/i)
  })
})
