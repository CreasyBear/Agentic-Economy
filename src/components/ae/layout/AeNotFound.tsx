import { ArrowLeftIcon, SearchIcon } from 'lucide-react'
import { Button } from '@astryxdesign/core/Button'
import { Heading, Text } from '@astryxdesign/core/Text'
import { HStack, VStack } from '@astryxdesign/core/Stack'

import { AePublicShell } from '@/components/ae/layout/AePublicShell'

export function AeNotFound() {
  return (
    <AePublicShell>
      <section className="mx-auto grid w-full max-w-3xl gap-6 px-4 py-24 md:px-6">
        <VStack gap={4}>
          <Text type="supporting" weight="medium" color="secondary" display="block">
            Route missing
          </Text>
          <Heading level={1} type="display-2" textWrap="balance">
            This page is not here.
          </Heading>
          <Text type="large" color="secondary" display="block" textWrap="pretty">
            The address moved, expired, or was never published. Try the service search, or browse listed
            businesses from the registry.
          </Text>
          <HStack gap={3} wrap="wrap">
            <Button label="Ask a question" variant="primary" href="/" icon={<SearchIcon aria-hidden="true" />} />
            <Button
              label="Browse services"
              variant="secondary"
              href="/registry?q=&limit=10"
              icon={<ArrowLeftIcon aria-hidden="true" />}
            />
          </HStack>
        </VStack>
      </section>
    </AePublicShell>
  )
}
