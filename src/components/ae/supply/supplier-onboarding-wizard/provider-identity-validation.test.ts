import { describe, expect, it } from 'vitest'


import { diagnosticForProfileValidation } from './provider-identity-validation'


describe('diagnosticForProfileValidation', () => {
  it('returns name diagnostic before website (first failure wins)', () => {
    const result = diagnosticForProfileValidation('', 'https://acme.example.com')
    expect(result?.whatHappened).toMatch(/supplier \/ brand name/i)
    expect(result?.financialImpact).toBe('A$0.00 affected — profile was not updated.')
  })

  it('treats whitespace-only name as empty', () => {
    const result = diagnosticForProfileValidation('   '.trim(), 'https://acme.example.com')
    expect(result?.whatHappened).toMatch(/supplier \/ brand name/i)
  })

  it('returns the same HTTPS triplet for protocol mismatch, parse failure, and non-URL input', () => {
    const insecure = diagnosticForProfileValidation('Acme', 'http://insecure.example.com')
    const notUrl = diagnosticForProfileValidation('Acme', 'not-a-url')
    const emptyHost = diagnosticForProfileValidation('Acme', 'https://')

    expect(insecure).toEqual(notUrl)
    expect(insecure).toEqual(emptyHost)
    expect(insecure?.whatHappened).toBe('Enter a valid HTTPS provider website.')
    expect(insecure?.nextStep).toMatch(/full https:\/\/ origin/i)
  })

  it('accepts a full HTTPS URL with path and query', () => {
    const result = diagnosticForProfileValidation(
      'Acme',
      'https://api.acme.example.com/v1/tools?env=sandbox',
    )
    expect(result).toBeUndefined()
  })

  it('accepts Provider identity without tax facts', () => {
    expect(diagnosticForProfileValidation('Acme', 'https://acme.example.com')).toBeUndefined()
  })
})
