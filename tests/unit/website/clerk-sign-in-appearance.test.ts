import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

import {
  clerkAppearance,
  clerkAuthSurfaceAppearance,
  clerkSignInSurfaceAppearance,
} from '@/components/ae/website/clerk-appearance'

const projectRoot = resolve(import.meta.dirname, '../../..')

describe('Clerk sign-in appearance', () => {
  it('places Clerk before component and utility overrides in the cascade', () => {
    const globalStyles = readFileSync(resolve(projectRoot, 'src/styles/globals.css'), 'utf8')

    expect(clerkAppearance.cssLayerName).toBe('clerk')
    expect(globalStyles).toContain('@layer reset, theme, base, clerk, components, utilities;')
  })

  it('keeps the sign-in account switch readable without exposing the sign-up footer', () => {
    expect(clerkAuthSurfaceAppearance.elements.footer).toBe('hidden')
    expect(clerkSignInSurfaceAppearance.elements).toMatchObject({
      footer: expect.stringMatching(/\bbg-none\b.*\bbg-transparent\b/u),
      footerActionText: 'text-muted-foreground',
      footerActionLink: expect.stringContaining('text-foreground'),
    })

    const signInRoute = readFileSync(resolve(projectRoot, 'src/routes/sign-in.$.tsx'), 'utf8')
    expect(signInRoute).toContain('appearance={clerkSignInSurfaceAppearance}')
    expect(signInRoute).not.toContain('appearance={clerkAuthSurfaceAppearance}')
  })
})
