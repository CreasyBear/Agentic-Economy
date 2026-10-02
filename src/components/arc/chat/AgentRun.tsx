/* Arc Pro agent-run upstream SHA-256: 96602fbaeed56985f7783c444e950b59eecd38d08ee073f0646635e2b137ee7f; retrieved 2026-10-01. */
// Authored summary/disclosure, animated timeline and status rail adapted to real discovery work.
// Requires observed labels/statuses. Ensures no invented progress, events or controls.
import { Check, ChevronDown, LoaderCircle, TriangleAlert } from 'lucide-react'
import { motion, useReducedMotion } from 'motion/react'
import { useId, useState } from 'react'
import { getStatusPresentation } from '@/lib/ui/status-presentation'
import type { WorkDisclosureView } from '@/components/ae/chat/generative/generative.contracts'
import { motionTokens } from '../lib/motion-tokens'
import styles from './AgentRun.module.css'

const statusLabel = { working: 'Working', complete: 'Done', attention: getStatusPresentation('needs_attention').label } as const
const statusIcon = { working: LoaderCircle, complete: Check, attention: TriangleAlert } as const

export function AgentRun({ view }: Readonly<{ view: WorkDisclosureView }>) {
  const [open, setOpen] = useState(false)
  const id = useId()
  const reduce = Boolean(useReducedMotion())
  if (view.steps.length === 0) return null
  const working = view.steps.some(step => step.status === 'working')
  const attention = view.steps.some(step => step.status === 'attention')
  const phase = working ? 'working' : attention ? 'attention' : 'complete'
  const Icon = statusIcon[phase]
  return <details className={`arc-market arc-chat ${styles.root}`} open={open}>
    <summary className={styles.summary} aria-controls={`${id}-timeline`} onClick={event => { event.preventDefault(); setOpen(current => !current) }}>
      <span className={styles.status} data-phase={phase}><Icon size={17} strokeWidth={1.75} className={working ? styles.spin : undefined} aria-hidden="true" /><span>{view.summary}</span></span>
      <ChevronDown className={styles.chevron} size={17} strokeWidth={1.75} aria-hidden="true" />
    </summary>
    <motion.div id={`${id}-timeline`} className={styles.timelineWrap} initial={false} animate={{ height: open ? 'auto' : 0, opacity: open ? 1 : 0 }} transition={reduce ? { duration: 0 } : { height: motionTokens.spring.smooth, opacity: { duration: motionTokens.duration.standard } }} inert={!open} aria-hidden={!open}>
      <ol className={styles.timeline} aria-label="Discovery work">
        {view.steps.map((step, index) => {
          const StepIcon = statusIcon[step.status]
          return <motion.li key={step.id} className={styles.step} data-status={step.status} initial={false} layout={reduce ? false : 'position'} transition={reduce ? { duration: 0 } : motionTokens.spring.smooth}>
            <div className={styles.rail} aria-hidden="true"><span className={styles.node}><StepIcon size={14} strokeWidth={1.75} className={step.status === 'working' ? styles.spin : undefined} /></span>{index < view.steps.length - 1 ? <span className={styles.track}><motion.span className={styles.fill} initial={false} animate={{ scaleY: step.status === 'complete' ? 1 : 0 }} transition={reduce ? { duration: 0 } : motionTokens.spring.smooth} /></span> : null}</div>
            <div className={styles.stepMain}><span className={styles.stepTitle}>{step.label}</span><span className={styles.stepMeta}>{statusLabel[step.status]}</span></div>
          </motion.li>
        })}
      </ol>
    </motion.div>
  </details>
}
