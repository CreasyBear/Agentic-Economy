import { useState } from 'react'
import { useQuery } from 'convex/react'

import { api } from '../../../../../convex/_generated/api'
import { AdminActionSheet } from '@/components/ae/admin/actions/AdminActionSheet'
import { ADMIN_AUDIT_ACTION_COPY } from '@/components/ae/admin/actions/actions.contracts'
import { AeSection } from '@/components/ae/layout/AeSection'
import { Button } from '@/components/arc/button/button'
import { ADMIN_ACTION_PERMISSION } from '@/lib/operator/admin-console/contracts'
import { canAdminRolePerformAction, type AdminRole } from '@/modules/security/public'
import './AccessDecisionsComposition.css'

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
          className="arc-market arc-admin-membership"
          onSubmit={(event) => {
            event.preventDefault()
            if (userId !== '' && tokenIdentifier !== '') setAction('grant_admin_membership')
          }}
        >
          <div className="arc-admin-membership-field">
            <label htmlFor="admin-membership-user-id">{ADMIN_AUDIT_ACTION_COPY.targetClerkUserId}</label>
            <input id="admin-membership-user-id" name="targetClerkUserId" value={targetClerkUserId} onChange={(event) => setTargetClerkUserId(event.target.value)} autoComplete="off" spellCheck={false} required />
          </div>
          <div className="arc-admin-membership-field">
            <label htmlFor="admin-membership-token-id">{ADMIN_AUDIT_ACTION_COPY.targetTokenIdentifier}</label>
            <input id="admin-membership-token-id" name="targetTokenIdentifier" value={targetTokenIdentifier} onChange={(event) => setTargetTokenIdentifier(event.target.value)} autoComplete="off" spellCheck={false} />
          </div>
          <div className="arc-admin-membership-field">
            <label htmlFor="admin-membership-role">{ADMIN_AUDIT_ACTION_COPY.role}</label>
            <select
              id="admin-membership-role"
              name="role"
              value={role}
              onChange={(event) => {
                const value = event.target.value
                if (value === 'owner_admin' || value === 'support' || value === 'reviewer') setRole(value)
              }}
            >
              <option value="owner_admin">{ADMIN_AUDIT_ACTION_COPY.roleLabels.owner_admin}</option>
              <option value="support">{ADMIN_AUDIT_ACTION_COPY.roleLabels.support}</option>
              <option value="reviewer">{ADMIN_AUDIT_ACTION_COPY.roleLabels.reviewer}</option>
            </select>
          </div>
          <div className="arc-admin-membership-actions">
            <Button type="submit" variant="primary" size="md" disabled={userId === '' || tokenIdentifier === ''}>{ADMIN_AUDIT_ACTION_COPY.grant}</Button>
            <Button type="button" variant="danger" size="md" disabled={userId === ''} onClick={() => setAction('revoke_admin_membership')}>{ADMIN_AUDIT_ACTION_COPY.revoke}</Button>
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
