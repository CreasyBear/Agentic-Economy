// @vitest-environment jsdom

import { render, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('shiki', () => ({
  createHighlighter: vi.fn(async () => ({
    codeToTokens: (code: string) => ({
      bg: '#ffffff',
      fg: '#111111',
      tokens: [[{ color: '#123456', content: code, fontStyle: 0 }]],
    }),
    getLoadedLanguages: () => ['typescript'],
  })),
}))

import { CodeBlock } from '@/components/ai-elements/code-block'

describe('CodeBlock deterministic highlighting', () => {
  it('waits for the asynchronous highlighter result before the test completes', async () => {
    const code = 'const maturity = true'
    const view = render(<CodeBlock code={code} language="typescript" />)

    await waitFor(() => {
      const token = view.getByText(code)
      expect(token.style.color).toBe('rgb(18, 52, 86)')
      expect(token.closest('pre')?.style.backgroundColor).toBe('rgb(255, 255, 255)')
    })
  })
})
