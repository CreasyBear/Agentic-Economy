import { createServerFn } from '@tanstack/react-start'
import { degrade } from '@/lib/observability/degrade'
import { callPublicSourceAction, sourceAction } from '@/lib/server/convex-source'
import { readX402Directory } from './x402-directory.server'
import { x402DirectoryInputSchema, x402DirectoryResolveInputSchema, type X402DirectoryResolveInput, type X402DirectoryResolution } from './x402-directory'

export const readX402DirectoryServer = createServerFn({ method: 'GET' })
  .validator((data) => x402DirectoryInputSchema.parse(data))
  .handler(async ({ data }) => await readX402Directory(data))

const resolveResource = sourceAction<X402DirectoryResolveInput, X402DirectoryResolution>('x402Directory:resolve')
export const prepareX402DirectoryResourceServer = createServerFn({ method: 'POST' })
  .validator((data) => x402DirectoryResolveInputSchema.parse(data))
  .handler(async ({ data }): Promise<X402DirectoryResolution> => {
    try { return await callPublicSourceAction(resolveResource, data) }
    catch (cause) {
      return degrade(cause, { kind: 'unavailable', reason: 'source_unavailable' } as const, {
        site: 'prepareX402DirectoryResourceServer',
        reason: 'source_unavailable',
      })
    }
  })
