import { VStack } from '@astryxdesign/core/Stack'
import { Heading, Text } from '@astryxdesign/core/Text'

import { cn } from '@/lib/utils'

const ENTER = 'motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-2 motion-safe:duration-base motion-safe:ease-emphasized'

export function AeChatWelcome() {
  return (
    <VStack gap={4} align="center" className="mx-auto max-w-2xl text-center">
      <Heading id="ae-home-heading" level={1} textWrap="balance" className={cn('text-3xl font-semibold tracking-tight sm:text-4xl', ENTER)}>
        What do you need done?
      </Heading>
      <Text type="large" color="secondary" textWrap="pretty" display="block" className={cn('max-w-xl', ENTER, 'motion-safe:delay-75')}>
        Describe the outcome in your own words. AE will reflect what matters, check registered supply, and show where the evidence is sufficient or incomplete.
      </Text>
    </VStack>
  )
}
