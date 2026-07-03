import { Badge } from '@astryxdesign/core/Badge'
import { Card } from '@astryxdesign/core/Card'
import { Text } from '@astryxdesign/core/Text'

const routingSteps = ['Who fits', 'Where they work', 'What to do now']

export function AeRoutingObject() {
  return (
    <Card padding={5} className="grid gap-4" aria-label="Agentic Economy routing preview">
      <div className="grid gap-1.5">
        <Badge variant="info" className="w-fit" label="Example need" />
        <Text type="large" weight="semibold" color="primary" display="block">No hot water in Preston 3072</Text>
        <Text color="secondary" display="block">AE returns published business facts, fit signals, and a qualified next step.</Text>
      </div>
      <ol className="grid gap-2" aria-label="What the answer returns">
        {routingSteps.map((step, index) => (
          <li key={step} className="flex items-center gap-3 rounded-md border border-border bg-surface px-3 py-2 text-sm text-primary">
            <span className="font-mono text-xs text-secondary">{index + 1}</span>
            {step}
          </li>
        ))}
      </ol>
    </Card>
  )
}
