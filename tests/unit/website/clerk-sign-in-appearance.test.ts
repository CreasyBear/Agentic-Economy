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
    expect(signInRoute).toContain('appearance: clerkSignInSurfaceAppearance')
    expect(signInRoute).not.toContain('clerkAuthSurfaceAppearance')
  })

  it('maps Clerk variables to AE semantic CSS custom properties', () => {
    const variables = clerkAppearance.variables
    expect(variables).toMatchObject({
      colorPrimary: 'var(--foreground)',
      colorBackground: 'var(--container)',
      colorText: 'var(--foreground)',
      colorInputBackground: 'var(--container)',
      colorInputText: 'var(--foreground)',
      colorNeutral: 'var(--muted-foreground)',
      colorDanger: 'var(--destructive)',
    })
    expect(JSON.stringify(variables)).not.toMatch(/oklch\(/u)
  })

  it('applies tactile press physics and inset focus rings on auth controls', () => {
    const { formButtonPrimary, socialButtonsBlockButton, formFieldInput } = clerkAppearance.elements

    expect(formButtonPrimary).toContain('enabled:active:scale-[0.98]')
    expect(formButtonPrimary).toContain('transition-transform')
    expect(formButtonPrimary).not.toContain('transition-all')

    expect(socialButtonsBlockButton).toContain('enabled:active:scale-[0.98]')
    expect(socialButtonsBlockButton).toContain('transition-transform')

    expect(formFieldInput).toContain('focus-visible:ring-inset')
    expect(formFieldInput).toContain('text-base')
    expect(formFieldInput).toContain('aria-invalid:ring-destructive')
  })

  it('reserves sign-in card height and styles actionable errors', () => {
    expect(clerkSignInSurfaceAppearance.elements.cardBox).toContain('min-h-96')
    expect(clerkAuthSurfaceAppearance.elements.cardBox).toContain('min-h-96')

    expect(clerkAppearance.elements.formFieldErrorText).toBe('text-sm text-destructive')
    expect(clerkAppearance.elements.alert).toContain('border-destructive')
    expect(clerkAppearance.elements.badge).toContain('bg-brand-muted')
  })
})
