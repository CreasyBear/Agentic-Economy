import { describe, expect, it } from 'vitest'
import { requestTarget } from '@/modules/capability-supply/internal/route-transport-http-json'

const endpoint = new URL('https://provider.example/v1/items/{id}/detail')
const path = [{ parameter: 'id', inputPointer: '/id' }] as never
const target = (id: unknown) => requestTarget(endpoint, 'GET', undefined, undefined, path, undefined, JSON.stringify({ id }))

describe('HTTP JSON path mapping', () => {
  it('refuses dot segments that would escape the registered path', () => {
    for (const id of ['..', '.']) expect(target(id)).toMatchObject({ kind: 'refused', failureCode: 'input_invalid' })
  })

  it('keeps an ordinary value inside the registered path', () => {
    expect(target('a b')).toMatchObject({ kind: 'prepared' })
  })
})
