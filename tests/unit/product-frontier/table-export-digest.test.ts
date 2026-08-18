import { describe, expect, it } from 'vitest'

import {
  buildUnmeasuredCloseoutExportManifest,
  buildUnmeasuredInquiryExportManifest,
  classificationForTable,
  digestTableRows,
  INQUIRY_EXPORT_TABLES,
  omitSecretFields,
  P6_CLOSEOUT_EXPORT_TABLES,
} from '@/modules/product-frontier/table-export-digest'

describe('P6 table export digest', () => {
  it('omits wrap fields from governedSendReceiptKeys before hashing', () => {
    const row = {
      keyRef: 'key:1',
      receiptOperationKey: 'op:1',
      wrappedKeyBase64: 'SECRET_WRAP',
      wrapIvBase64: 'SECRET_IV',
      kekKeyId: 'kek:1',
      createdAt: 1,
    }
    const omitted = omitSecretFields('governedSendReceiptKeys', row)
    expect(omitted).toEqual({
      keyRef: 'key:1',
      receiptOperationKey: 'op:1',
      kekKeyId: 'kek:1',
      createdAt: 1,
    })
    expect(JSON.stringify(omitted)).not.toContain('SECRET_WRAP')
    expect(JSON.stringify(omitted)).not.toContain('SECRET_IV')
    expect(classificationForTable('governedSendReceiptKeys')).toBe('hash-only')

    const digest = digestTableRows('governedSendReceiptKeys', [row, {
      ...row,
      wrappedKeyBase64: 'OTHER_WRAP',
      wrapIvBase64: 'OTHER_IV',
    }])
    expect(digest.classification).toBe('hash-only')
    expect(digest.count).toBe(2)
    expect(digest.sha256).toMatch(/^sha256:[0-9a-f]{64}$/)
    expect(digest.sha256).toBe(digestTableRows('governedSendReceiptKeys', [{
      ...row,
      wrappedKeyBase64: 'THIRD_WRAP',
      wrapIvBase64: 'THIRD_IV',
    }, row]).sha256)
  })

  it('is stable for full-digest inquiry tables and lists all twelve', () => {
    const rows = [
      { threadId: 'thread:b', status: 'open' },
      { threadId: 'thread:a', status: 'open' },
    ]
    const first = digestTableRows('inquiryThreads', rows)
    const second = digestTableRows('inquiryThreads', [...rows].reverse())
    expect(first).toEqual(second)
    expect(first.classification).toBe('full-digest')
    expect(INQUIRY_EXPORT_TABLES).toHaveLength(12)
    expect(INQUIRY_EXPORT_TABLES).toContain('governedSendReceiptKeys')
    expect(INQUIRY_EXPORT_TABLES).toContain('inquiryPrivacyTombstones')
  })

  it('records unmeasured counts when no Convex export is present', () => {
    const inquiry = buildUnmeasuredInquiryExportManifest('2026-08-18')
    expect(inquiry.schemaVersion).toBe('ae-p6-table-export:v1')
    expect(inquiry.deployment).toBe('unavailable')
    expect(inquiry.tables).toHaveLength(12)
    expect(inquiry.tables.every((entry) => entry.count === 'unmeasured' && entry.sha256 === null)).toBe(true)

    const closeout = buildUnmeasuredCloseoutExportManifest('2026-08-18')
    expect(closeout.deployment).toBe('unavailable')
    expect(closeout.tables).toHaveLength(131)
    expect(P6_CLOSEOUT_EXPORT_TABLES).toHaveLength(131)
    expect(P6_CLOSEOUT_EXPORT_TABLES).toContain('customerRequestX402PaymentAttempts')
    expect(P6_CLOSEOUT_EXPORT_TABLES).toContain('studies')
    expect(P6_CLOSEOUT_EXPORT_TABLES).toContain('routingKernelRootRuns')
    expect(P6_CLOSEOUT_EXPORT_TABLES).toContain('inquiryPrivacyTombstones')
    expect(closeout.tables.every((entry) => entry.count === 'unmeasured' && entry.sha256 === null)).toBe(true)
  })
})
