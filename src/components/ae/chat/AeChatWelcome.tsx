import { VStack } from '@astryxdesign/core/Stack'
import { Heading, Text } from '@astryxdesign/core/Text'

import { cn } from '@/lib/utils'

const ENTER = 'motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-2 motion-safe:duration-base motion-safe:ease-emphasized'

export function AeChatWelcome() {
  return (
    <VStack gap={4} align="center" className="mx-auto max-w-2xl text-center">
      <Heading id="ae-home-heading" level={1} textWrap="balance" className={cn('text-3xl font-semibold tracking-tight sm:text-4xl', ENTER)}>
        The proof desk for agentic commerce.
      </Heading>
      <Text type="large" color="secondary" textWrap="pretty" display="block" className={cn('max-w-xl', ENTER, 'motion-safe:delay-75')}>
        Ask for a real local service. Compare the facts each business publishes, and send one qualified inquiry for owner review.
      </Text>
    </VStack>
  )
}
