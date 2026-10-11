// @vitest-environment jsdom
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { AeObservabilityErrorBoundary } from './AeObservabilityErrorBoundary'

vi.mock('@/lib/observability/capture-client-exception', () => ({ captureClientExceptionOnClient: vi.fn() }))


describe('AeObservabilityErrorBoundary', () => {
  it('renders a caller fallback with resetError', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    let fail = true
    function Child() {
      if (fail) throw new Error('boom')
      return <p>recovered</p>
    }
    render(
      <AeObservabilityErrorBoundary fallback={({ resetError }) => <button onClick={() => { fail = false; resetError() }}>retry</button>}>
        <Child />
      </AeObservabilityErrorBoundary>,
    )
    fireEvent.click(screen.getByText('retry'))
    expect(screen.getByText('recovered')).toBeTruthy()
  })

  it('keeps @sentry/react out of every module except sentry.client.ts', () => {
    const offenders: string[] = []
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name)
        if (statSync(path).isDirectory()) walk(path)
        else if (/\.tsx?$/.test(name) && !/\.test\./.test(name) && !path.endsWith('observability/sentry.client.ts')
          && /from '@sentry\/react'/.test(readFileSync(path, 'utf8'))) offenders.push(path)
      }
    }
    walk(join(process.cwd(), 'src'))
    expect(offenders).toEqual([])
  })
})
