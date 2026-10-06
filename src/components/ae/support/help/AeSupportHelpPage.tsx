import { useId, useState, type KeyboardEvent } from 'react'
import { ActivityIcon, ArrowUpRightIcon, CableIcon, CodeIcon, MailIcon } from 'lucide-react'

import { AePublicPage } from '@/components/ae/layout/AePublicPage'
import { AeSiteFaq } from '@/components/ae/website/AeSiteFaq'
import buttonStyles from '@/components/arc/button/button.module.css'
import { Tabs, TabsList, TabsTrigger } from '@/components/arc/tabs/tabs'

import { AgentConnectionSection } from './components/AgentConnectionSection'
import { PrivateSupportSection } from './components/PrivateSupportSection'
import { ReferencedCallBanner } from './components/ReferencedCallBanner'
import { SupportStatusSection } from './components/SupportStatusSection'
import {
  ISSUE_URL,
  SUPPORT_FAQ_HEADING,
  SUPPORT_FAQ_ITEMS,
  type AeSupportHelpPageProps,
  type SupportHelpTopic,
} from './help.contracts'
import { useSupportHelpPage } from './useSupportHelpPage'
import './SupportComposition.css'
export function AeSupportHelpPage({ canonicalBaseUrl, callRef }: AeSupportHelpPageProps) {
  const { supportEmailHref, diagnosticCommand } = useSupportHelpPage({ canonicalBaseUrl, callRef })
  const referencedCallRef = callRef.kind === 'valid' ? callRef.value : undefined
  const [topic, setTopic] = useState<SupportHelpTopic>('status')
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
  const id = useId()
  const active = channels.find(channel => channel.value === topic) ?? channels[0]
  function onTopicKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const delta = event.key === 'ArrowDown' || event.key === 'ArrowRight' ? 1 : event.key === 'ArrowUp' || event.key === 'ArrowLeft' ? -1 : 0
    const edge = event.key === 'Home' ? 0 : event.key === 'End' ? channels.length - 1 : -1
    if (delta === 0 && edge < 0) return
    const tabs = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]'))
    const currentIndex = tabs.findIndex(tab => tab === event.target)
    if (currentIndex < 0) return
    event.preventDefault()
    event.stopPropagation()
    const nextIndex = edge >= 0 ? edge : (currentIndex + delta + channels.length) % channels.length
    tabs[nextIndex]?.focus()
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
          <Tabs value={topic} onValueChange={value => setTopic(value as SupportHelpTopic)} orientation="vertical" className="arc-support-channel-tabs">
            <TabsList aria-label="Help topics" className="arc-support-channel-list" onKeyDownCapture={onTopicKeyDown}>
              {channels.map(channel => (
                <TabsTrigger
                  key={channel.value}
                  type="button"
                  value={channel.value}
                  id={`${id}-tab-${channel.value}`}
                  aria-controls={`${id}-panel-${channel.value}`}
                  className="arc-support-channel"
                >
                  <span className="arc-support-channel-icon">{channel.icon}</span>
                  <span className="arc-support-channel-text"><span>{channel.label}</span><span>{channel.meta}</span></span>
                </TabsTrigger>
              ))}
            </TabsList>
            <div key={active.value} id={`${id}-panel-${active.value}`} role="tabpanel" aria-labelledby={`${id}-tab-${active.value}`} tabIndex={0} className="arc-support-channel-panel">
              {active.detail}
            </div>
          </Tabs>
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
