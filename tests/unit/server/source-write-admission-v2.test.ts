import { describe, expect, it } from 'vitest'

import {
  sourceWriteAdmissionFromContext,
  sourceWriteAdmissionFromRequest,
  sourceWriteRequestFromRequest,
} from '@/lib/server/source-write-admission'
import {
  sourceWriteBodyDigest,
  sourceWriteCommandDigest,
  sourceWriteCommandBodyDigest,
  sourceWriteRequestFromAdmission,
  verifySourceWriteAdmission,
} from '@/modules/security/source-write-admission'

const env = { AE_SOURCE_WRITE_SECRET: 'server-source-write-v2-key-material-at-least-32' }

describe('server source-write:v2 helpers', () => {
  it('binds initiator origin separately and preserves the actual target query', () => {
    const request = new Request('https://ae.example/v1/source-write?a=1&x=%2F', {
      method: 'POST',
      headers: { Origin: 'https://app.example' },
    })
    expect(sourceWriteRequestFromRequest({ request, body: '{}' })).toEqual({
      method: 'POST',
      initiatorOrigin: 'https://app.example',
      targetOrigin: 'https://ae.example',
      targetPath: '/v1/source-write',
      targetQuery: '?a=1&x=%2F',
      bodyDigest: sourceWriteBodyDigest('{}'),
    })
  })

  it('requires exact request body bytes and exact Convex command args', async () => {
    const request = new Request('https://ae.example/v1/source-write?a=1', {
      method: 'POST',
      headers: { Origin: 'https://app.example' },
    })
    const body = '{"value":"☃"}'
    const command = { operationKey: 'op:request', correlationId: 'corr:request', value: '☃' }
    const admission = await sourceWriteAdmissionFromRequest({
      request,
      command,
      body,
      scope: 'protected_action',
      operationKey: command.operationKey,
      correlationId: command.correlationId,
      env,
    })
    expect(admission.commandDigest).toBe(sourceWriteCommandDigest(command))
    expect(sourceWriteRequestFromAdmission(admission)).toEqual(sourceWriteRequestFromRequest({ request, body }))
    await expect(verifySourceWriteAdmission({
      admission,
      env,
      expected: {
        scope: 'protected_action',
        operationKey: command.operationKey,
        correlationId: command.correlationId,
        commandDigest: sourceWriteCommandDigest(command),
        request: sourceWriteRequestFromRequest({ request, body }),
      },
    })).resolves.toMatchObject({ kind: 'accepted' })
  })

  it('derives a non-empty body digest from the exact context command instead of defaulting to no-body', async () => {
    const command = { operationKey: 'op:context', correlationId: 'corr:context', value: 'context' }
    const context = {
      sourceWriteRequest: {
        method: 'POST',
        initiatorOrigin: 'https://app.example',
        targetOrigin: 'https://ae.example',
        targetPath: '/v1/context',
        targetQuery: '?mode=exact',
        bodyDigest: 'none',
      },
    }
    const admission = await sourceWriteAdmissionFromContext({
      context,
      command,
      scope: 'catalog_publish',
      operationKey: command.operationKey,
      correlationId: command.correlationId,
      env,
    })
    expect(admission.bodyDigest).toBe(sourceWriteCommandBodyDigest(command))
    expect(admission.bodyDigest).not.toBe('none')
  })

  it('fails closed when the exact command object is missing', async () => {
    await expect(sourceWriteAdmissionFromContext({
      context: {
        sourceWriteRequest: {
          method: 'POST',
          initiatorOrigin: 'https://app.example',
          targetOrigin: 'https://ae.example',
          targetPath: '/v1/context',
          targetQuery: '',
          bodyDigest: 'none',
        },
      },
      command: undefined,
      scope: 'catalog_publish',
      operationKey: 'op:missing-command',
      correlationId: 'corr:missing-command',
      env,
    })).rejects.toMatchObject({ code: 'missing_source_write_request' })
  })
})
