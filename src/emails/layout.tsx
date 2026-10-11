import { Body, Column, Container, Head, Html, Img, Link, Preview, Row, Section, Text } from '@react-email/components'
import type { CSSProperties, ReactNode } from 'react'

import { EMAIL_COLORS, EMAIL_FONT, EMAIL_LEGAL_LINES, EMAIL_SENDER_NAME, EMAIL_SUPPORT_ADDRESS, SETTINGS_PATH } from './brand'
import { emailUrl } from './links'
import { HeaderWithLogoSection } from './vendor/emailcn/header-with-logo'

const { light, dark } = EMAIL_COLORS
const ABN = '98 700 838 115'
const ABN_LOOKUP_URL = 'https://abr.business.gov.au/ABN/View?abn=98700838115'
const FOOTER_LOGO_PATH = '/brand/email/aecon-symbol-chalk-gold-400.png'
const FOREST_LOGO_PATH = '/brand/email/aecon-symbol-forest-400.png'

/** Light is the inline base. Classes carry !important so dark clients that honour the media query flip the palette; the header band and footer band are fixed and never swap. */
const DARK_CSS = `
:root { color-scheme: light dark; supported-color-schemes: light dark; }
@media (prefers-color-scheme: dark) {
  .ae-bg { background-color: ${dark.page} !important; }
  .ae-text { color: ${dark.text} !important; }
  .ae-muted { color: ${dark.muted} !important; }
  .ae-link { color: ${dark.text} !important; }
  .ae-btn { background-color: ${dark.buttonFill} !important; color: ${dark.buttonText} !important; }
}
@media only screen and (max-width: 599px) {
  .ae-pad { padding-left: 16px !important; padding-right: 16px !important; }
}`

export const bodyText: CSSProperties = { color: light.text, fontFamily: EMAIL_FONT, fontSize: 16, lineHeight: '24px', margin: '0 0 16px' }
const reasonText: CSSProperties = { color: light.muted, fontFamily: EMAIL_FONT, fontSize: 13, lineHeight: '20px', margin: '16px 0 0' }
const footerText: CSSProperties = { color: EMAIL_COLORS.onForestMuted, fontFamily: EMAIL_FONT, fontSize: 13, lineHeight: '20px', margin: '0 0 8px' }
const footerLink: CSSProperties = { color: EMAIL_COLORS.onForest, textDecoration: 'underline' }

/** The one button. Structure from emailcn `button` (primary): Section (a table) holding a padded Link, restyled to the website pair, charcoal fill with chalk text, flipped in dark. Source: https://www.emailcn.run/r/react-email/ button.tsx, not vendored, whose export is a full-document wrapper and cannot nest. Table based: Section, Row, Column carry the fill and radius, and the Link pads inside the cell so Outlook keeps the shape. */
export function CtaButton({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Section style={{ margin: '24px 0', textAlign: 'left' }}>
      <Row>
        <Column className="ae-btn" align="left" style={{ backgroundColor: light.buttonFill, borderRadius: 10 }}>
          <Link
            className="ae-btn"
            href={href}
            style={{
              color: light.buttonText,
              display: 'inline-block',
              fontFamily: EMAIL_FONT,
              fontSize: 16,
              fontWeight: 500,
              lineHeight: '24px',
              padding: '10px 24px',
              textAlign: 'center',
              textDecoration: 'none',
            }}
          >
            {children}
          </Link>
        </Column>
      </Row>
    </Section>
  )
}

/** Forest band footer. Structure copied from emailcn `utility-footer` (legal variant: Section, Row, Column, divider rule, link row), restyled to the website footer (forest band, chalk text, chalk and gold symbol). The vendored file exports only a full-document wrapper. */
function Footer({ siteUrl, campaign, unsubscribeUrl, showSettings }: { siteUrl: string; campaign: string; unsubscribeUrl: string | undefined; showSettings: boolean }) {
  const links: { label: string; href: string }[] = []
  if (showSettings) links.push({ label: 'Notification settings', href: emailUrl(siteUrl, SETTINGS_PATH, { campaign, content: 'settings' }) })
  links.push({ label: 'Privacy', href: emailUrl(siteUrl, '/privacy', { campaign, content: 'privacy' }) })
  if (unsubscribeUrl !== undefined) links.push({ label: 'Unsubscribe', href: unsubscribeUrl })
  return (
    <Section style={{ backgroundColor: EMAIL_COLORS.forest, padding: '32px 24px' }} className="ae-pad">
      <Img src={new URL(FOOTER_LOGO_PATH, siteUrl).toString()} width={32} alt="" data-skip-in-text style={{ display: 'block', height: 'auto', marginBottom: 16 }} />
      <Section data-skip-in-text style={{ backgroundColor: EMAIL_COLORS.onForestDivider, height: 1, lineHeight: '1px', margin: '0 0 16px' }}>&zwj;</Section>
      {EMAIL_LEGAL_LINES.filter((line) => line !== EMAIL_SUPPORT_ADDRESS).map((line) => {
        const at = line.indexOf(ABN)
        return (
          <Text key={line} style={footerText}>
            {at < 0 ? line : (
              <>
                {line.slice(0, at)}
                <Link href={ABN_LOOKUP_URL} style={footerLink}>{ABN}</Link>
                {line.slice(at + ABN.length)}
              </>
            )}
          </Text>
        )
      })}
      <Text style={footerText}>
        Support: <Link href={`mailto:${EMAIL_SUPPORT_ADDRESS}`} style={footerLink}>{EMAIL_SUPPORT_ADDRESS}</Link>
      </Text>
      <Text style={footerText}>
        {links.map((link, i) => (
          <span key={link.label}>
            {i > 0 ? ' | ' : null}
            <Link href={link.href} style={footerLink}>{link.label}</Link>
          </span>
        ))}
      </Text>
    </Section>
  )
}

/** The one skeleton (design doc 2.3): preheader, header, content slot (heading, lead, body, one CTA), then the reason line, then the forest footer band carrying legal identity, support, privacy and the unsubscribe slot. */
export function Layout({ preview, siteUrl, campaign, reason, unsubscribeUrl, showSettings = true, children }: {
  preview: string
  siteUrl: string
  campaign: string
  reason: string
  /** Set on alert and lifecycle mail. Required mail has no unsubscribe, only the settings link. */
  unsubscribeUrl?: string
  showSettings?: boolean
  children: ReactNode
}) {
  return (
    <Html lang="en-AU">
      <Head>
        <meta name="color-scheme" content="light dark" />
        <meta name="supported-color-schemes" content="light dark" />
        <style dangerouslySetInnerHTML={{ __html: DARK_CSS }} />
      </Head>
      <Preview>{preview}</Preview>
      <Body className="ae-bg" style={{ backgroundColor: light.page, fontFamily: EMAIL_FONT, margin: 0 }}>
        <Container style={{ margin: '0 auto', maxWidth: 560 }}>
          <HeaderWithLogoSection
            logoSrc={new URL(FOREST_LOGO_PATH, siteUrl).toString()}
            logoAlt={EMAIL_SENDER_NAME}
            logoHref={siteUrl}
            text={EMAIL_SENDER_NAME}
            variant="with-text"
            alignment="left"
            backgroundColor={EMAIL_COLORS.chalk}
            pageBackgroundColor="transparent"
            textColor={EMAIL_COLORS.charcoal}
          />
          <Section className="ae-pad" style={{ padding: '8px 24px 24px' }}>
            {children}
            <Text className="ae-muted" style={reasonText}>{reason}</Text>
          </Section>
          <Footer siteUrl={siteUrl} campaign={campaign} unsubscribeUrl={unsubscribeUrl} showSettings={showSettings} />
        </Container>
      </Body>
    </Html>
  )
}
