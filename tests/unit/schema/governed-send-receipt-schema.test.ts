import { describe, expect, it } from 'vitest'
import { defineSchema } from 'convex/server'

import { inquiryTables } from '@/modules/inquiries/internal/convex-schema'

describe('governedSendReceipts schema', () => {
  const schema = defineSchema({ governedSendReceipts: inquiryTables.governedSendReceipts })
  const exportSchema = Reflect.get(schema, 'export')
  if (typeof exportSchema !== 'function') throw new Error('Convex schema export function is unavailable')
  const [exported] = JSON.parse(String(exportSchema.call(schema))).tables

  it('exposes encrypted receipt metadata without plaintext canonical bytes', () => {
    expect(exported.documentType).toEqual({
      type: 'object',
      value: {
        envelopeVersion: {
          fieldType: { type: 'literal', value: 'inquiry-receipt-envelope:v1' },
          optional: false,
        },
        keyRef: {
          fieldType: { type: 'string' },
          optional: false,
        },
        ciphertextBase64: {
          fieldType: { type: 'string' },
          optional: false,
        },
        contentIvBase64: {
          fieldType: { type: 'string' },
          optional: false,
        },
        digest: {
          fieldType: { type: 'string' },
          optional: false,
        },
        algorithm: {
          fieldType: { type: 'literal', value: 'sha256' },
          optional: false,
        },
        schemaVersion: {
          fieldType: { type: 'number' },
          optional: false,
        },
        createdAt: {
          fieldType: { type: 'number' },
          optional: false,
        },
        operationKey: {
          fieldType: { type: 'string' },
          optional: false,
        },
        threadId: {
          fieldType: { type: 'string' },
          optional: false,
        },
        admissionProof: {
          fieldType: {
            type: 'object',
            value: {
              version: {
                fieldType: { type: 'literal', value: 'r1-target-admitted:v1' },
                optional: false,
              },
              admitted: {
                fieldType: { type: 'literal', value: true },
                optional: false,
              },
              proof: {
                fieldType: {
                  type: 'object',
                  value: {
                    kind: {
                      fieldType: { type: 'literal', value: 'claimed_owner' },
                      optional: false,
                    },
                    claimRef: {
                      fieldType: { type: 'string' },
                      optional: false,
                    },
                    recipientRef: {
                      fieldType: { type: 'string' },
                      optional: false,
                    },
                    destinationVerifiedAt: {
                      fieldType: { type: 'number' },
                      optional: true,
                    },
                  },
                },
                optional: false,
              },
            },
          },
          optional: false,
        },
        recipientRef: {
          fieldType: { type: 'string' },
          optional: false,
        },
      },
    })
  })

  it('exposes the operation-key and thread chronology indexes with exact field order', () => {
    expect(exported.indexes).toEqual([
      {
        indexDescriptor: 'by_operationKey',
        fields: ['operationKey'],
      },
      {
        indexDescriptor: 'by_threadId_and_createdAt',
        fields: ['threadId', 'createdAt'],
      },
    ])
  })
})
