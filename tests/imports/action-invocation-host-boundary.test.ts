import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const hostFiles = [
  'src/modules/action-invocation/development-hosts.ts',
]

describe('Action Invocation host boundary', () => {
  it.each(hostFiles)('%s imports no capability-supply or internal lifecycle owner', (path) => {
    const source = readFileSync(path, 'utf8')
    expect(source).not.toMatch(/from ['"]@\/modules\/capability-supply/iu)
    expect(source).not.toMatch(/from ['"].*\/internal\//iu)
    expect(source).not.toMatch(/dynamic-published-adapter/iu)
    expect(source).not.toMatch(/transport|credential|payment|prepareDynamic|executeDynamic/iu)
  })
})
