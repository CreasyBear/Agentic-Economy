import { createServerFn } from '@tanstack/react-start'
import { readX402Directory } from './x402-directory.server'
import { x402DirectoryInputSchema } from './x402-directory'

export const readX402DirectoryServer = createServerFn({ method: 'GET' })
  .validator((data) => x402DirectoryInputSchema.parse(data))
  .handler(async ({ data }) => await readX402Directory(data))
