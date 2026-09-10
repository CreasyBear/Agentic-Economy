/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { DirectoryProviderCards } from '@/components/ae/market/DirectoryProviderCards'
import type { X402DirectoryEntry } from '@/modules/market/x402-directory'
afterEach(cleanup)
it('groups only supplied results by exact hostname and selects the provider', () => {
  const select = vi.fn()
  const entry: X402DirectoryEntry = { provider: 'api.example.com', resource: 'https://api.example.com/a', title: 'A', description: '', protocol: 'http', prices: [], metadataJson: '{}', tags: ['Research'], outputSummary: 'Returns research.' }
  render(<DirectoryProviderCards entries={[entry, { ...entry, resource: 'https://api.example.com/b' }, { ...entry, provider: 'other.example.com' }]} onSelect={select} />)
  expect(screen.getByText('2 Tools in these results')).toBeTruthy()
  expect(screen.getByText('1 Tool in these results')).toBeTruthy()
  expect(screen.getAllByText('Research')).toHaveLength(2)
  expect(screen.queryByRole('img')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'View Tools from api.example.com' }))
  expect(select).toHaveBeenCalledWith('api.example.com')
})
it('shows actual Tool titles and descriptions without double-counting repeated endpoints', () => {
  const entry: X402DirectoryEntry = { provider: 'api.example.com', resource: 'https://api.example.com/translate', title: 'Translate a document', description: 'Translate text while preserving document structure.', protocol: 'http', prices: [{ network: 'eip155:8453', networkLabel: 'Base', amount: '0.02 USDC', scheme: 'exact' }], metadataJson: '{}', category: 'translation' }
  render(<DirectoryProviderCards entries={[entry, entry]} onSelect={() => {}} />)
  expect(screen.getByText('1 Tool in these results')).toBeTruthy()
  expect(screen.getByText('Translate a document')).toBeTruthy()
  expect(screen.getByText('Translate text while preserving document structure.')).toBeTruthy()
  expect(screen.getByText('Networks in these results: Base')).toBeTruthy()
  expect(screen.queryByText(/verified|reviews|stars/i)).toBeNull()
})
