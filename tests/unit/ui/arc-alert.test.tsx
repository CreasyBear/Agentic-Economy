/** @vitest-environment jsdom */
import { cleanup, render, screen } from '@testing-library/react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, expect, it } from 'vitest'
import '../../setup/jsdom-platform'
import { AeAlert as Alert } from '@/components/ae/shared/arc/alert/AeAlert'

afterEach(cleanup)

it('keeps caller-owned polite announcements and valid rich details in server and client output', () => {
  const notice = <Alert title="Treasury needs attention" tone="danger" role="status"><ul><li>Cash reconciliation needs review</li></ul></Alert>
  const server = document.createElement('div')
  server.innerHTML = renderToStaticMarkup(notice)
  expect(server.querySelector('[role="status"] ul li')?.textContent).toBe('Cash reconciliation needs review')
  expect(server.querySelector('p ul')).toBeNull()
  render(notice)
  expect(screen.getByRole('status').contains(screen.getByRole('list'))).toBe(true)
  expect(screen.getByRole('list').closest('p')).toBeNull()
  expect(screen.queryByRole('alert')).toBeNull()
})

it('retains default danger and informational live-region roles without an override', () => {
  const view = render(<Alert title="Action refused" tone="danger">Try again.</Alert>)
  expect(screen.getByRole('alert').textContent).toContain('Action refused')
  view.rerender(<Alert title="Waiting" tone="info">Waiting for a complete source read.</Alert>)
  expect(screen.getByRole('status')).toBeTruthy()
  expect(screen.queryByRole('alert')).toBeNull()
})
