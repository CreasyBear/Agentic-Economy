import { Body, Container, Head, Html, Img, Link, Preview, Section, Text } from '@react-email/components'
import type { CSSProperties, ReactNode } from 'react'

import { EMAIL_COLORS, EMAIL_FONT, EMAIL_LEGAL_LINES, EMAIL_SENDER_NAME, EMAIL_SUPPORT_ADDRESS, EMAIL_TAGLINE, SETTINGS_PATH } from './brand'
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
const mutedText: CSSProperties = { color: light.muted, fontFamily: EMAIL_FONT, fontSize: 13, lineHeight: '20px', margin: '0 0 8px' }
const footerText: CSSProperties = { color: EMAIL_COLORS.onForestMuted, fontFamily: EMAIL_FONT, fontSize: 13, lineHeight: '20px', margin: '0 0 8px' }
const footerLink: CSSProperties = { color: EMAIL_COLORS.onForest, textDecoration: 'underline' }

/** The one button. Structure copied from emailcn `button` (primary, Section plus Link, padded inline-block), restyled to the website pair: charcoal fill and chalk text, flipped in dark. The vendored file exports only a full-document wrapper, so it cannot nest. */
export function CtaButton({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Section style={{ margin: '24px 0', textAlign: 'left' }}>
      <Link
        className="ae-btn"
        href={href}
        style={{
          backgroundColor: light.buttonFill,
          borderRadius: 10,
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
    </Section>
  )
}

/** Forest band footer. Structure copied from emailcn `utility-footer` (legal variant: Section, Row, Column, divider rule, link row), restyled to the website footer (forest band, chalk text, chalk and gold symbol). The vendored file exports only a full-document wrapper. */
function Footer({ siteUrl, campaign, reason, unsubscribeUrl, showSettings }: { siteUrl: string; campaign: string; reason: string; unsubscribeUrl: string | undefined; showSettings: boolean }) {
  const links: { label: string; href: string }[] = []
  if (showSettings) links.push({ label: 'Notification settings', href: emailUrl(siteUrl, SETTINGS_PATH, { campaign, content: 'settings' }) })
  links.push({ label: 'Privacy', href: emailUrl(siteUrl, '/privacy', { campaign, content: 'privacy' }) })
  if (unsubscribeUrl !== undefined) links.push({ label: 'Unsubscribe', href: unsubscribeUrl })
  return (
    <Section style={{ backgroundColor: EMAIL_COLORS.forest, padding: '32px 24px' }} className="ae-pad">
      <Img src={new URL(FOOTER_LOGO_PATH, siteUrl).toString()} width={32} alt="" data-skip-in-text style={{ display: 'block', height: 'auto', marginBottom: 16 }} />
      <Text style={{ ...footerText, color: EMAIL_COLORS.onForest, fontSize: 14 }}>{reason}</Text>
      <Section data-skip-in-text style={{ backgroundColor: EMAIL_COLORS.onForestDivider, height: 1, lineHeight: '1px', margin: '16px 0' }}>&zwj;</Section>
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
      <Text style={{ ...footerText, margin: '16px 0 0' }}>{EMAIL_SENDER_NAME}. {EMAIL_TAGLINE}.</Text>
    </Section>
  )
}

/** The one skeleton (design doc 2.3): preheader, header, content slot (heading, lead, body, one CTA), then the forest footer band carrying reason, legal identity, support, privacy and the unsubscribe slot. */
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
            backgroundColor={light.page}
            pageBackgroundColor="transparent"
            textColor={light.text}
          />
          <Section className="ae-pad" style={{ padding: '8px 24px 24px' }}>{children}</Section>
          <Footer siteUrl={siteUrl} campaign={campaign} reason={reason} unsubscribeUrl={unsubscribeUrl} showSettings={showSettings} />
        </Container>
      </Body>
    </Html>
  )
}
