import { describe, expect, it } from 'vitest'
import { parseTreasuryThresholdInputs, treasuryRatios } from './treasury-view-model'
import { treasuryTestSnapshot } from './treasury-test-fixture'

describe('treasury display calculations', () => {
  it('uses available funds only, all credit families and reserved credit', () => {
    expect(treasuryRatios(treasuryTestSnapshot())).toEqual({ runway: 14, coverage: 1.75, creditAudUnits: '12000000', creditUsdcUnits: '8000000' })
  })
  it('preserves independently available runway and AUD credit when FX is unavailable', () => {
    const snapshot = treasuryTestSnapshot()
    snapshot.referenceRate = { kind: 'unavailable', code: 'fixture' }
    expect(treasuryRatios(snapshot)).toEqual({ runway: 14, coverage: null, creditAudUnits: '12000000', creditUsdcUnits: null })
  })
  it('does not divide by zero burn or outstanding credit', () => {
    const snapshot = treasuryTestSnapshot()
    if (snapshot.ledger.kind !== 'available') throw new Error('fixture')
    Object.assign(snapshot.ledger, { payments7dUnits: '0', purchasedAvailableAudUnits: '0', purchasedReservedAudUnits: '0', promotionalAvailableAudUnits: '0', promotionalReservedAudUnits: '0' })
    expect(treasuryRatios(snapshot)).toEqual({ runway: null, coverage: null, creditAudUnits: '0', creditUsdcUnits: '0' })
  })
  it('rounds converted credit up and bounds numeric display ratios', () => {
    const snapshot = treasuryTestSnapshot()
    if (snapshot.ledger.kind !== 'available') throw new Error('fixture')
    Object.assign(snapshot.ledger, { availableUnits: '9999999999999999', purchasedAvailableAudUnits: '1', purchasedReservedAudUnits: '0', promotionalAvailableAudUnits: '0', promotionalReservedAudUnits: '0' })
    expect(treasuryRatios(snapshot)).toMatchObject({ coverage: 9999, runway: 9999, creditUsdcUnits: '1' })
  })
  it.each([['0', '0'], ['2', '1'], ['1.0000001', '2'], ['-1', '2'], ['1', '9007199254.740992']])('rejects invalid thresholds %s / %s', (low, target) => {
    expect(parseTreasuryThresholdInputs(low, target)).toBeNull()
  })
  it('converts decimal amounts exactly without floating-point multiplication', () => {
    expect(parseTreasuryThresholdInputs('0.000001', '1234.567891')).toEqual({ lowWaterUnits: '1', targetFloatUnits: '1234567891' })
  })
})
