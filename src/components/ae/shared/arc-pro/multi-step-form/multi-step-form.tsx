/**
 * Adapted from the licensed Arc Pro Multi-step form block:
 * https://uiarc.dev/components/blocks/multi-step-form
 * Upstream multi-step-form.tsx SHA-256:
 * 6a76845c990dae523d0682dcd989063eae511adfb51ec0540a420331d6e48dd4
 * Retains progress, checked markers, the measured step shell and slide motion.
 * Stage changes, validation, feedback and completion remain caller-owned.
 */
'use client'

import { useCallback, useLayoutEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { AnimatePresence, LazyMotion, domAnimation, m, useReducedMotion } from 'motion/react'
import type { Variants } from 'motion/react'
import { Button } from '../../../../arc/button/button'
import { motionTokens } from '../../../../arc/lib/motion-tokens'
import styles from './multi-step-form.module.css'

export type FormStep = Readonly<{ id: string; title: string; description?: string }>
export type CompletedFormStep = Readonly<{ id: string; title: string; detail: string; disabled: boolean; onEdit: () => void }>

const exitFade = { duration: motionTokens.duration.instant, ease: [...motionTokens.ease.standard] } as const
const stepVariants: Variants = {
  enter: (direction: number) => ({ opacity: 0, x: 20 * direction }),
  center: { opacity: 1, x: 0 },
}

const markerExit = { opacity: 0, scale: 0.6, transition: exitFade } as const
const markerExitInstant = { opacity: 0, scale: 0.6, transition: { duration: 0 } } as const

function StepPanel({
  title,
  description,
  children,
  direction,
  reducedMotion,
  onMeasure,
}: Readonly<{
  title: string
  description: string | undefined
  children: ReactNode
  direction: number
  reducedMotion: boolean
  onMeasure: (height: number) => void
}>) {
  const fieldsetRef = useRef<HTMLFieldSetElement>(null)

  useLayoutEffect(() => {
    const node = fieldsetRef.current
    if (!node) return

    const measure = () => onMeasure(Math.ceil(node.getBoundingClientRect().height))
    measure()

    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(([entry]) => {
      onMeasure(Math.ceil(entry?.borderBoxSize?.[0]?.blockSize ?? node.getBoundingClientRect().height))
    })
    observer.observe(node)
    return () => observer.disconnect()
  }, [onMeasure])

  return (
    <m.fieldset
      ref={fieldsetRef}
      className={styles.step}
      custom={direction}
      variants={stepVariants}
      initial={reducedMotion ? false : 'enter'}
      animate="center"
      transition={reducedMotion
        ? { duration: 0 }
        : { x: motionTokens.spring.smooth, opacity: { duration: motionTokens.duration.standard, ease: [...motionTokens.ease.enter] } }}
    >
      <legend>{title}</legend>
      {description ? <p className={styles.description}>{description}</p> : null}
      <div className={styles.content}>{children}</div>
    </m.fieldset>
  )
}

export function MultiStepForm({
  steps,
  activeStep,
  children,
  completedSteps = [],
  feedback,
  progressLabel = 'Form progress',
}: Readonly<{
  steps: readonly FormStep[]
  activeStep: string
  children: ReactNode
  completedSteps?: readonly CompletedFormStep[]
  feedback?: ReactNode
  progressLabel?: string
  }>) {
  const activeIndex = steps.findIndex(step => step.id === activeStep)
  const [lastStage, setLastStage] = useState(() => ({ index: activeIndex, direction: 1 }))
  const direction = activeIndex === lastStage.index
    ? lastStage.direction
    : activeIndex > lastStage.index ? 1 : -1
  const [measuredHeight, setMeasuredHeight] = useState<number>()
  const reducedMotion = useReducedMotion() ?? false

  useLayoutEffect(() => {
    if (activeIndex >= 0 && activeIndex !== lastStage.index) setLastStage({ index: activeIndex, direction })
  }, [activeIndex, direction, lastStage.index])

  const onMeasure = useCallback((height: number) => {
    setMeasuredHeight(current => current === height ? current : height)
  }, [])

  if (activeIndex < 0) return null
  const current = steps[activeIndex]
  if (!current) return null

  return (
    <LazyMotion features={domAnimation}>
    <div className={`arc-market ${styles.form}`}>
      <nav className={styles.progress} aria-label={progressLabel}>
        <ol className={styles.progressList}>
          {steps.map((step, index) => {
            const complete = index < activeIndex
            const currentStep = index === activeIndex
            return (
              <li
                className={`${styles.progressItem} ${complete ? styles.complete : ''} ${currentStep ? styles.current : ''}`}
                key={step.id}
                aria-current={currentStep ? 'step' : undefined}
              >
                <span className={styles.progressMarker} aria-hidden="true">
                  <AnimatePresence initial={false}>
                    {complete
                      ? <m.svg
                          key="done"
                          className={styles.markerGlyph}
                          viewBox="0 0 24 24"
                          width={11}
                          height={11}
                          fill="none"
                          stroke="currentColor"
                          strokeWidth={2.6}
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          initial={reducedMotion ? false : { opacity: 0, scale: 0.6 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={reducedMotion ? markerExitInstant : markerExit}
                          transition={reducedMotion ? { duration: 0 } : motionTokens.spring.snappy}
                        >
                          <m.path
                            d="M4 12.5 9 17.5 20 6.5"
                            initial={reducedMotion ? false : { pathLength: 0 }}
                            animate={{ pathLength: 1 }}
                            transition={reducedMotion ? { duration: 0 } : { duration: 0.32, ease: [...motionTokens.ease.enter], delay: 0.04 }}
                          />
                        </m.svg>
                      : <m.span
                          key="number"
                          className={styles.markerGlyph}
                          initial={reducedMotion ? false : { opacity: 0, scale: 0.6, filter: `blur(${motionTokens.blur.subtle}px)` }}
                          animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
                          exit={reducedMotion ? markerExitInstant : markerExit}
                          transition={reducedMotion ? { duration: 0 } : motionTokens.spring.snappy}
                        >
                          {index + 1}
                        </m.span>}
                  </AnimatePresence>
                </span>
                <span className={styles.progressLabel} data-label={step.title}>{step.title}</span>
              </li>
            )
          })}
        </ol>
        <span className={styles.progressCount} aria-hidden="true">Step {activeIndex + 1} of {steps.length}</span>
        <span className={styles.srOnly} role="status" aria-live="polite" aria-atomic="true">Step {activeIndex + 1} of {steps.length}</span>
      </nav>

      {completedSteps.length > 0 ? (
        <ol className={styles.completedList} aria-label="Completed steps">
          {completedSteps.map(step => (
            <li className={styles.completedItem} key={step.id}>
              <div className={styles.completedCopy}>
                <span className={styles.completedTitle}>{step.title}</span>
                <p className={styles.completedDetail}>{step.detail}</p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className={styles.editButton}
                disabled={step.disabled}
                onClick={step.onEdit}
              >
                Edit {step.title}
              </Button>
            </li>
          ))}
        </ol>
      ) : null}

      {feedback !== undefined && feedback !== null ? <div className={styles.feedback}>{feedback}</div> : null}

      <div className={styles.viewport} style={measuredHeight === undefined ? undefined : { minHeight: measuredHeight }}>
        <StepPanel
          key={current.id}
          title={current.title}
          description={current.description}
          direction={direction}
          reducedMotion={reducedMotion}
          onMeasure={onMeasure}
        >
          {children}
        </StepPanel>
      </div>
    </div>
    </LazyMotion>
  )
}
