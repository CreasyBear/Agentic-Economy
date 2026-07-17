import {
  customerRequestAgentNavigationSchema,
  customerRequestViewSchema,
  type CustomerRequestAgentNavigation,
  type CustomerRequestView,
} from '@/modules/customer-request/agent-contract'

/**
 * Adds state-appropriate links to the external-agent projection. The canonical
 * Request remains the source of truth; this only makes its next move navigable
 * without requiring a caller to know AE's route choreography in advance.
 */
export async function withCustomerRequestAgentNavigation(response: Response): Promise<Response> {
  if (!response.ok) return response
  const body = await response.clone().json().catch(() => undefined)
  const parsed = customerRequestViewSchema.safeParse(body)
  if (!parsed.success) return response

  const navigation = projectCustomerRequestAgentNavigation(parsed.data)
  const headers = new Headers(response.headers)
  headers.set('Cache-Control', 'no-store')
  headers.set('Content-Type', 'application/json')
  return Response.json({ ...parsed.data, navigation }, { status: response.status, headers })
}

export function projectCustomerRequestAgentNavigation(view: CustomerRequestView): CustomerRequestAgentNavigation {
  const current = `/api/v1/requests/${encodeURIComponent(view.requestRef)}`
  const idempotencyKey = '<unique string>'
  const actions: Array<CustomerRequestAgentNavigation['actions'][number]> = []

  if (view.state === 'needs_information' && view.clarification?.kind === 'contract_fact') {
    actions.push({
      relation: 'answer_clarification', method: 'POST', href: `${current}/facts`,
      summary: 'Answer this question to continue the same Request.',
      input: {
        idempotencyKey, expectedRevision: view.revision,
        requirementKey: view.clarification.requirementKey, value: '<typed value>',
      },
    })
  } else if (view.state === 'needs_information' && view.clarification?.kind === 'intent_direction') {
    actions.push({
      relation: 'answer_clarification', method: 'POST', href: `${current}/messages`,
      summary: 'Answer in natural language to continue the same Request.',
      input: { idempotencyKey, expectedRevision: view.revision, message: '<natural-language answer>' },
    })
  } else if (view.state === 'ready_to_compare') {
    actions.push({
      relation: 'prepare_options', method: 'POST', href: `${current}/options`,
      summary: 'Prepare current options for this Request.',
      input: { idempotencyKey, revision: view.revision },
    })
  } else if (view.state === 'routes_ready') {
    actions.push(
      {
        relation: 'change_request', method: 'POST', href: `${current}/messages`,
        summary: 'Change what matters and prepare a new current choice without confirming this one. '
          + 'To replace one statement, also send replacesPriorStatement with its exact current text. '
          + 'Only when reporting that one displayed option cannot work, also send its routeRef as reportedRouteRef.',
        input: {
          idempotencyKey,
          expectedRevision: view.revision,
          message: '<natural-language change>',
        },
      },
      {
        relation: 'confirm_option', method: 'POST', href: `${current}/confirmation`,
        summary: 'Confirm one current option without starting it.',
        input: { idempotencyKey, revision: view.revision, routeRef: '<routeRef from decision.routes>' },
      },
    )
  } else if (view.state === 'route_confirmed') {
    actions.push({
      relation: 'start_confirmed_option', method: 'POST', href: `${current}/run`,
      summary: 'Start the exact option already confirmed.', input: { idempotencyKey },
    })
  } else if (view.state === 'unsupported') {
    actions.push({
      relation: 'change_request', method: 'POST', href: `${current}/messages`,
      summary: view.unsupportedRecovery?.nextStep.summary
        ?? 'Change the request in ordinary language and keep working from the same Request.',
      input: {
        idempotencyKey,
        expectedRevision: view.revision,
        message: '<natural-language change>',
      },
    })
  } else if (view.state === 'in_progress' || view.state === 'preparing_options') {
    actions.push({
      relation: 'inspect_progress', method: 'GET', href: current,
      summary: 'Inspect the latest state of this Request.',
    })
    if (view.state === 'in_progress') {
      actions.push({
        relation: 'inspect_evidence', method: 'GET', href: `${current}/evidence`,
        summary: 'Inspect the evidence AE currently holds for this work.',
      })
      actions.push({
        relation: 'report_problem', method: 'POST', href: `${current}/problems`,
        summary: 'Report a problem against this Request for review.',
        input: {
          idempotencyKey,
          category: '<incorrect_result | unexpected_cost | duplicate_charge_or_effect | privacy_concern | could_not_stop | other>',
          summary: '<problem summary>', affectedStep: '<step number from evidence>',
          evidenceReceiptRefs: [],
          visibility: 'customer_and_ae_only',
        },
      })
      const cancellation = view.activity?.cancellation
      if (cancellation === 'available_before_next_step'
        || (typeof cancellation === 'object' && cancellation.state === 'available')) {
        actions.push({
          relation: 'cancel', method: 'POST', href: `${current}/cancellation`,
          summary: 'Stop the current Request before any business step begins.',
          input: { idempotencyKey, mode: 'current_and_downstream' },
        })
      }
      if (view.progress !== undefined && view.progress.current.step < view.progress.total
        && (view.progress.current.state === 'contacting'
          || view.progress.current.state === 'awaiting_result')) {
        actions.push({
          relation: 'stop_after_current', method: 'POST', href: `${current}/cancellation`,
          summary: 'Let the current business step finish, then stop before the next business begins.',
          input: { idempotencyKey, mode: 'after_current_step' },
        })
      }
    }
  } else if (view.state === 'needs_attention' || view.state === 'outcome_unknown' || view.state === 'failed') {
    if (view.state !== 'failed') {
      actions.push({
        relation: 'inspect_progress', method: 'GET', href: current,
        summary: 'Resume this Request, then follow the latest safe action.',
      })
    } else if (view.nextAction === 'revise_request') {
      actions.push({
        relation: 'change_request', method: 'POST', href: `${current}/messages`,
        summary: 'Revise the request in ordinary language and continue from the same Request.',
        input: { idempotencyKey, expectedRevision: view.revision, message: '<natural-language change>' },
      })
    }
    if (view.state === 'needs_attention' && view.nextAction === 'retry' && view.revision > 0) {
      actions.push({
        relation: 'prepare_options', method: 'POST', href: `${current}/options`,
        summary: view.decision?.outcome.kind === 'routes_expired'
          ? 'Prepare a new current choice because the previous options expired.'
          : 'Try preparing current options again.',
        input: { idempotencyKey, revision: view.revision },
      })
    }
    if (view.revision > 0) {
      actions.push(
        {
          relation: 'inspect_evidence', method: 'GET', href: `${current}/evidence`,
          summary: 'Inspect the evidence AE currently holds for this Request.',
        },
        {
          relation: 'report_problem', method: 'POST', href: `${current}/problems`,
          summary: 'Report a problem against this Request for review.',
          input: {
            idempotencyKey,
            category: '<incorrect_result | unexpected_cost | duplicate_charge_or_effect | privacy_concern | could_not_stop | other>',
            summary: '<problem summary>', affectedStep: '<step number from evidence>',
            evidenceReceiptRefs: [],
            visibility: 'customer_and_ae_only',
          },
        },
      )
    }
  }

  return customerRequestAgentNavigationSchema.parse({ current, actions })
}
