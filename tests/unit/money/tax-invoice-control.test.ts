import { describe, expect, it } from 'vitest'

import {
  admitTaxInvoiceIssuance,
  isValidAbn,
  normalizeAbn,
  SANDBOX_COMMERCIAL_POLICY_CONTROLS,
} from '../../../src/modules/money/public'

const enabledTaxControl = Object.freeze({
  ...SANDBOX_COMMERCIAL_POLICY_CONTROLS.tax,
  taxInvoiceIssuance: 'enabled' as const,
})

const validFacts = Object.freeze({
  abn: '51824753556',
  gstRegistered: true,
  legalCustomerRef: 'legal-customer:tax-test',
  effectiveAt: 1_800_000_000_000,
})

describe('tax invoice issuance control', () => {
  it('validates ABN format and checksum', () => {
    expect(isValidAbn('51824753556')).toBe(true)
    expect(isValidAbn('53004085616')).toBe(true)
    expect(isValidAbn('12345678901')).toBe(false)
    expect(isValidAbn('5182475355')).toBe(false)
    expect(isValidAbn('5182475355a')).toBe(false)
    expect(isValidAbn('')).toBe(false)
  })

  describe('normalizeAbn', () => {
    it('V4: strips spaces and hyphens before checksum validation', () => {
      expect(isValidAbn('51 824 753 556')).toBe(false)
      expect(isValidAbn('51-824-753-556')).toBe(false)
      expect(normalizeAbn('51 824 753 556')).toBe('51824753556')
      expect(normalizeAbn('51-824-753-556')).toBe('51824753556')
      expect(isValidAbn(normalizeAbn('51 824 753 556'))).toBe(true)
    })

    it('V5: normalizes the official ATO worked example', () => {
      expect(normalizeAbn('51 824 753 556')).toBe('51824753556')
      expect(isValidAbn(normalizeAbn('51 824 753 556'))).toBe(true)
    })

    it.each([
      ['5182475355612', '12 digits after strip'],
      ['00000000000', 'all zeros'],
      ['01824753556', 'leading zero first digit'],
    ] as const)('V6: rejects invalid normalized ABN (%s)', (value, _label) => {
      expect(isValidAbn(normalizeAbn(value))).toBe(false)
    })
  })

  describe('admitTaxInvoiceIssuance', () => {
    it('withholds when policy is disabled_pending_approval', () => {
      expect(admitTaxInvoiceIssuance({
        taxControl: SANDBOX_COMMERCIAL_POLICY_CONTROLS.tax, totalUnits: '5780000',
        customerTaxFacts: validFacts,
      })).toEqual({ kind: 'withheld', reason: 'policy_disabled' })
    })

    it('withholds when enabled but customer tax facts are missing', () => {
      expect(admitTaxInvoiceIssuance({
        taxControl: enabledTaxControl, totalUnits: '1000000000',
      })).toEqual({ kind: 'withheld', reason: 'customer_tax_facts_missing' })
    })

    it('withholds when enabled but ABN is invalid', () => {
      expect(admitTaxInvoiceIssuance({
        taxControl: enabledTaxControl, totalUnits: '1000000000',
        customerTaxFacts: { ...validFacts, abn: '12345678901' },
      })).toEqual({ kind: 'withheld', reason: 'customer_abn_invalid' })
    })

    it('admits an identified recipient who is not GST registered', () => {
      expect(admitTaxInvoiceIssuance({
        taxControl: enabledTaxControl, totalUnits: '1000000000',
        customerTaxFacts: { ...validFacts, gstRegistered: false },
      })).toEqual({ kind: 'admitted' })
    })

    it('admits a small invoice without buyer tax registration or identity', () => {
      expect(admitTaxInvoiceIssuance({ taxControl: enabledTaxControl, totalUnits: '999990000' })).toEqual({ kind: 'admitted' })
    })

    it('admits a large invoice with recipient legal name without an ABN', () => {
      expect(admitTaxInvoiceIssuance({ taxControl: enabledTaxControl, totalUnits: '1000000000',
        customerTaxFacts: { legalCustomerRef: 'customer:test', legalName: 'Alex Buyer', gstRegistered: false, effectiveAt: 1 },
      })).toEqual({ kind: 'admitted' })
    })

    it('admits when enabled with valid ABN and GST registration', () => {
      expect(admitTaxInvoiceIssuance({
        taxControl: enabledTaxControl, totalUnits: '1000000000',
        customerTaxFacts: validFacts,
      })).toEqual({ kind: 'admitted' })
    })
  })
})
