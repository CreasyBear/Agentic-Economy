import { createContext, useContext } from 'react'
import { motion, useReducedMotion, type HTMLMotionProps } from 'motion/react'

// Ported from cult-ui/animate/fade-in. AE already depends on `motion` (used by ai-elements/shimmer).
// Typed (no `any`), honours prefers-reduced-motion, no raw colour classes.

const FadeInStaggerContext = createContext(false)

const viewport = { once: true, margin: '0px 0px -200px' } as const

export function FadeIn(props: HTMLMotionProps<'div'>) {
  const shouldReduceMotion = useReducedMotion()
  const isInStaggerGroup = useContext(FadeInStaggerContext)
  const motionState = shouldReduceMotion
    ? {
        initial: false,
        animate: 'visible' as const,
      }
    : isInStaggerGroup
      ? {}
      : {
          initial: 'hidden' as const,
          whileInView: 'visible' as const,
          viewport,
        }

  return (
    <motion.div
      variants={{
        hidden: shouldReduceMotion ? { opacity: 1, y: 0 } : { opacity: 0, y: 24 },
        visible: { opacity: 1, y: 0 },
      }}
      transition={shouldReduceMotion ? { duration: 0 } : { duration: 0.5 }}
      {...motionState}
      {...props}
    />
  )
}

export function FadeInStagger({
  faster = false,
  ...props
}: HTMLMotionProps<'div'> & { faster?: boolean }) {
  const shouldReduceMotion = useReducedMotion()

  return (
    <FadeInStaggerContext.Provider value={!shouldReduceMotion}>
      <motion.div
        initial={shouldReduceMotion ? false : 'hidden'}
        whileInView="visible"
        viewport={viewport}
        transition={shouldReduceMotion ? { duration: 0 } : { staggerChildren: faster ? 0.12 : 0.2 }}
        {...props}
      />
    </FadeInStaggerContext.Provider>
  )
}
