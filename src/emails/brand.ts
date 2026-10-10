/** Brand tokens for transactional email, from docs/designs/email-marketing-plan.md (brand brief). Inline styles only. */
export const EMAIL_COLORS = {
  chalk: '#E8E4DA',
  charcoal: '#141414',
  forest: '#24543D',
  white: '#FFFFFF',
} as const

export const EMAIL_FONT = 'Manrope, Arial, Helvetica, sans-serif'

/** Forest symbol, 400px PNG, shown on a Chalk tile in layout.tsx so it stays legible in dark mode. Resolved against the site origin at render time. */
export const EMAIL_LOGO_PATH = '/brand/email/aecon-symbol-forest-400.png'

export const EMAIL_SENDER_NAME = 'aecon.ai'
export const EMAIL_TAGLINE = 'A world taking shape'

/** Entity, ABN and postal address. Empty until Joel approves them (design open decision 4; blocks Task 10). The footer contact line is deferred with this block, not rendered yet. */
export const EMAIL_LEGAL_LINES: readonly string[] = []

export const SETTINGS_PATH = '/owner/settings/notifications'
