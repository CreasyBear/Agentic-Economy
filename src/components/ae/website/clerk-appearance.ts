/**
 * Site kit owns chrome. Clerk keeps the auth flow.
 * https://clerk.com/docs/tanstack-react-start/guides/customizing-clerk/appearance-prop/overview
 *
 * Global appearance stays opaque so UserProfile and the chat SignIn modal keep a
 * surface. Auth pages layer `clerkAuthSurfaceAppearance` to drop Clerk's card.
 */

const clerkSemanticVariables = {
  colorPrimary: 'var(--foreground)',
  colorBackground: 'var(--container)',
  colorText: 'var(--foreground)',
  colorInputBackground: 'var(--container)',
  colorInputText: 'var(--foreground)',
  colorNeutral: 'var(--muted-foreground)',
  colorDanger: 'var(--destructive)',
}

const clerkPrimaryButtonClasses =
  'min-h-touch rounded-none bg-foreground text-background shadow-none hover:bg-foreground/90 enabled:active:scale-[0.98] transition-transform duration-100 ease-out motion-reduce:transition-none motion-reduce:active:scale-100'

const clerkSocialButtonClasses =
  'min-h-touch rounded-none border-border bg-container hover:bg-muted enabled:active:scale-[0.98] transition-transform duration-100 ease-out motion-reduce:transition-none motion-reduce:active:scale-100'

const clerkFormFieldInputClasses =
  'min-h-touch rounded-none border-border bg-container text-base md:text-sm outline-none transition-[border-color,box-shadow] duration-fast ease-standard focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring aria-invalid:border-destructive aria-invalid:ring-2 aria-invalid:ring-inset aria-invalid:ring-destructive'

const clerkCardBoxClasses =
  'min-h-96 w-full shadow-none transition-[min-height,opacity] duration-base ease-standard motion-reduce:transition-none'

const clerkFooterLinkClasses =
  'text-foreground underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring'

const clerkAuthInteractiveElements = {
  socialButtonsBlockButton: clerkSocialButtonClasses,
  formButtonPrimary: clerkPrimaryButtonClasses,
  formFieldInput: clerkFormFieldInputClasses,
  formFieldInputShowPasswordButton: 'min-h-touch min-w-touch',
  identityPreviewEditButton: '!min-h-touch !min-w-touch',
  formFieldRow__password: 'aria-hidden:!hidden',
  formFieldErrorText: 'text-sm text-destructive',
  alertText: 'text-sm text-destructive',
  alert: 'border border-destructive bg-destructive/10 text-destructive',
  badge: 'bg-brand-muted text-info-foreground text-xs font-medium',
  headerTitle: 'font-sans text-xl font-semibold tracking-tight',
  headerSubtitle: 'text-muted-foreground',
  footerActionLink: clerkFooterLinkClasses,
  logoBox: 'hidden',
  logoImage: 'hidden',
}

export const clerkAppearance = {
  cssLayerName: 'clerk',
  variables: {
    fontFamily: 'var(--font-sans, ui-sans-serif, system-ui, sans-serif)',
    fontSize: '0.875rem',
    spacing: '0.875rem',
    borderRadius: '0px',
    ...clerkSemanticVariables,
  },
  layout: {
    logoPlacement: 'none' as const,
    socialButtonsPlacement: 'bottom' as const,
    socialButtonsVariant: 'blockButton' as const,
  },
  elements: clerkAuthInteractiveElements,
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
    cardBox: clerkCardBoxClasses,
    card: 'w-full border-0 bg-transparent p-0 shadow-none',
    header: 'hidden',
    footer: 'hidden',
    ...clerkAuthInteractiveElements,
  },
}

/** Sign-in keeps Clerk's single account-switch action on the site panel. */
export const clerkSignInSurfaceAppearance = {
  variables: {
    colorBackground: 'transparent',
  },
  elements: {
    rootBox: 'w-full',
    cardBox: clerkCardBoxClasses,
    card: 'w-full border-0 bg-transparent p-0 shadow-none',
    header: 'hidden',
    footer: 'border-0 bg-none bg-transparent text-foreground',
    footerAction: 'bg-transparent',
    footerActionText: 'text-muted-foreground',
    ...clerkAuthInteractiveElements,
  },
}
