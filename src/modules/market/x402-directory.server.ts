import { projectX402DirectoryEntry } from './x402-directory-projection'
import { readX402DirectoryRawPage } from './x402-directory-source.server'
import type { X402DirectoryInput, X402DirectoryPage } from './x402-directory'
import { rerankX402DirectoryPage } from './x402-directory-reranker'

export async function readX402Directory(input: X402DirectoryInput): Promise<X402DirectoryPage> {
  const page = await readX402DirectoryRawPage(input)
  return page.kind === 'unavailable' ? page : await rerankX402DirectoryPage({ ...page, items: page.items.map(projectX402DirectoryEntry) }, input.query)
}
