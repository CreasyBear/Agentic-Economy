import { createEmailTailwindConfig, type EmailTheme } from './vendor/emailcn/email-theme'
import { EMAIL_COLORS, EMAIL_FONT } from './brand'

/** Light palette: the website's :root block (agentic-economy-website src/styles.css:72-92). See docs/designs/email-design-system.md 2.1. */
const light = EMAIL_COLORS.light

/** Website tokens as one emailcn theme. Light is the inline base; dark overrides live in EMAIL_COLORS.dark and the layout media query. */
export const aeconTheme: EmailTheme = {
  borderRadius: '10px',
  borderRadiusLg: '10px',
  button: {
    primary: {
      backgroundColor: light.buttonFill,
      borderRadius: '10px',
      color: light.buttonText,
      fontSize: '16px',
      fontWeight: '500',
      paddingX: '24px',
      paddingY: '10px',
    },
    secondary: {
      backgroundColor: 'transparent',
      border: `1px solid ${light.border}`,
      borderRadius: '10px',
      color: light.text,
      fontSize: '16px',
      fontWeight: '500',
      paddingX: '24px',
      paddingY: '10px',
    },
  },
  colorBackground: light.page,
  colorBackgroundMuted: light.card,
  colorBackgroundSubtle: light.card,
  colorBorder: light.border,
  colorBorderSubtle: light.border,
  colorDanger: light.danger,
  colorPrimary: light.buttonFill,
  colorPrimaryForeground: light.buttonText,
  colorPrimaryHover: light.buttonFill,
  colorSuccess: EMAIL_COLORS.forest,
  colorText: light.text,
  colorTextMuted: light.muted,
  colorTextSubtle: light.muted,
  colorWarning: light.danger,
  containerWidth: '560px',
  fontFamily: EMAIL_FONT,
  fontFamilyMono: '"Menlo", "Monaco", "Courier New", monospace',
  fontSizeBase: '16px',
  fontSizeHeading: '22px',
  fontSizeLg: '16px',
  fontSizeSm: '13px',
  fontSizeXl: '22px',
  fontWeightBold: '500',
  fontWeightMedium: '500',
  fontWeightNormal: '400',
  lineHeightBase: '1.5',
  spacingBase: '24px',
  spacingLg: '32px',
  spacingXl: '48px',
}

export const aeconTailwindConfig = createEmailTailwindConfig(aeconTheme)
