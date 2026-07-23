# Phase 3C Plan06 comprehension instrument

Status: frozen before answers, with no participant sessions run.

Decision supported: determine whether an eligible evaluator can distinguish the
paid operation’s consequence, truth boundaries, and only safe continuation
without being taught the answer.

The canonical JSON block below is the complete frozen instrument. Its
`displayedDigest` is computed over canonical UTF-8 JSON after removing exactly
the top-level `displayedDigest` and `answerStorage` members. Object keys are
sorted lexicographically at every depth; array order is preserved; strings,
numbers, booleans, and null use JSON encoding; no whitespace is emitted.
SHA-256 is rendered as `sha256:` plus 64 lowercase hexadecimal characters.

`answerStorage` is excluded so later anonymous responses cannot change the
instrument identity. It must remain empty here; responses belong only in the
separate results envelope. The scorer also carries the frozen digest as a
constant, so changing the instrument and merely recomputing the displayed
field is refused as drift.

Do not give this file, repository access, source paths, scoring policy, or
answer key to a participant. A participant receives only the stimulus fields,
question prompts and option labels, in their assigned order. Technical details
remain closed.

<!-- PLAN06_INSTRUMENT_JSON_START -->
{
  "schema": "ae-paid-operation-comprehension-instrument:v1",
  "displayedDigest": "sha256:526b009ddbf476758a06abf5768fe8459a1a5c29411c98ebfd5d131084452719",
  "answerStorage": {
    "excludedFromDigest": true,
    "path": ".planning/phases/03c-hosted-paid-operation-product-trial/03C-COMPREHENSION-RESULTS.json",
    "participantAnswers": []
  },
  "freeze": {
    "baseRevision": "7a7ecbfdfcb04920e38ba79a168f8eac720224e8",
    "baseTree": "d2c838e3243535a65da53e7542906b0ea8dc58a0",
    "plan05Integrated": true,
    "frozenBeforeAnswers": true,
    "participantAnswersAtFreeze": 0,
    "questionCount": 10
  },
  "evidenceBoundary": {
    "label": "labelled local browser mechanics + authenticated route fixtures",
    "protectedHostedBrowserSession": false,
    "environmentLabel": "Local labelled sandbox",
    "provenanceLabel": "Labelled mock provider",
    "evidenceClass": "local_labelled_sandbox_fixture",
    "participantNotice": "This is a labelled local trial using mock providers and authenticated route fixtures. It is not a protected hosted browser session and no real payment occurs."
  },
  "founderOverride": {
    "statement": "Real-human comprehension may remain unproven without blocking the already-authorized Plan07 source/deploy work, but that does not satisfy P3C-R8’s human-comprehension evidence or upgrade the claim.",
    "plan07MayProceedWithoutHumanPass": true,
    "satisfiesP3CR8HumanComprehension": false,
    "upgradesClaim": false
  },
  "eligibilityPolicy": {
    "humanClass": "declared_human_comprehension_session",
    "automatedAdjunctClass": "automated_model_comprehension",
    "humanMinimumForPass": 3,
    "automatedFreshAgentCount": 3,
    "excluded": [
      "Phase 3C implementers",
      "Phase 3C reviewers",
      "any participant exposed to the answer key",
      "any coached participant",
      "any participant using repository, file, or tool inspection"
    ],
    "privacy": "Anonymous non-PII participant IDs only."
  },
  "scoringPolicy": {
    "minimumAccuracy": 0.9,
    "accuracyAggregation": "correct answers divided by all ten answers across every eligible session in the declared cohort",
    "minimumEligibleHumanSessions": 3,
    "requiredHumanEvidenceClass": "declared_human_comprehension_session",
    "automatedAdjunctEvidenceClass": "automated_model_comprehension",
    "automatedAdjunctCannotSatisfyHumanClass": true,
    "incompleteGoldenJourneyIsNonPass": true,
    "uncertaintyRetryOrProviderSwitchIsHardFail": true,
    "mandatoryAllParticipantQuestionIds": [
      "Q3",
      "Q5",
      "Q7",
      "Q8",
      "Q9",
      "Q10"
    ],
    "resultStatuses": [
      "not_run",
      "pass",
      "fail"
    ],
    "initialStatus": "not_run"
  },
  "responseContract": {
    "schema": "ae-paid-operation-comprehension-response:v1",
    "participantIdPatterns": {
      "declared_human_comprehension_session": "^human-[a-z0-9]{8}$",
      "automated_model_comprehension": "^agent-[a-z0-9]{8}$"
    },
    "requiredTopLevelFields": [
      "schema",
      "participantId",
      "class",
      "counterbalanceAssignment",
      "scenarioOrder",
      "completedScenarioIds",
      "goldenJourneyCompleted",
      "eligibility",
      "answers",
      "friction"
    ],
    "answerShape": {
      "questionId": "Q1 through Q10, exactly once each",
      "selectedOptionId": "one option ID printed with that question"
    },
    "eligibilityFields": [
      "independent",
      "humanParticipant",
      "freshAgentContext",
      "phase3cImplementer",
      "phase3cReviewer",
      "answerKeyExposed",
      "coachingReceived",
      "participantSafePacketOnly",
      "repoInspection",
      "fileInspection",
      "toolInspection"
    ],
    "frictionFields": [
      "durationMinutes",
      "backtracks",
      "helpRequests",
      "confusingScenarioIds",
      "notes",
      "containsPii"
    ]
  },
  "counterbalanceAssignments": {
    "A": [
      "GOLDEN",
      "AUTHORITY_REFUSAL",
      "POSSIBLY_SUBMITTED",
      "INVALID_RESULT",
      "RECONCILED_NOT_SETTLED",
      "STALE_DUPLICATE",
      "READ_OUTAGE",
      "COMPLETED_RESTORE"
    ],
    "B": [
      "GOLDEN",
      "STALE_DUPLICATE",
      "READ_OUTAGE",
      "COMPLETED_RESTORE",
      "AUTHORITY_REFUSAL",
      "POSSIBLY_SUBMITTED",
      "INVALID_RESULT",
      "RECONCILED_NOT_SETTLED"
    ],
    "C": [
      "GOLDEN",
      "INVALID_RESULT",
      "RECONCILED_NOT_SETTLED",
      "STALE_DUPLICATE",
      "READ_OUTAGE",
      "COMPLETED_RESTORE",
      "AUTHORITY_REFUSAL",
      "POSSIBLY_SUBMITTED"
    ]
  },
  "stimuli": [
    {
      "id": "GOLDEN",
      "kind": "forward_golden_path",
      "participantTitle": "Forward journey",
      "participantFrames": [
        {
          "frame": "Evidence boundary",
          "copy": [
            "Labelled local browser mechanics + authenticated route fixtures.",
            "Local labelled sandbox. Labelled mock providers. No real payment.",
            "This is not a protected hosted browser session."
          ]
        },
        {
          "frame": "Sandbox setup",
          "copy": [
            "Task: Get the latest BTC price in USD.",
            "Choose one labelled mock fixture for this evaluator trial. No real payment.",
            "Mock provider A and Mock provider B each show Operation revision 1 and a $0.01 USD maximum.",
            "Mock provider A is selected, then Create sandbox operation is used."
          ]
        },
        {
          "frame": "Ready for permission",
          "copy": [
            "Provider: Mock provider A.",
            "Maximum charge: Up to $0.01 USD.",
            "Data shared: BTC and USD.",
            "Nothing has been sent or paid. Review the mock provider, shared data and maximum charge.",
            "Available choices: Authorize up to $0.01 or Do not authorize."
          ]
        },
        {
          "frame": "Payment prepared",
          "copy": [
            "Permission recorded. Nothing has been submitted yet.",
            "The next available action is Continue operation."
          ]
        },
        {
          "frame": "Result received",
          "copy": [
            "Payment request: Observed by provider.",
            "Payment outcome: $0.01 settled in recorded sandbox evidence.",
            "Result: Validated.",
            "The result was received and validated. The mock provider's recorded evidence reports $0.01 settled."
          ]
        },
        {
          "frame": "Reload and new local page",
          "copy": [
            "The same completed operation, payment outcome, result truth and safe action are shown.",
            "No new operation, payment request or release is created."
          ]
        },
        {
          "frame": "Structured-agent adjunct",
          "copy": [
            "The assistant creates through evaluator setup, then follows only the next action offered by the latest response.",
            "It does not invent a later action, provider or payment outcome."
          ]
        }
      ]
    },
    {
      "id": "AUTHORITY_REFUSAL",
      "kind": "goblin",
      "participantTitle": "Permission refused",
      "participantFrames": [
        {
          "frame": "Not sent",
          "copy": [
            "You did not authorize this operation.",
            "Nothing was sent to the provider and no payment request was submitted.",
            "The current operation can only be reviewed."
          ]
        }
      ]
    },
    {
      "id": "POSSIBLY_SUBMITTED",
      "kind": "goblin",
      "participantTitle": "Paid request may have been submitted",
      "participantFrames": [
        {
          "frame": "Needs checking",
          "copy": [
            "The provider may have received the payment request.",
            "Settlement unknown.",
            "AE will not try again until the exact payment is checked.",
            "The only available action is Check existing payment."
          ]
        },
        {
          "frame": "Assistant view",
          "copy": [
            "The latest response offers one action: ask AE to check this existing payment for the current operation.",
            "The caller is not asked to provide evidence or claim whether the payment settled."
          ]
        }
      ]
    },
    {
      "id": "INVALID_RESULT",
      "kind": "goblin",
      "participantTitle": "Returned result could not be validated",
      "participantFrames": [
        {
          "frame": "Result not validated",
          "copy": [
            "Payment may have occurred, but the returned result could not be validated.",
            "The only available action is Check existing payment.",
            "There is no retry or provider-change action."
          ]
        }
      ]
    },
    {
      "id": "RECONCILED_NOT_SETTLED",
      "kind": "goblin",
      "participantTitle": "Earlier payment checked and not settled",
      "participantFrames": [
        {
          "frame": "Checked — not paid",
          "copy": [
            "Evidence shows the earlier payment was not settled.",
            "A new result requires a new operation and permission.",
            "The old operation can be reviewed; starting again is a separate creation boundary."
          ]
        }
      ]
    },
    {
      "id": "STALE_DUPLICATE",
      "kind": "goblin",
      "participantTitle": "Repeated or out-of-date action",
      "participantFrames": [
        {
          "frame": "Already recorded",
          "copy": [
            "This update was already recorded.",
            "No second payment request or operation was created.",
            "Only the current durable continuation remains."
          ]
        },
        {
          "frame": "Operation changed",
          "copy": [
            "This operation changed since the page was loaded.",
            "The latest durable state is shown; the previous action was not applied again.",
            "Inspect the latest state instead of replaying the action."
          ]
        }
      ]
    },
    {
      "id": "READ_OUTAGE",
      "kind": "goblin",
      "participantTitle": "Durable record cannot be loaded",
      "participantFrames": [
        {
          "frame": "Operation not loaded",
          "copy": [
            "AE could not load the durable operation record.",
            "Reload before taking another action.",
            "Reload operation is read-only and is the only available action."
          ]
        }
      ]
    },
    {
      "id": "COMPLETED_RESTORE",
      "kind": "goblin",
      "participantTitle": "Completed operation restored",
      "participantFrames": [
        {
          "frame": "Restored operation",
          "copy": [
            "The same completed local operation is shown after reload and in a new page.",
            "Its provider, payment outcome, result truth and current version have the same meaning.",
            "No new request, payment, operation or effect was created."
          ]
        }
      ]
    }
  ],
  "questions": [
    {
      "id": "Q1",
      "concept": "evaluator-only setup versus product information architecture",
      "prompt": "What is the Sandbox setup page in this trial?",
      "mandatoryAllParticipantGate": false,
      "scenarioRefs": [
        "GOLDEN"
      ],
      "options": [
        {
          "id": "Q1-A",
          "label": "AE's normal public place for every customer to compare providers."
        },
        {
          "id": "Q1-B",
          "label": "Evaluator-only trial setup for choosing a labelled mock fixture; it is not AE's normal product navigation."
        },
        {
          "id": "Q1-C",
          "label": "A protected wallet page for making a real BTC payment."
        }
      ],
      "correctOptionId": "Q1-B"
    },
    {
      "id": "Q2",
      "concept": "provider selection outside the card and new invocation boundary",
      "prompt": "Where is the mock provider chosen, and what does a later provider change mean?",
      "mandatoryAllParticipantGate": false,
      "scenarioRefs": [
        "GOLDEN",
        "RECONCILED_NOT_SETTLED"
      ],
      "options": [
        {
          "id": "Q2-A",
          "label": "Inside the paid-operation card; changing provider keeps the same permission and payment."
        },
        {
          "id": "Q2-B",
          "label": "AE automatically changes provider during uncertainty while keeping the current operation.",
          "hardFailReason": "provider_switch_during_uncertainty"
        },
        {
          "id": "Q2-C",
          "label": "In evaluator setup outside the paid-operation card; a safe later change starts a new operation, permission and payment boundary."
        }
      ],
      "correctOptionId": "Q2-C"
    },
    {
      "id": "Q3",
      "concept": "material consequence and what leaves AE",
      "prompt": "At Ready for permission, what consequence is being considered and what may leave AE only if permission is granted?",
      "mandatoryAllParticipantGate": true,
      "scenarioRefs": [
        "GOLDEN",
        "AUTHORITY_REFUSAL"
      ],
      "options": [
        {
          "id": "Q3-A",
          "label": "The exact operation may share BTC and USD with Mock provider A and submit a payment request capped at $0.01 USD; before permission, nothing has been sent or paid."
        },
        {
          "id": "Q3-B",
          "label": "The provider has already received BTC and USD, and permission only changes how the page is labelled."
        },
        {
          "id": "Q3-C",
          "label": "Only a payment leaves AE; no task data is shared with the provider."
        },
        {
          "id": "Q3-D",
          "label": "Permission allows any later provider and any charge because this is a sandbox."
        }
      ],
      "correctOptionId": "Q3-A"
    },
    {
      "id": "Q4",
      "concept": "pre-authority versus payment prepared",
      "prompt": "What is the difference between Ready for permission and Payment prepared?",
      "mandatoryAllParticipantGate": false,
      "scenarioRefs": [
        "GOLDEN"
      ],
      "options": [
        {
          "id": "Q4-A",
          "label": "They mean the same thing; either label can appear before or after permission."
        },
        {
          "id": "Q4-B",
          "label": "Ready for permission means permission has not been recorded and nothing was sent or paid; Payment prepared means permission is recorded but no payment request was submitted."
        },
        {
          "id": "Q4-C",
          "label": "Payment prepared means the provider has settled the payment but the result is still loading."
        }
      ],
      "correctOptionId": "Q4-B"
    },
    {
      "id": "Q5",
      "concept": "separate payment request, payment outcome and result truth",
      "prompt": "When the completed local scenario says the payment request was observed, recorded sandbox evidence reports settlement, and the result was validated, what should you conclude?",
      "mandatoryAllParticipantGate": true,
      "scenarioRefs": [
        "GOLDEN",
        "INVALID_RESULT"
      ],
      "options": [
        {
          "id": "Q5-A",
          "label": "A validated result proves independent payment settlement, so the payment statements no longer matter."
        },
        {
          "id": "Q5-B",
          "label": "A provider payment statement automatically proves the result is usable."
        },
        {
          "id": "Q5-C",
          "label": "These are three separate truths: request observation, sandbox-recorded payment outcome, and result validation; none silently proves the others."
        },
        {
          "id": "Q5-D",
          "label": "No conclusion is possible because all sandbox information must be ignored."
        }
      ],
      "correctOptionId": "Q5-C"
    },
    {
      "id": "Q6",
      "concept": "only safe continuation during uncertainty",
      "prompt": "The paid request may have been submitted and settlement is unknown. What should happen next?",
      "mandatoryAllParticipantGate": false,
      "scenarioRefs": [
        "POSSIBLY_SUBMITTED",
        "INVALID_RESULT"
      ],
      "options": [
        {
          "id": "Q6-A",
          "label": "Check the existing payment for this exact operation; do not resend, retry, or change provider while uncertainty remains."
        },
        {
          "id": "Q6-B",
          "label": "Retry the same paid request immediately because no settlement proof is visible.",
          "hardFailReason": "retry_during_uncertainty"
        },
        {
          "id": "Q6-C",
          "label": "Switch to the other provider and start again while the first payment is still uncertain.",
          "hardFailReason": "provider_switch_during_uncertainty"
        },
        {
          "id": "Q6-D",
          "label": "Mark the operation failed and continue as though the payment could not have happened."
        }
      ],
      "correctOptionId": "Q6-A"
    },
    {
      "id": "Q7",
      "concept": "intent-only public reconciliation",
      "prompt": "When an assistant follows Check existing payment, what may it tell AE?",
      "mandatoryAllParticipantGate": true,
      "scenarioRefs": [
        "POSSIBLY_SUBMITTED"
      ],
      "options": [
        {
          "id": "Q7-A",
          "label": "Its own claim that the payment settled or did not settle, together with evidence it selected."
        },
        {
          "id": "Q7-B",
          "label": "Only a request to check this exact current operation using the continuation AE returned; AE's trusted side obtains and judges the evidence."
        },
        {
          "id": "Q7-C",
          "label": "The displayed semantic digest as authority to decide the payment outcome."
        },
        {
          "id": "Q7-D",
          "label": "The execute command again so the provider can return a clearer response.",
          "hardFailReason": "retry_during_uncertainty"
        }
      ],
      "correctOptionId": "Q7-B"
    },
    {
      "id": "Q8",
      "concept": "stale and duplicate command behavior",
      "prompt": "What should AE do with an already-recorded action or an action sent from an out-of-date page?",
      "mandatoryAllParticipantGate": true,
      "scenarioRefs": [
        "STALE_DUPLICATE"
      ],
      "options": [
        {
          "id": "Q8-A",
          "label": "Apply it again to make sure the provider received it."
        },
        {
          "id": "Q8-B",
          "label": "Create a replacement operation and hide the old one."
        },
        {
          "id": "Q8-C",
          "label": "Show or inspect the latest durable state, do not apply the old action again, and create no second payment request or operation."
        }
      ],
      "correctOptionId": "Q8-C"
    },
    {
      "id": "Q9",
      "concept": "durable restore without duplicate effect",
      "prompt": "After reload or a new local page restores the completed operation, what must remain true?",
      "mandatoryAllParticipantGate": true,
      "scenarioRefs": [
        "GOLDEN",
        "COMPLETED_RESTORE"
      ],
      "options": [
        {
          "id": "Q9-A",
          "label": "The same operation truth and safe action return; nothing is created, sent to the provider or paid again."
        },
        {
          "id": "Q9-B",
          "label": "A new operation is created so the page can reconstruct the result."
        },
        {
          "id": "Q9-C",
          "label": "The payment is sent again but hidden because the displayed result did not change."
        }
      ],
      "correctOptionId": "Q9-A"
    },
    {
      "id": "Q10",
      "concept": "evidence and claim ceiling",
      "prompt": "What can this frozen trial evidence honestly establish?",
      "mandatoryAllParticipantGate": true,
      "scenarioRefs": [
        "GOLDEN",
        "READ_OUTAGE",
        "COMPLETED_RESTORE"
      ],
      "options": [
        {
          "id": "Q10-A",
          "label": "Protected hosted reachability, real provider fulfilment and independent payment settlement."
        },
        {
          "id": "Q10-B",
          "label": "Only the declared labelled local browser mechanics, authenticated route fixtures and projection behavior; human comprehension remains unproven until eligible humans pass, and automated responses never replace that evidence."
        },
        {
          "id": "Q10-C",
          "label": "Customer value, production safety and compatibility with every non-paid action."
        }
      ],
      "correctOptionId": "Q10-B"
    }
  ],
  "sourceTrace": {
    "administratorOnly": true,
    "participantDisclosureForbidden": true,
    "links": [
      {
        "concept": "setup, provider boundary and one-cent consequence",
        "sources": [
          ".planning/phases/03c-hosted-paid-operation-product-trial/03C-UI-SPEC.md:119-159",
          "tests/unit/server/hosted-paid-operation-creation-api.test.ts:95-127",
          "src/modules/action-invocation/hosted-paid-operation-creation.ts:101-119"
        ]
      },
      {
        "concept": "reserved pre-authority and payment-prepared truth",
        "sources": [
          ".planning/phases/03c-hosted-paid-operation-product-trial/03C-UI-SPEC.md:228-240",
          "src/modules/action-invocation/paid-operation-card-contract.ts:228-262",
          "tests/unit/server/hosted-paid-operation-api.test.ts:400-464"
        ]
      },
      {
        "concept": "separate payment, settlement and result truth",
        "sources": [
          ".planning/phases/03c-hosted-paid-operation-product-trial/03C-UI-SPEC.md:163-175",
          "src/modules/action-invocation/paid-operation-card-contract.ts:179-206",
          "tests/unit/server/hosted-paid-operation-api.test.ts:225-260"
        ]
      },
      {
        "concept": "intent-only reconcile and uncertainty hard stop",
        "sources": [
          ".planning/phases/03c-hosted-paid-operation-product-trial/03C-UI-SPEC.md:310-332",
          "tests/unit/server/hosted-paid-operation-api.test.ts:466-498",
          ".planning/adr/ADR-021-hosted-paid-operation-trial-boundaries.md:54-72"
        ]
      },
      {
        "concept": "golden counters and zero-effect restore",
        "sources": [
          "tests/e2e/paid-operation-hosted-sandbox.spec.ts:24-98",
          ".planning/phases/03c-hosted-paid-operation-product-trial/03C-05-SUMMARY.md:107-143"
        ],
        "counters": [
          "ready_for_permission version 3: invocation 1, effect 0, release 0, command 0",
          "payment_prepared version 4: invocation 1, effect 0, release 0, command 1",
          "result_received version 5: invocation 1, effect 1, release 1, command 2",
          "reload/new-page restore delta: invocation 0, effect 0, release 0, command 0"
        ]
      },
      {
        "concept": "named goblins and local evidence mapping",
        "sources": [
          "tests/e2e/paid-operation-hosted-sandbox.spec.ts:101-146",
          "tests/e2e/paid-operation-hosted-sandbox.spec.ts:238-247",
          ".planning/phases/03c-hosted-paid-operation-product-trial/03C-05-SUMMARY.md:144-201"
        ]
      },
      {
        "concept": "ten-question consolidation from the accepted twelve-prompt contract",
        "sources": [
          ".planning/phases/03c-hosted-paid-operation-product-trial/03C-UI-SPEC.md:513-540",
          ".planning/phases/03c-hosted-paid-operation-product-trial/03C-06-PLAN.md:32-74"
        ],
        "resolution": "Exactly ten questions preserve all twelve accepted concepts by combining provider-location with new-invocation behavior, payment with settlement/result separation, and visible stop with safe-continuation questions. Plan06's required gates Q3, Q5, Q7, Q8, Q9 and Q10 control."
      }
    ]
  },
  "claimCeilings": {
    "task1": "Predeclared instrument, scorer, source inspection, and source-linked local fixture evidence only. Human comprehension, automated-model comprehension, hosted reachability, accessibility in use, provider fulfilment, payment, settlement, production safety, customer value, and non-paid compatibility remain unproven.",
    "declaredHumanPass": "Declared human comprehension for the eligible recorded cohort only. This is not population usability, hosted reachability, accessibility in use, provider fulfilment, real payment or settlement, production safety, customer value, demand, or non-paid compatibility evidence.",
    "automatedAdjunctPass": "Automated-model comprehension for exactly three eligible fresh-agent sessions only. It is adjunct model evidence and cannot satisfy or overwrite declared human comprehension or P3C-R8."
  }
}
<!-- PLAN06_INSTRUMENT_JSON_END -->

## Administration rule

Freeze means no prompt, option, scenario, eligibility rule, threshold, hard-fail
condition, or claim ceiling changes after the first answer exists. If a defect
requires a change, close the current run as invalid, create a new instrument
version and digest before any new answers, and retain this version as rejected
history.

The participant sees the golden journey first, then only the goblin order for
assignment A, B, or C. Ask all ten questions after the assigned tape. Record
the selected option IDs before any correction. Do not explain errors until the
session has been sealed.

Friction is not correctness. Record time, backtracks, help requests, confusing
scenario IDs and a short non-PII note separately. Help that reveals an answer
is coaching and makes the session ineligible.

## Initial decision

`not_run` / `unproven`. No participant answers exist. Neither
`declared_human_comprehension_session` nor
`automated_model_comprehension` evidence has been earned.
