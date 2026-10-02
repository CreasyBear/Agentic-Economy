/* Arc contact-section channels source SHA-256: 1988bfb2fbe073c9e553c87dc18f19c09b80fb88488b875460b615329335d0e2. */
import { useId, useRef, useState, type KeyboardEvent } from 'react'
import { LayoutGroup, motion, useReducedMotion } from 'motion/react'
import { ActivityIcon, ArrowUpRightIcon, CableIcon, CodeIcon, MailIcon } from 'lucide-react'

import { AePublicPage } from '@/components/ae/layout/AePublicPage'
import { AeSiteFaq } from '@/components/ae/website/AeSiteFaq'
import buttonStyles from '@/components/arc/button/button.module.css'
import { motionTokens } from '@/components/arc/lib/motion-tokens'

import { AgentConnectionSection } from './components/AgentConnectionSection'
import { PrivateSupportSection } from './components/PrivateSupportSection'
import { ReferencedCallBanner } from './components/ReferencedCallBanner'
import { SupportStatusSection } from './components/SupportStatusSection'
import {
  ISSUE_URL,
  SUPPORT_FAQ_HEADING,
  SUPPORT_FAQ_ITEMS,
  type AeSupportHelpPageProps,
} from './help.contracts'
import { useSupportHelpPage } from './useSupportHelpPage'
import './SupportComposition.css'

type HelpTopic = 'status' | 'connection' | 'private' | 'developer'

export function AeSupportHelpPage({ canonicalBaseUrl, callRef }: AeSupportHelpPageProps) {
  const { supportEmailHref, diagnosticCommand } = useSupportHelpPage({ canonicalBaseUrl, callRef })
  const referencedCallRef = callRef.kind === 'valid' ? callRef.value : undefined
  const id = useId()
  const [topic, setTopic] = useState<HelpTopic>('status')
  const tabs = useRef<Array<HTMLButtonElement | null>>([])
  const reduced = useReducedMotion()
  const channels = [
    { value: 'status', label: 'Current status', meta: 'Calls, setup and credit', icon: <ActivityIcon aria-hidden="true" />, detail: <SupportStatusSection callRef={callRef} /> },
    { value: 'connection', label: 'Agent connection', meta: 'Setup and diagnostics', icon: <CableIcon aria-hidden="true" />, detail: <AgentConnectionSection diagnosticCommand={diagnosticCommand} /> },
    { value: 'private', label: 'Private support', meta: 'Account, billing and security', icon: <MailIcon aria-hidden="true" />, detail: <PrivateSupportSection /> },
    {
      value: 'developer', label: 'Developer issue', meta: 'Public, non-sensitive reports', icon: <CodeIcon aria-hidden="true" />,
      detail: (
        <section className="arc-market arc-support-section">
          <h2>Public developer reports</h2>
          <p>GitHub issues are public. Use them only for non-sensitive developer reports.</p>
          <div className="arc-support-actions">
            <a href={ISSUE_URL} target="_blank" rel="noreferrer" className={`${buttonStyles.button} ${buttonStyles.secondary} ${buttonStyles.md}`}>
              Open a public developer issue (opens in a new tab) <ArrowUpRightIcon aria-hidden="true" />
            </a>
          </div>
        </section>
      ),
    },
  ] as const
  const activeIndex = channels.findIndex(channel => channel.value === topic)
  const active = channels[activeIndex] ?? channels[0]

  function onTopicKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const delta = event.key === 'ArrowDown' || event.key === 'ArrowRight' ? 1 : event.key === 'ArrowUp' || event.key === 'ArrowLeft' ? -1 : 0
    const edge = event.key === 'Home' ? 0 : event.key === 'End' ? channels.length - 1 : -1
    if (delta === 0 && edge < 0) return
    event.preventDefault()
    const nextIndex = edge >= 0 ? edge : (activeIndex + delta + channels.length) % channels.length
    const next = channels[nextIndex]
    if (next === undefined) return
    setTopic(next.value)
    tabs.current[nextIndex]?.focus()
  }

  return (
    <AePublicPage
      kind="document"
      eyebrow="Support"
      title="Help"
      description="Keep the Call reference shown with the problem. It helps us find the right record without asking you to share private inputs."
      actions={
        <a href={supportEmailHref} className={`${buttonStyles.button} ${buttonStyles.primary} ${buttonStyles.md}`}>
          Email support (opens email app)
        </a>
      }
    >
      <div className="arc-market arc-support ae-rail">
        {referencedCallRef === undefined ? null : <ReferencedCallBanner callRef={referencedCallRef} />}
        <p className="arc-support-privacy">Do not include credentials, raw inputs or private results.</p>
        <div className="arc-support-channels">
          <LayoutGroup id={id}>
            <div className="arc-support-channel-list" role="tablist" aria-orientation="vertical" aria-label="Help topics" onKeyDown={onTopicKeyDown}>
              {channels.map((channel, index) => (
                <button
                  key={channel.value}
                  ref={node => { tabs.current[index] = node }}
                  type="button"
                  role="tab"
                  id={`${id}-tab-${channel.value}`}
                  aria-selected={channel.value === active.value}
                  aria-controls={`${id}-panel`}
                  tabIndex={channel.value === active.value ? 0 : -1}
                  className="arc-support-channel"
                  onClick={() => setTopic(channel.value)}
                >
                  {channel.value === active.value ? <motion.span layoutId="support-channel" className="arc-support-channel-highlight" transition={reduced ? { duration: 0 } : motionTokens.spring.morph} aria-hidden="true" /> : null}
                  <span className="arc-support-channel-icon">{channel.icon}</span>
                  <span className="arc-support-channel-text"><span>{channel.label}</span><span>{channel.meta}</span></span>
                </button>
              ))}
            </div>
          </LayoutGroup>
          <div key={active.value} id={`${id}-panel`} role="tabpanel" aria-labelledby={`${id}-tab-${active.value}`} tabIndex={0} className="arc-support-channel-panel">
            {active.detail}
          </div>
        </div>
      </div>
      <AeSiteFaq
        labelledBy="support-faq-heading"
        questions={SUPPORT_FAQ_ITEMS}
        title={SUPPORT_FAQ_HEADING}
      />
    </AePublicPage>
  )
}
