/** @vitest-environment jsdom */
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import '../../setup/jsdom-platform'
import { ToolPanelActions } from '@/components/ae/chat/tool-panel/components/ToolPanelActions'
import type { ToolPanelView } from '@/components/ae/chat/tool-panel/tool-panel.contracts'
import { chatToolPanel } from '@/lib/public/chat-ia'

afterEach(cleanup)

it('discloses data release before Run without adding a second approval or losing the Run action', () => {
  const onRun = vi.fn()
  const view: ToolPanelView = {
    heading: 'Lookup', price: 'Price to be confirmed', readiness: 'Ready', bestMatch: false,
    phase: 'form', inputText: '{"city":"Perth"}', canRun: true,
    consequence: chatToolPanel.runNow, priceNote: chatToolPanel.priceNote, submission: 'idle',
  }
  render(<ToolPanelActions view={view} statusId="run-status" onRun={onRun} onRunAgain={vi.fn()} />)
  const disclosure = screen.getByText(/These inputs can be sent to the selected Tool Provider/u)
  const run = screen.getByRole('button', { name: 'Run' })
  expect(disclosure.compareDocumentPosition(run) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0)
  const link = screen.getByRole('link', { name: 'How your data is handled (opens in a new tab)' })
  expect(link).toHaveAttribute('href', '/trust#data')
  expect(link).toHaveAttribute('target', '_blank')
  expect(link).toHaveAttribute('rel', 'noreferrer')
  expect(screen.getAllByRole('button')).toHaveLength(1)
  expect(screen.getByText(/charged after payment settles/u)).toHaveTextContent('even if the answer is unusable')
  fireEvent.click(run)
  expect(onRun).toHaveBeenCalledOnce()
})
