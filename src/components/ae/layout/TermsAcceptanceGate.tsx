import { useState, type ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import { useMutation, useQuery } from 'convex/react'

import { Button } from '@/components/arc/button/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { TERMS_VERSION } from '@/components/ae/legal/legal-version'
import { api } from '../../../../convex/_generated/api'
import { RoutePending } from './AeRoutePending'

/** Blocks the operator shell until the signed-in owner has accepted the current terms (clickwrap). Fails closed. */
export function TermsAcceptanceGate({ children }: { children: ReactNode }) {
  const state = useQuery(api.termsAcceptance.read)
  const accept = useMutation(api.termsAcceptance.accept)
  const [ticked, setTicked] = useState(false)
  const [pending, setPending] = useState(false)
  const [failed, setFailed] = useState(false)

  if (state === undefined) return <RoutePending title="Loading" description="Checking your account." />
  if (state.accepted) return <>{children}</>

  const onContinue = async () => {
    setPending(true)
    setFailed(false)
    try { await accept({ termsVersion: TERMS_VERSION }) } catch { setFailed(true) } finally { setPending(false) }
  }

  return (
    <Dialog open>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>Accept the terms to continue</DialogTitle>
          <DialogDescription>We record the version you accept.</DialogDescription>
        </DialogHeader>
        <Checkbox
          checked={ticked}
          onCheckedChange={next => setTicked(next === true)}
          aria-label="I agree to the Terms and Privacy Policy"
          label="I agree to the Terms and Privacy Policy"
        />
        <p>
          Read the <Link to="/terms" target="_blank">Terms</Link> and <Link to="/privacy" target="_blank">Privacy Policy</Link>.
        </p>
        {failed ? <p role="alert">We could not save your acceptance. Try again.</p> : null}
        <DialogFooter>
          <Button disabled={!ticked || pending} onClick={onContinue}>Continue</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
