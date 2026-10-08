import type { ReactNode } from 'react'
import { CheckIcon, LoaderCircleIcon } from 'lucide-react'
import { Stepper, StepperContent, StepperIndicator, StepperItem, StepperNav, StepperPanel, StepperSeparator, StepperTitle, StepperTrigger } from '@/components/reui/stepper'
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { Button } from '@/components/ui/button'

export type ProviderSetupCompletedStep = Readonly<{ id: string; title: string; detail: string; disabled?: boolean; onEdit: () => void }>

/** Adapted from official ReUI Wizard 1; form state and commands remain AE-owned. */
export function AeProviderSetupWizard({ steps, activeStep, completedSteps, progressLabel, feedback, heading, children, busy = false }: Readonly<{
  steps: readonly Readonly<{ id: string; title: string }>[]
  activeStep: string
  completedSteps: readonly ProviderSetupCompletedStep[]
  progressLabel: string
  feedback?: ReactNode
  heading?: ReactNode
  children: ReactNode
  busy?: boolean
}>) {
  const active = Math.max(0, steps.findIndex(step => step.id === activeStep))
  return <Card className="w-full min-w-0">
    <Stepper value={active + 1} indicators={{ completed: <CheckIcon className="size-3.5" />, loading: <LoaderCircleIcon className="size-3.5 animate-spin" /> }} onValueChange={next => {
      const id = steps[next - 1]?.id
      const completed = completedSteps.find(step => step.id === id)
      if (completed !== undefined && !completed.disabled && !busy) completed.onEdit()
    }} className="w-full space-y-4">
      <CardHeader className="grid gap-4">
        {heading}
        <StepperNav aria-label={progressLabel} className="flex-wrap gap-y-3">
          {steps.map((step, index) => {
            const completed = completedSteps.find(item => item.id === step.id)
            return <StepperItem key={step.id} step={index + 1} disabled={busy || (index !== active && (completed === undefined || completed.disabled === true))} loading={busy && index === active} className="relative">
              <StepperTrigger className="min-h-11 gap-1.5"><StepperIndicator className="size-6 rounded-full">{index + 1}</StepperIndicator><StepperTitle className="text-sm">{step.title}</StepperTitle></StepperTrigger>
              {index + 1 < steps.length ? <StepperSeparator className="mx-2.5" /> : null}
            </StepperItem>
          })}
        </StepperNav>
      </CardHeader>
      <Separator />
      <CardContent className="grid min-w-0 gap-4">
        {feedback}
        <StepperPanel>{steps.map((step, index) => <StepperContent key={step.id} value={index + 1}>{index === active ? children : null}</StepperContent>)}</StepperPanel>
      </CardContent>
      {completedSteps.length === 0 ? null : <CardFooter className="grid w-full gap-3 border-t pt-4">
        <p className="text-sm font-medium">Reviewed sections</p>
        {completedSteps.map(step => <div key={step.id} className="flex min-w-0 flex-wrap items-start justify-between gap-3 text-sm">
          <div className="grid min-w-0 gap-1"><span className="font-medium">{step.title}</span><span className="break-all text-muted-foreground">{step.detail}</span></div>
          <Button type="button" variant="outline" size="sm" disabled={busy || step.disabled} onClick={step.onEdit}>Edit {step.title}</Button>
        </div>)}
      </CardFooter>}
    </Stepper>
  </Card>
}
