/**
 * Site kit owns chrome. Clerk keeps the auth flow.
 * https://clerk.com/docs/tanstack-react-start/guides/customizing-clerk/appearance-prop/overview
 *
 * Global appearance stays opaque so UserProfile and the chat SignIn modal keep a
 * surface. Auth pages layer `clerkAuthSurfaceAppearance` to drop Clerk's card.
 */

const aeInk = 'oklch(0.215 0.004 106)'
const aeWhite = 'oklch(1 0 0)'

export const clerkAppearance = {
  variables: {
    fontFamily: 'var(--font-sans, ui-sans-serif, system-ui, sans-serif)',
    fontSize: '0.875rem',
    spacing: '0.875rem',
    borderRadius: '0px',
    colorPrimary: aeInk,
    colorBackground: aeWhite,
    colorText: aeInk,
    colorInputBackground: aeWhite,
    colorInputText: aeInk,
  },
  layout: {
    logoPlacement: 'none' as const,
    socialButtonsPlacement: 'bottom' as const,
    socialButtonsVariant: 'blockButton' as const,
  },
  elements: {
    socialButtonsBlockButton: 'min-h-11 rounded-none border-border bg-container',
    formButtonPrimary:
      'min-h-11 rounded-none bg-foreground text-background shadow-none hover:bg-foreground/90',
    formFieldInput: 'min-h-11 rounded-none border-border bg-container',
    formFieldInputShowPasswordButton: 'min-h-11 min-w-11',
    identityPreviewEditButton: '!min-h-11 !min-w-11',
    formFieldRow__password: 'aria-hidden:!hidden',
    headerTitle: 'font-display text-xl font-medium tracking-tight',
    headerSubtitle: 'text-muted-foreground',
    footerActionLink: 'text-foreground underline-offset-4 hover:underline',
    logoBox: 'hidden',
    logoImage: 'hidden',
  },
  options: {
    unsafe_disableDevelopmentModeWarnings: true,
  },
}

/** Layered on SignIn / SignUp so the site panel is the card. */
export const clerkAuthSurfaceAppearance = {
  variables: {
    colorBackground: 'transparent',
  },
  elements: {
    rootBox: 'w-full',
    cardBox: 'w-full shadow-none',
    card: 'w-full border-0 bg-transparent p-0 shadow-none',
    header: 'hidden',
    footer: 'hidden',
    logoBox: 'hidden',
    logoImage: 'hidden',
  },
}
