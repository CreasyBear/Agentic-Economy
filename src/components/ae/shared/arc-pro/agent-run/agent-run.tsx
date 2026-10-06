/* Adapted from Arc UI Pro agent-run source. Upstream SHA-256: 1218e845025b2f2ed54b315a024fadd96fa2005bc35ce5de96c987115b17388a. */
"use client";

import { useId, useState, type ReactNode } from "react";
import { AnimatePresence, LazyMotion, domAnimation, m, useReducedMotion } from "motion/react";
import { Check, ChevronDown, CircleCheck, LoaderCircle, TriangleAlert } from "lucide-react";

import { motionTokens } from "../../../../arc/lib/motion-tokens";
import styles from "./agent-run.module.css";

type AgentRunPhase = "working" | "complete" | "attention";

type AgentRunStep = Readonly<{
  id: string;
  label: string;
  phase: AgentRunPhase;
  phaseLabel: string;
}>;

const phaseIcon = {
  working: LoaderCircle,
  complete: Check,
  attention: TriangleAlert,
} as const;

/** The licensed request/status/result regions, driven by caller-owned evidence.
 * Requires an observed run; ensures no demo clock, approval or retry side effect.
 * A delayed observation is labelled in the supplied announcement, never advanced.
 */
export function AgentRun({
  title,
  description,
  byline,
  status,
  facts = [],
  children,
  actions,
}: Readonly<{
  title: string;
  description: string;
  byline: ReactNode;
  status: Readonly<{
    phase: "running" | "waiting" | "done" | "stopped";
    label: string;
    announcement: string;
  }>;
  facts?: readonly Readonly<{ label: string; value: string }>[];
  children?: ReactNode;
  actions: ReactNode;
}>) {
  const id = useId();
  const ResultIcon = status.phase === "done" ? CircleCheck
    : status.phase === "waiting" || status.phase === "stopped" ? TriangleAlert : LoaderCircle;

  return (
    <section className={`arc-market ${styles.root} ${styles.runFrame}`} aria-labelledby={`${id}-title`}>
      <header className={styles.request}>
        <div className={styles.byline}>{byline}</div>
      </header>
      <div className={styles.toolbar}>
        <span className={styles.runStatus} data-phase={status.phase}>
          <span className={styles.dot} aria-hidden="true" />
          <span>{status.label}</span>
        </span>
      </div>
      <div className={styles.run}>
        <div className={styles.result} data-tone={status.phase === "done" ? "success" : status.phase === "stopped" || status.phase === "waiting" ? "warning" : undefined}>
          <h2 className={styles.resultTitle} id={`${id}-title`}>
            <ResultIcon size={20} strokeWidth={1.75} aria-hidden="true" />{title}
          </h2>
          <p className={styles.resultBody}>{description}</p>
          {facts.length === 0 ? null : <dl className={styles.facts}>
            {facts.map((fact) => <div key={fact.label}><dt>{fact.label}</dt><dd title={fact.value}>{fact.value}</dd></div>)}
          </dl>}
          {children}
          <div className={styles.actions}>{actions}</div>
        </div>
      </div>
      <p className={styles.srOnly} role="status" aria-atomic="true">{status.announcement}</p>
    </section>
  );
}

export function ArcAgentRunTimeline({
  summary,
  steps,
}: Readonly<{
  summary: string;
  steps: readonly AgentRunStep[];
}>) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const reducedMotion = useReducedMotion() ?? false;

  if (steps.length === 0) return null;

  const hasWorkingStep = steps.some((step) => step.phase === "working");
  const hasAttentionStep = steps.some((step) => step.phase === "attention");
  const phase: AgentRunPhase = hasWorkingStep
    ? "working"
    : hasAttentionStep
      ? "attention"
      : "complete";
  const PhaseIcon = phaseIcon[phase];
  const panelTransition = reducedMotion
    ? { duration: 0 }
    : {
        height: motionTokens.spring.smooth,
        opacity: { duration: motionTokens.duration.standard },
      };

  return (
    <div className={`arc-market arc-chat ${styles.root}`}>
      <button
        type="button"
        className={styles.summary}
        aria-expanded={open}
        aria-controls={`${id}-timeline`}
        onClick={() => setOpen((wasOpen) => !wasOpen)}
      >
        <span className={styles.status} data-phase={phase}>
          <PhaseIcon
            className={phase === "working" && !reducedMotion ? styles.spin : undefined}
            size={17}
            strokeWidth={1.75}
            aria-hidden="true"
          />
          <span>{summary}</span>
        </span>
        <ChevronDown className={styles.chevron} size={17} strokeWidth={1.75} aria-hidden="true" />
      </button>
      <LazyMotion features={domAnimation}>
        <m.div
          id={`${id}-timeline`}
          className={styles.timelineWrap}
          initial={false}
          animate={{ height: open ? "auto" : 0, opacity: open ? 1 : 0 }}
          transition={panelTransition}
          inert={!open}
          aria-hidden={!open}
        >
          <ol className={styles.timeline} aria-label="Discovery work">
            <AnimatePresence initial={false}>
              {steps.map((step, index) => {
                const StepIcon = phaseIcon[step.phase];
                const complete = step.phase === "complete";

                return (
                  <m.li
                    key={step.id}
                    className={styles.step}
                    data-status={step.phase}
                    initial={false}
                    layout={open && !reducedMotion ? "position" : false}
                    transition={reducedMotion ? { duration: 0 } : motionTokens.spring.smooth}
                  >
                    <div className={styles.rail} aria-hidden="true">
                      <span className={styles.node}>
                        <StepIcon
                          className={step.phase === "working" && open && !reducedMotion ? styles.spin : undefined}
                          size={14}
                          strokeWidth={1.75}
                        />
                      </span>
                      {index < steps.length - 1 ? (
                        <span className={styles.track}>
                          <m.span
                            className={styles.fill}
                            initial={false}
                            animate={{ scaleY: complete ? 1 : 0 }}
                            transition={reducedMotion || !open ? { duration: 0 } : motionTokens.spring.smooth}
                          />
                        </span>
                      ) : null}
                    </div>
                    <div className={styles.stepMain}>
                      <div className={styles.stepHead}>
                        <span className={styles.stepTitle}>{step.label}</span>
                        <span className={styles.stepMeta} data-status={step.phase}>
                          {step.phaseLabel}
                        </span>
                      </div>
                    </div>
                  </m.li>
                );
              })}
            </AnimatePresence>
          </ol>
        </m.div>
      </LazyMotion>
    </div>
  );
}
