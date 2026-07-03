'use client'

import { useState, type FormEvent } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { AnimatePresence, LazyMotion, domAnimation, m } from 'motion/react'
import { ArrowRightIcon, CheckIcon, MessageSquareTextIcon, XIcon } from 'lucide-react'
import { Button } from '@astryxdesign/core/Button'
import { Card } from '@astryxdesign/core/Card'
import { Text } from '@astryxdesign/core/Text'
import { TextArea } from '@astryxdesign/core/TextArea'

import { toast } from '@/lib/ui/toast'
import { AeActionButton } from '@/components/ae/motion/AeActionButton'

type WidgetState = 'closed' | 'open' | 'routing' | 'ready'

export function AeCorrectionWidget() {
  const navigate = useNavigate()
  const [state, setState] = useState<WidgetState>('closed')
  const [note, setNote] = useState('')
  const open = state !== 'closed'

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setState('routing')
    toast.info('Opening the correction route.', {
      description:
        note.trim().length > 0
          ? 'Bring this note with you when you submit the request.'
          : 'Use the form to tell AE what needs review.',
    })
    window.setTimeout(() => {
      void navigate({ to: '/privacy/remove-business' })
    }, 520)
  }

  return (
    <LazyMotion features={domAnimation}>
      <div className="fixed bottom-4 right-4 z-30 flex flex-col items-end gap-3">
        <AnimatePresence>
          {open ? (
            <m.form
              initial={{ opacity: 0, y: 14, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.98 }}
              transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
              onSubmit={handleSubmit}
              className="w-[min(22rem,calc(100vw-2rem))]"
            >
              <Card padding={4}>
                <div className="flex items-start justify-between gap-3">
                  <div className="grid gap-1">
                    <Text type="large" weight="semibold" color="primary" display="block">
                      Page detail needs review?
                    </Text>
                    <Text type="supporting" color="secondary" display="block">
                      Route a correction request without implying booking or dispatch.
                    </Text>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    label="Close correction panel"
                    isIconOnly
                    icon={<XIcon aria-hidden="true" />}
                    onClick={() => setState('closed')}
                  />
                </div>
                <div className="mt-3 grid gap-3">
                  <TextArea
                    label="Short note"
                    value={note}
                    rows={4}
                    maxLength={360}
                    placeholder="Example: service area looks stale, phone details need correction..."
                    onChange={(value) => setNote(value)}
                  />
                  <AeActionButton
                    type="submit"
                    state={state === 'routing' ? 'loading' : 'idle'}
                    variant="primary"
                    leadingIcon={<CheckIcon />}
                    trailingIcon={<ArrowRightIcon />}
                  >
                    Continue to corrections
                  </AeActionButton>
                </div>
              </Card>
            </m.form>
          ) : null}
        </AnimatePresence>
        <Button
          type="button"
          variant="primary"
          label="Correct details"
          icon={<MessageSquareTextIcon aria-hidden="true" />}
          aria-expanded={open}
          onClick={() => setState(open ? 'closed' : 'ready')}
        />
      </div>
    </LazyMotion>
  )
}
