import { Button } from '@astryxdesign/core/Button'
import { Card } from '@astryxdesign/core/Card'
import { Heading, Text } from '@astryxdesign/core/Text'
import { createFileRoute } from '@tanstack/react-router'

import { AePublicShell } from '@/components/ae/layout/AePublicShell'

export const Route = createFileRoute('/for-agents')({
  head: () => ({ meta: [
    { title: 'Use Agentic Economy with your AI' },
    { name: 'description', content: 'Give your AI one public starting point for an Agentic Economy Customer Request.' },
  ] }),
  component: ForAgentsRoute,
})

function ForAgentsRoute() {
  return (
    <AePublicShell>
      <main className="mx-auto grid w-full max-w-4xl gap-8 px-4 py-10 sm:px-6 lg:py-14">
        <header className="grid gap-3">
          <Text className="text-sm font-semibold text-accent">For agents</Text>
          <Heading level={1} className="text-4xl font-semibold tracking-tight sm:text-5xl">Use AE with your AI</Heading>
          <Text type="large" color="secondary">Your AI can start with the outcome you need, follow AE’s current choices, and stop for your decision before anything is confirmed, shared, or started.</Text>
        </header>

        <Card padding={5}>
          <div className="grid gap-4">
            <Heading level={2}>What your AI needs</Heading>
            <ol className="grid list-decimal gap-3 pl-5 text-secondary">
              <li>This site’s public origin.</li>
              <li>An AE API key with Customer Request access.</li>
              <li>Your request in ordinary language and your answers when AE asks a decision-changing question.</li>
            </ol>
            <Text weight="semibold">Public self-service API keys are not available yet.</Text>
          </div>
        </Card>

        <Card padding={5}>
          <div className="grid gap-4">
            <Heading level={2}>Setup files</Heading>
            <Text color="secondary">Ask your AI to read these paths from this site. They describe the current entry point, required authentication, returned actions, progress states, and recovery rules.</Text>
            <dl className="grid gap-3">
              <div><dt className="font-semibold">Public index</dt><dd><code className="text-sm text-secondary">/llms.txt</code></dd></div>
              <div><dt className="font-semibold">Assistant instructions</dt><dd><code className="text-sm text-secondary">/SKILL.md</code></dd></div>
            </dl>
          </div>
        </Card>

        <div className="flex flex-wrap gap-3">
          <Button label="Ask AE yourself" variant="primary" href="/" />
          <Button label="Browse businesses" variant="secondary" href="/registry?q=&limit=10" />
        </div>
      </main>
    </AePublicShell>
  )
}
