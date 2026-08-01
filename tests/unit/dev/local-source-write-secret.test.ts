import { describe, expect, it } from 'vitest'

import {
  resolveLocalSourceWriteSecret,
  sourceWriteEnvAssignment,
} from '../../../tools/dev/local-source-write-secret.mjs'

describe('local source-write secret provisioning', () => {
  it('red-covers the cold local answer setup by deriving one secret for app and Convex', () => {
    const result = resolveLocalSourceWriteSecret({
      env: {
        VITE_CONVEX_URL: 'http://127.0.0.1:3210',
        VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E: 'true',
      },
      dotenvFiles: [
        { path: '.env.local', content: 'VITE_CONVEX_URL=http://127.0.0.1:3210\n' },
        { path: '.env.development.local', content: '' },
      ],
      randomBytes: () => new Uint8Array([1, 2, 3, 4]),
    })

    expect(result.secret).toBe('01020304')
    expect(result.source).toBe('generated')
    expect(result.persistPath).toBe('.env.development.local')
    expect(sourceWriteEnvAssignment(result.secret)).toBe(`AE_SOURCE_WRITE_SECRET=01020304\n`)
  })

  it('reuses the existing local secret instead of rotating app and Convex independently', () => {
    const result = resolveLocalSourceWriteSecret({
      env: { VITE_CONVEX_URL: 'http://127.0.0.1:3210' },
      dotenvFiles: [
        { path: '.env.development.local', content: 'AE_SOURCE_WRITE_SECRET=shared-local-secret\n' },
      ],
      randomBytes: () => new Uint8Array([9]),
    })

    expect(result).toMatchObject({ secret: 'shared-local-secret', source: 'existing' })
  })

  it('refuses to auto-configure a production process', () => {
    expect(() => resolveLocalSourceWriteSecret({
      env: { NODE_ENV: 'production', VITE_CONVEX_URL: 'https://example.convex.cloud' },
      dotenvFiles: [],
      randomBytes: () => new Uint8Array([1]),
    })).toThrow('local_source_write_production_forbidden')
  })
})
