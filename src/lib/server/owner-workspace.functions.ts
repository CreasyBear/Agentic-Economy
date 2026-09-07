import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'

import { callSourceMutation, sourceMutation } from '@/lib/server/convex-source'
import {
  sourceWriteAdmissionFromContext,
  sourceWriteRequestFromAdmission,
} from '@/lib/server/source-write-admission'
import type {
  SourceWriteAdmission,
  SourceWriteAdmissionRequest,
} from '@/modules/security/source-write-admission'

export type RenameProviderDisplayNameResult =
  | Readonly<{ kind: 'updated' | 'unchanged'; businessId: string; slug: string; name: string }>
  | Readonly<{ kind: 'refused'; code: 'unauthenticated' | 'wrong_owner' | 'invalid_name' | 'source_write_refused' | 'source_unavailable' }>

type RenameSourceResult = Exclude<RenameProviderDisplayNameResult, { code: 'source_unavailable' }>
type RenameCommand = Readonly<{
  businessId: string
  name: string
  operationKey: string
  correlationId: string
}>
type SourceWriteFields = Readonly<{
  sourceWrite: SourceWriteAdmission
  sourceWriteRequest: SourceWriteAdmissionRequest
}>

const renameProviderBusinessMutation = sourceMutation<
  RenameCommand & SourceWriteFields,
  RenameSourceResult
>('catalog:renameProviderBusiness')

export const renameProviderDisplayNameServer = createServerFn({ method: 'POST' })
  .validator((data) => z.strictObject({
    businessId: z.string().min(1),
    name: z.string(),
    requestKey: z.string().min(8).max(200),
  }).parse(data))
  .handler(async ({ data, context }): Promise<RenameProviderDisplayNameResult> => {
    const command: RenameCommand = {
      businessId: data.businessId,
      name: data.name,
      operationKey: `supplier-name:${data.requestKey}`,
      correlationId: `supplier-name:${data.requestKey}`,
    }
    try {
      const sourceWrite = await sourceWriteAdmissionFromContext({
        context,
        command,
        scope: 'catalog_publish',
        operationKey: command.operationKey,
        correlationId: command.correlationId,
      })
      return await callSourceMutation(renameProviderBusinessMutation, {
        ...command,
        sourceWrite,
        sourceWriteRequest: sourceWriteRequestFromAdmission(sourceWrite),
      })
    } catch {
      return { kind: 'refused', code: 'source_unavailable' }
    }
  })
