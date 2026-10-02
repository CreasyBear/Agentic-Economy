import { projectX402DirectoryEntry } from './x402-directory-projection'
import { readX402DirectoryRawPage } from './x402-directory-source.server'
import type { X402DirectoryInput, X402DirectoryPage } from './x402-directory'
import { rerankX402DirectoryPage } from './x402-directory-reranker'
import { deploymentPaymentEnvironment } from '@/lib/deployment/environment'
import { x402PaymentProfileForEnvironment } from '@/modules/capability-supply/public'
import { directoryNetwork } from './x402-directory-index'

export async function readX402Directory(input: X402DirectoryInput): Promise<X402DirectoryPage> {
  const page = await readX402DirectoryRawPage(input)
  if (page.kind === 'unavailable') return page
  const network = x402PaymentProfileForEnvironment(deploymentPaymentEnvironment(process.env))?.network
  if (network === undefined) return { kind: 'unavailable', reason: 'source_unavailable' }
  return await rerankX402DirectoryPage({
    ...page,
    items: page.items.map(item => {
      const projected = projectX402DirectoryEntry(item)
      return { ...projected, prices: projected.prices.filter(price => directoryNetwork(price.network) === network) }
    }),
  }, input.query)
}
