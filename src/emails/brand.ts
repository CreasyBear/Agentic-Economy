/** Brand tokens read from the website (agentic-economy-website src/styles.css, footer.module.css), see docs/designs/email-design-system.md 2.1. Inline styles only. */
export const EMAIL_COLORS = {
  chalk: '#E8E4DA',
  charcoal: '#141414',
  forest: '#24543D',
  white: '#FFFFFF',
  /** Footer band text on forest: chalk, muted chalk, divider (sRGB pre-mix, approximate). */
  onForest: '#E8E4DA',
  onForestMuted: '#C1C7BB',
  onForestDivider: '#4F745F',
  light: {
    page: '#E8E4DA',
    text: '#141414',
    card: '#F2EFE7',
    muted: '#595854',
    border: '#C5C1B8',
    buttonFill: '#141414',
    buttonText: '#E8E4DA',
    danger: '#941D14',
  },
  dark: {
    page: '#141414',
    text: '#E8E4DA',
    card: '#1E1E1E',
    muted: '#B5B3AE',
    border: '#404040',
    buttonFill: '#E8E4DA',
    buttonText: '#141414',
    danger: '#FF9185',
  },
} as const

export const EMAIL_FONT = "Manrope, -apple-system, 'Segoe UI', Arial, Helvetica, sans-serif"

/** Forest symbol, 400px PNG, shown on a Chalk tile in layout.tsx so it stays legible in dark mode. Resolved against the site origin at render time. */
export const EMAIL_LOGO_PATH = '/brand/email/aecon-symbol-forest-400.png'

export const EMAIL_SENDER_NAME = 'aecon'
export const EMAIL_TAGLINE = 'A world taking shape'

export const EMAIL_SUPPORT_ADDRESS = 'support@aecon.ai'

/** Supplier identity (design decision D2). No street address is published, so none exists here and none is to be invented. */
export const EMAIL_LEGAL_LINES: readonly string[] = [
  'Agentic Economy Technologies Pty Ltd, ABN 98 700 838 115, trading as Agentic Economy. Western Australia.',
  EMAIL_SUPPORT_ADDRESS,
]

export const SETTINGS_PATH = '/owner/settings/notifications'
