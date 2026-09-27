import { useState } from 'react'
import { useQuery } from 'convex/react'

import { api } from '../../../../../convex/_generated/api'
import { AdminActionSheet } from '@/components/ae/admin/actions/AdminActionSheet'
import { ADMIN_AUDIT_ACTION_COPY } from '@/components/ae/admin/actions/actions.contracts'
import { AeSection } from '@/components/ae/layout/AeSection'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ADMIN_ACTION_PERMISSION } from '@/lib/operator/admin-console/contracts'
import { canAdminRolePerformAction, type AdminRole } from '@/modules/security/public'

export function AdminMembershipActions() {
  const access = useQuery(api.adminConsoleAudit.readAdminAuditAccess, {})
  const [targetClerkUserId, setTargetClerkUserId] = useState('')
  const [targetTokenIdentifier, setTargetTokenIdentifier] = useState('')
  const [role, setRole] = useState<AdminRole>('support')
  const [action, setAction] = useState<'grant_admin_membership' | 'revoke_admin_membership' | null>(null)

  if (access?.kind !== 'allowed' || !canAdminRolePerformAction(access.role, ADMIN_ACTION_PERMISSION.grant_admin_membership)) return null

  const userId = targetClerkUserId.trim()
  const tokenIdentifier = targetTokenIdentifier.trim()
  const targetRefs = [
    { label: ADMIN_AUDIT_ACTION_COPY.targetClerkUserId, value: userId },
    ...(tokenIdentifier === '' ? [] : [{ label: ADMIN_AUDIT_ACTION_COPY.targetTokenIdentifier, value: tokenIdentifier }]),
  ]
  const onOpenChange = (open: boolean) => { if (!open) setAction(null) }

  return (
    <>
      <AeSection title={ADMIN_AUDIT_ACTION_COPY.membershipTitle} description={ADMIN_AUDIT_ACTION_COPY.membershipDescription}>
        <form
          className="grid gap-related rounded-lg border border-border p-gutter md:grid-cols-2"
          onSubmit={(event) => {
            event.preventDefault()
            if (userId !== '' && tokenIdentifier !== '') setAction('grant_admin_membership')
          }}
        >
          <div className="grid gap-intra">
            <Label htmlFor="admin-membership-user-id">{ADMIN_AUDIT_ACTION_COPY.targetClerkUserId}</Label>
            <Input id="admin-membership-user-id" name="targetClerkUserId" value={targetClerkUserId} onChange={(event) => setTargetClerkUserId(event.target.value)} autoComplete="off" spellCheck={false} required />
          </div>
          <div className="grid gap-intra">
            <Label htmlFor="admin-membership-token-id">{ADMIN_AUDIT_ACTION_COPY.targetTokenIdentifier}</Label>
            <Input id="admin-membership-token-id" name="targetTokenIdentifier" value={targetTokenIdentifier} onChange={(event) => setTargetTokenIdentifier(event.target.value)} autoComplete="off" spellCheck={false} />
          </div>
          <div className="grid gap-intra">
            <Label htmlFor="admin-membership-role">{ADMIN_AUDIT_ACTION_COPY.role}</Label>
            <select
              id="admin-membership-role"
              name="role"
              value={role}
              onChange={(event) => {
                const value = event.target.value
                if (value === 'owner_admin' || value === 'support' || value === 'reviewer') setRole(value)
              }}
              className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:h-9"
            >
              <option value="owner_admin">{ADMIN_AUDIT_ACTION_COPY.roleLabels.owner_admin}</option>
              <option value="support">{ADMIN_AUDIT_ACTION_COPY.roleLabels.support}</option>
              <option value="reviewer">{ADMIN_AUDIT_ACTION_COPY.roleLabels.reviewer}</option>
            </select>
          </div>
          <div className="flex flex-wrap items-end gap-intra">
            <Button type="submit" disabled={userId === '' || tokenIdentifier === ''}>{ADMIN_AUDIT_ACTION_COPY.grant}</Button>
            <Button type="button" variant="outline" disabled={userId === ''} onClick={() => setAction('revoke_admin_membership')}>{ADMIN_AUDIT_ACTION_COPY.revoke}</Button>
          </div>
        </form>
      </AeSection>
      {action === 'grant_admin_membership' ? (
        <AdminActionSheet
          action="grant_admin_membership"
          input={{ targetClerkUserId: userId, targetTokenIdentifier: tokenIdentifier, role }}
          targetRefs={targetRefs}
          open
          onOpenChange={onOpenChange}
        />
      ) : action === 'revoke_admin_membership' ? (
        <AdminActionSheet
          action="revoke_admin_membership"
          input={{ targetClerkUserId: userId, ...(tokenIdentifier === '' ? {} : { targetTokenIdentifier: tokenIdentifier }) }}
          targetRefs={targetRefs}
          open
          onOpenChange={onOpenChange}
        />
      ) : null}
    </>
  )
}
