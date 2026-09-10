import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('client notification boundary', () => {
  it('mounts Sonner only inside ClientOnly and dispatches through createClientOnlyFn', () => {
    const rootSource = readFileSync(resolve(process.cwd(), 'src/routes/__root.tsx'), 'utf8')
    const toastSource = readFileSync(resolve(process.cwd(), 'src/lib/ui/toast.ts'), 'utf8')
    const clientOnlyStart = rootSource.indexOf('<ClientOnly>')
    const toaster = rootSource.indexOf('<Toaster')
    const clientOnlyEnd = rootSource.indexOf('</ClientOnly>')

    expect(clientOnlyStart).toBeGreaterThan(-1)
    expect(toaster).toBeGreaterThan(clientOnlyStart)
    expect(clientOnlyEnd).toBeGreaterThan(toaster)
    expect(toastSource).toContain('createClientOnlyFn')
    expect(toastSource).toContain("dispatchToastOnClient('success'")
    expect(toastSource).toContain("dispatchToastOnClient('error'")
  })
})
