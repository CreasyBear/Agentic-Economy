'use client'

import { ArrowRightIcon } from 'lucide-react'

import { Button } from '@astryxdesign/core/Button'
import { Card } from '@astryxdesign/core/Card'
import { Text } from '@astryxdesign/core/Text'

type AeOwnerStatusEmptyStateProps = {
  kind: 'not_found' | 'unavailable'
}

export function AeOwnerStatusEmptyState({ kind }: AeOwnerStatusEmptyStateProps) {
  const isNotFound = kind === 'not_found'

  return (
    <Card padding={5}>
      <div className="grid gap-1.5">
        <Text as="div" type="large" weight="semibold" color="primary" display="block">{isNotFound ? 'No service page yet' : 'Status unavailable'}</Text>
        <Text as="div" type="supporting" color="secondary" display="block">
          {isNotFound
            ? 'Claim your business to publish a page customers and assistants can read.'
            : 'Try again in a moment. If this keeps happening, contact support through corrections.'}
        </Text>
      </div>
      <div className="flex flex-wrap gap-3">
        {isNotFound ? (
          <>
            <Button href="/claim" label="List or claim your business" icon={<ArrowRightIcon aria-hidden="true" />} />
            <Button href="/registry?q=&limit=10" label="Browse published services" variant="secondary" />
          </>
        ) : (
          <Button href="/owner/status" label="Try again" variant="secondary" />
        )}
      </div>
    </Card>
  )
}
