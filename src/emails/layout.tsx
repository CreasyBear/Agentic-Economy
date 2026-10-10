import { Body, Button, Container, Head, Hr, Html, Img, Link, Preview, Section, Text } from '@react-email/components'
import type { CSSProperties, ReactNode } from 'react'

import { EMAIL_COLORS, EMAIL_FONT, EMAIL_LEGAL_LINES, EMAIL_LOGO_PATH, EMAIL_SENDER_NAME, EMAIL_TAGLINE, SETTINGS_PATH } from './brand'
import { emailUrl } from './links'

/** Dark palette swaps Chalk and Charcoal. Classes carry !important so they beat the inline light styles where clients honour the block. */
const DARK_CSS = `
:root { color-scheme: light dark; }
@media (prefers-color-scheme: dark) {
  .ae-bg { background-color: ${EMAIL_COLORS.charcoal} !important; }
  .ae-text { color: ${EMAIL_COLORS.chalk} !important; }
  .ae-muted { color: rgba(232,228,218,0.72) !important; }
  .ae-link { color: ${EMAIL_COLORS.chalk} !important; }
  .ae-btn { border: 1px solid ${EMAIL_COLORS.chalk} !important; }
}`

export const bodyText: CSSProperties = { color: EMAIL_COLORS.charcoal, fontFamily: EMAIL_FONT, fontSize: 16, lineHeight: '24px', margin: '0 0 16px' }
const mutedText: CSSProperties = { color: EMAIL_COLORS.charcoal, fontFamily: EMAIL_FONT, fontSize: 13, lineHeight: '20px', margin: '0 0 8px', opacity: 0.72 }

export function CtaButton({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Section style={{ margin: '24px 0' }}>
      <Button
        href={href}
        className="ae-btn"
        style={{
          backgroundColor: EMAIL_COLORS.forest,
          border: `1px solid ${EMAIL_COLORS.forest}`,
          borderRadius: 6,
          color: EMAIL_COLORS.white,
          display: 'inline-block',
          fontFamily: EMAIL_FONT,
          fontSize: 15,
          fontWeight: 500,
          padding: '12px 20px',
          textDecoration: 'none',
        }}
      >
        {children}
      </Button>
    </Section>
  )
}

/** Shared frame: preheader, symbol, content slot, and a footer that says why the mail arrived. */
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
  const footerLink = unsubscribeUrl !== undefined
    ? { label: 'Stop these emails', href: unsubscribeUrl }
    : showSettings
      ? { label: 'Notification settings', href: emailUrl(siteUrl, SETTINGS_PATH, { campaign, content: 'settings' }) }
      : null
  return (
    <Html lang="en-AU">
      <Head>
        <meta name="color-scheme" content="light dark" />
        <meta name="supported-color-schemes" content="light dark" />
        <style dangerouslySetInnerHTML={{ __html: DARK_CSS }} />
      </Head>
      <Preview>{preview}</Preview>
      <Body className="ae-bg" style={{ backgroundColor: EMAIL_COLORS.chalk, margin: 0, padding: '32px 16px' }}>
        <Container style={{ margin: '0 auto', maxWidth: 560 }}>
          <Section>
            {/* Chalk tile keeps the Forest mark legible in dark clients; the tile carries no ae-bg class so it never swaps. */}
            <Container style={{ backgroundColor: EMAIL_COLORS.chalk, borderRadius: 8, display: 'inline-block', padding: 8, width: 'auto' }}>
              <Img
                src={new URL(EMAIL_LOGO_PATH, siteUrl).toString()}
                width={40}
                alt={EMAIL_SENDER_NAME}
                data-skip-in-text
                style={{ display: 'block', height: 'auto', maxWidth: '100%' }}
              />
            </Container>
          </Section>
          <Section style={{ marginTop: 24 }}>{children}</Section>
          <Hr data-skip-in-text style={{ borderColor: EMAIL_COLORS.charcoal, margin: '32px 0 16px', opacity: 0.16 }} />
          <Text className="ae-muted" style={mutedText}>{reason}</Text>
          {footerLink === null ? null : (
            <Text className="ae-muted" style={mutedText}>
              <Link className="ae-link" href={footerLink.href} style={{ color: EMAIL_COLORS.forest }}>{footerLink.label}</Link>
            </Text>
          )}
          {EMAIL_LEGAL_LINES.map((line) => <Text key={line} className="ae-muted" style={mutedText}>{line}</Text>)}
          <Text className="ae-muted" style={mutedText}>{EMAIL_SENDER_NAME}. {EMAIL_TAGLINE}.</Text>
        </Container>
      </Body>
    </Html>
  )
}
