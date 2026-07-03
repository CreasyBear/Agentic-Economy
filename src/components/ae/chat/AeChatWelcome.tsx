import { VStack } from '@astryxdesign/core/Stack'
import { Heading, Text } from '@astryxdesign/core/Text'

export function AeChatWelcome() {
  return (
    <section className="min-w-0" aria-labelledby="ae-home-heading">
      <VStack gap={4} className="min-w-0">
        <Text type="label" color="secondary" weight="semibold">
          Agentic Economy
        </Text>
        <Heading id="ae-home-heading" level={1} className="text-balance text-4xl tracking-tight sm:text-5xl">
          Ask for a local service. See who fits.
        </Heading>
        <Text type="large" color="secondary" className="max-w-[34rem]">
          Type a real need, or name a different place. AE answers from published business details and shows the
          next step the listing actually supports.
        </Text>
        <Text type="supporting" color="secondary">
          Assistants: <a href="/llms.txt" className="text-primary underline-offset-4 hover:underline">/llms.txt</a>
        </Text>
      </VStack>
    </section>
  )
}
