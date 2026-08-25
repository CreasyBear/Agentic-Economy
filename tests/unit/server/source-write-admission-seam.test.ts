import { describe, expect, it } from 'vitest'

import {
  readRequiredSourceWriteSecret,
  sourceWriteAdmissionFromContext,
} from '@/lib/server/source-write-admission'
import {
  createSourceWriteAdmission,
  sourceWriteBodyDigest,
  sourceWriteCommandBodyDigest,
  sourceWriteCommandDigest,
  verifySourceWriteAdmission,
} from '@/modules/security/source-write-admission'

import { publicEnvPrefix, sourceWriteContext } from './server-seams-harness'

describe('server Convex source seam', () => {
  it('creates request-bound source write admission from a scoped non-production derived key', async () => {
    const env = { AE_SOURCE_WRITE_SECRET: 'server-only-source-write-secret-long' }
    const command = {
      operationKey: 'op:billing:server-seam',
      correlationId: 'corr:billing:server-seam',
    }
    const context = sourceWriteContext()
    const request = {
      ...context.sourceWriteRequest,
      bodyDigest: sourceWriteCommandBodyDigest(command),
    }
    const admission = await sourceWriteAdmissionFromContext({
      context,
      command,
      env,
      scope: 'billing',
      operationKey: command.operationKey,
      correlationId: command.correlationId,
    })

    expect(admission).toMatchObject({
      version: 'source-write:v2',
      scope: 'billing',
      keyId: 'dev-billing-v2',
      operationKey: command.operationKey,
      correlationId: command.correlationId,
      method: request.method,
      initiatorOrigin: request.initiatorOrigin,
      targetOrigin: request.targetOrigin,
      targetPath: request.targetPath,
      targetQuery: request.targetQuery,
      bodyDigest: request.bodyDigest,
    })

    expect(
      await verifySourceWriteAdmission({
        admission,
        env,
        expected: {
          scope: 'billing',
          operationKey: command.operationKey,
          correlationId: command.correlationId,
          commandDigest: sourceWriteCommandDigest(command),
          request,
        },
      })
    ).toMatchObject({ kind: 'accepted' })
  })

  it('requires source write secrets to stay server-only', () => {
    expect(() => readRequiredSourceWriteSecret('billing', {})).toThrow(
      expect.objectContaining({ code: 'missing_source_write_secret' })
    )
    expect(() =>
      readRequiredSourceWriteSecret('billing', {
        AE_SOURCE_WRITE_SECRET: 'server-secret',
        [`${publicEnvPrefix}AE_SOURCE_WRITE_SECRET`]: 'client-secret',
      })
    ).toThrow(expect.objectContaining({ code: 'client_exposed_source_write_secret' }))
  })

  it('rejects unknown, wrong-family, and retired source write key ids while accepting configured previous keys', async () => {
    const command = {
      operationKey: 'op:rotation',
      correlationId: 'corr:rotation',
    }
    const request = {
      ...sourceWriteContext().sourceWriteRequest,
      bodyDigest: sourceWriteCommandBodyDigest(command),
    }
    const previousEnv = { AE_SOURCE_WRITE_KEY_BILLING: 'previous-billing:previous-secret-material-32-bytes-long' }
    const rotatedEnv = {
      AE_SOURCE_WRITE_KEY_BILLING: 'active-billing:active-secret-material-32-bytes-long',
      AE_SOURCE_WRITE_PREVIOUS_KEYS_BILLING: 'previous-billing:previous-secret-material-32-bytes-long',
    }
    const retiredEnv = { AE_SOURCE_WRITE_KEY_BILLING: 'active-billing:active-secret-material-32-bytes-long' }
    const previousAdmission = await createSourceWriteAdmission({
      env: previousEnv,
      request,
      scope: 'billing',
      operationKey: command.operationKey,
      correlationId: command.correlationId,
      commandDigest: sourceWriteCommandDigest(command),
    })

    expect(await verifySourceWriteAdmission({
      admission: previousAdmission,
      env: rotatedEnv,
      expected: {
        scope: 'billing',
        operationKey: command.operationKey,
        correlationId: command.correlationId,
        commandDigest: sourceWriteCommandDigest(command),
        request,
      },
    })).toMatchObject({ kind: 'accepted' })
    expect(await verifySourceWriteAdmission({
      admission: previousAdmission,
      env: retiredEnv,
      expected: {
        scope: 'billing',
        operationKey: command.operationKey,
        correlationId: command.correlationId,
        commandDigest: sourceWriteCommandDigest(command),
        request,
      },
    })).toMatchObject({ kind: 'rejected', reason: 'unknown_source_write_key_id' })

    const unknownKeyAdmission = {
      ...previousAdmission,
      keyId: 'unknown-billing',
    }
    expect(await verifySourceWriteAdmission({
      admission: unknownKeyAdmission,
      env: rotatedEnv,
      expected: {
        scope: 'billing',
        operationKey: command.operationKey,
        correlationId: command.correlationId,
        commandDigest: sourceWriteCommandDigest(command),
        request,
      },
    })).toMatchObject({ kind: 'rejected', reason: 'unknown_source_write_key_id' })

    const wrongFamilyAdmission = {
      ...previousAdmission,
      keyId: 'operator-active',
    }
    expect(await verifySourceWriteAdmission({
      admission: wrongFamilyAdmission,
      env: {
        AE_SOURCE_WRITE_KEY_BILLING: 'billing-active:billing-secret-material-32-bytes-long',
        AE_SOURCE_WRITE_KEY_OPERATOR: 'operator-active:operator-secret-material-32-bytes-long',
      },
      expected: {
        scope: 'billing',
        operationKey: command.operationKey,
        correlationId: command.correlationId,
        commandDigest: sourceWriteCommandDigest(command),
        request,
      },
    })).toMatchObject({ kind: 'rejected', reason: 'unknown_source_write_key_id' })
  })

  it.each([
    ['method', { method: 'PUT' }, 'source_write_method_mismatch'],
    ['path', { targetPath: '/v1/other' }, 'source_write_path_mismatch'],
    ['body', { bodyDigest: sourceWriteBodyDigest('{"tool":"tampered"}') }, 'source_write_body_mismatch'],
  ] as const)('rejects source write %s mismatch at the signed request boundary', async (_label, override, reason) => {
    const env = { AE_SOURCE_WRITE_SECRET: 'server-only-source-write-secret-long' }
    const command = {
      operationKey: 'op:request-bound',
      correlationId: 'corr:request-bound',
    }
    const request = {
      ...sourceWriteContext().sourceWriteRequest,
      targetPath: '/v1/execute',
      bodyDigest: sourceWriteCommandBodyDigest(command),
    }
    const admission = await createSourceWriteAdmission({
      env,
      request,
      scope: 'billing',
      operationKey: command.operationKey,
      correlationId: command.correlationId,
      commandDigest: sourceWriteCommandDigest(command),
    })

    expect(await verifySourceWriteAdmission({
      admission,
      env,
      expected: {
        scope: 'billing',
        operationKey: command.operationKey,
        correlationId: command.correlationId,
        commandDigest: sourceWriteCommandDigest(command),
        request: { ...request, ...override },
      },
    })).toMatchObject({ kind: 'rejected', reason })
  })
})
