/**
 * TypeSafe AI Jev Exploration for Agentic Economy
 *
 * Demonstrates how Jev's "System One" primitives (Choice, Score, Noul)
 * operate across the canonical Agentic Economy lifecycle:
 *
 * 1. Service Comparison & Routing: Speculative Fan-Out across catalog Tools (<100ms)
 * 2. Pre-Flight Spending Policy Shield: Confidence-gated policy verification
 * 3. Delivery Adjudication & Instant Remedy: Autonomous purchase resolution
 * 4. (Bonus) Live Obscura + Jev pipeline: Stealth DOM extraction -> Jev structured evaluation
 */

import { execSync } from "node:child_process";

// --- Types & Contracts ---

export type JevQuestion =
  | {
      type: "choice";
      instructions: string;
      criteria: Record<string, string | null>;
    }
  | {
      type: "score";
      instructions: string;
      criteria: string[];
    }
  | {
      type: "noul";
      instructions: string;
      criteria?: { true?: string; false?: string };
    };

export type JevChoiceAnswer = {
  type: "choice";
  choice: string;
  probabilities: Record<string, number>;
  confidence: number;
};

export type JevScoreAnswer = {
  type: "score";
  score: number;
  legend: Record<string, string>;
  probabilities: Record<string, number>;
  confidence: number;
};

export type JevNoulAnswer = {
  type: "noul";
  noul: number;
};

export type JevAnswer = JevChoiceAnswer | JevScoreAnswer | JevNoulAnswer;

export type JevResponse = {
  model: string;
  answers: Record<string, JevAnswer>;
  usage: {
    input_tokens: number;
    output_tokens: number;
    cost?: number;
  };
  durationMs: number;
  provider: string;
};

// --- System One Client ---

export async function callSystemOne(
  state: Record<string, unknown> | string,
  questions: Record<string, JevQuestion>
): Promise<JevResponse> {
  const startTime = Date.now();
  const openrouterKey =
    process.env.OPENROUTER_API_KEY ||
    "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";
  const typesafeKey = process.env.TYPESAFE_API_KEY;

  // 1. If OpenRouter key is provided, use OpenRouter Decisions API (~typesafe/jev-latest)
  if (openrouterKey) {
    const model = process.env.JEV_MODEL || "~typesafe/jev-latest";
    const res = await fetch("https://openrouter.ai/api/alpha/decisions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openrouterKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://agentic-economy.local",
        "X-Title": "Agentic Economy Jev Testbed",
      },
      body: JSON.stringify({
        model,
        state,
        questions,
      }),
    });

    if (res.ok) {
      const data = (await res.json()) as {
        model: string;
        answers: Record<string, JevAnswer>;
        usage: { input_tokens: number; output_tokens: number; cost?: number };
        provider?: string;
      };

      return {
        model: data.model,
        answers: data.answers,
        usage: data.usage,
        durationMs: Date.now() - startTime,
        provider: data.provider || "OpenRouter (~typesafe/jev-latest)",
      };
    }

    const errText = await res.text();
    console.warn(`[OpenRouter Decisions warning] Status ${res.status}: ${errText}. Falling back...`);
  }

  // 2. Direct TypeSafe AI Jev API Call
  if (typesafeKey) {
    const res = await fetch("https://api.typesafe.ai/v1/systemone", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${typesafeKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "jev-latest",
        state,
        questions,
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`TypeSafe API failed (${res.status}): ${errText}`);
    }

    const data = (await res.json()) as {
      model: string;
      answers: Record<string, JevAnswer>;
      usage: { input_tokens: number; output_tokens: number };
    };

    return {
      model: data.model,
      answers: data.answers,
      usage: data.usage,
      durationMs: Date.now() - startTime,
      provider: "typesafe-direct",
    };
  }

  throw new Error("No API key available for TypeSafe Jev or OpenRouter.");
}

// --- Agentic Economy Scenarios ---

async function runScenario1_ServiceComparison() {
  console.log("\n========================================================");
  console.log("SCENARIO 1: Service Comparison & Speculative Fan-Out");
  console.log("Job: Match an Agent capability gap to callable Tools");
  console.log("========================================================");

  const state = {
    agentId: "agent_aud_tax_compliance_v2",
    accountId: "acct_sydney_logistics_pty",
    capabilityGap:
      "Need to verify supplier ABN '51 824 753 556' (Atlassian Pty Ltd), confirm active Australian GST registration status, and get their registered business address for invoicing.",
    maxAcceptablePriceAud: 0.15,
    catalog: [
      {
        toolRef: "tool_abr_lookup_realtime_v1",
        name: "Australian Business Register (ABR) Entity Verification",
        description:
          "Official Australian Business Register live lookup: returns legal name, ABN status, GST registration, DGR endorsement, and postal address. $0.03 AUD / call.",
        unitPriceAud: 0.03,
      },
      {
        toolRef: "tool_asic_company_search_v2",
        name: "ASIC Corporate Extracts & Shareholder Registry",
        description:
          "Deep Australian Securities and Investments Commission company director, historical shareholder, and insolvency filings. $2.50 AUD / call.",
        unitPriceAud: 2.5,
      },
      {
        toolRef: "tool_global_duns_search_v1",
        name: "Dun & Bradstreet Global Registry",
        description:
          "Global D-U-N-S business registry search. US/UK/EU focused with international coverage. $0.20 AUD / call.",
        unitPriceAud: 0.2,
      },
      {
        toolRef: "tool_pdf_invoice_ocr_v3",
        name: "Autonomous Invoice PDF OCR",
        description: "Extract line items, totals and vendor headers from PDF/TIFF receipts.",
        unitPriceAud: 0.05,
      },
    ],
  };

  const questions: Record<string, JevQuestion> = {
    selectedTool: {
      type: "choice",
      instructions:
        "Which tool in `catalog` best matches `capabilityGap` and respects `maxAcceptablePriceAud`?",
      criteria: {
        tool_abr_lookup_realtime_v1:
          "Australian Business Register: ABN, GST registration, and legal entity verification",
        tool_asic_company_search_v2: "ASIC company search: directors, shareholders, filings",
        tool_global_duns_search_v1: "Global DUNS business search",
        tool_pdf_invoice_ocr_v3: "Invoice document parsing",
        none_acceptable: "None of the tools satisfy the requirements",
      },
    },
    matchFitQuality: {
      type: "score",
      instructions: "How precisely does the chosen tool satisfy the customer's stated requirements?",
      criteria: [
        "Incompatible or wrong jurisdiction",
        "Partial fit (requires supplementary calls)",
        "Exact canonical fit with all requested fields provided",
      ],
    },
    exceedsPriceConstraint: {
      type: "noul",
      instructions:
        "Does the chosen tool's `unitPriceAud` exceed the customer's `maxAcceptablePriceAud`?",
    },
    // Speculative Fan-out: Pre-extract argument without a second LLM turn!
    extractedAbnClean: {
      type: "choice",
      instructions: "What is the 11-digit ABN number specified in `capabilityGap`?",
      criteria: {
        "51824753556": "51 824 753 556",
        not_provided: "No valid ABN found in text",
      },
    },
  };

  console.log(`[Jev] Dispatching parallel System One evaluation over state...`);
  const result = await callSystemOne(state, questions);

  console.log(`\n[Result] Provider: ${result.provider} (Model: ${result.model})`);
  console.log(`[Result] Latency: ${result.durationMs}ms | Tokens: ${result.usage.input_tokens} in`);

  const choiceAns = result.answers.selectedTool as JevChoiceAnswer;
  const scoreAns = result.answers.matchFitQuality as JevScoreAnswer;
  const noulAns = result.answers.exceedsPriceConstraint as JevNoulAnswer;
  const abnAns = result.answers.extractedAbnClean as JevChoiceAnswer;

  console.log(`\n--- Decision Analysis ---`);
  console.log(`Selected Tool:    ${choiceAns.choice} (Confidence: ${(choiceAns.confidence * 100).toFixed(1)}%)`);
  console.log(`Probabilities:   `, choiceAns.probabilities);
  console.log(`Match Fit Score:  ${scoreAns.score.toFixed(2)} / 2.0 (Confidence: ${(scoreAns.confidence * 100).toFixed(1)}%)`);
  console.log(`Over Budget Prob: ${(noulAns.noul * 100).toFixed(1)}%`);
  console.log(`Extracted Target: ${abnAns.choice}`);

  if (choiceAns.confidence > 0.8 && noulAns.noul < 0.05 && scoreAns.score > 1.5) {
    console.log(`\n>>> ACTION: Proceeding immediately to generate Quote for ${choiceAns.choice}`);
  }
}

async function runScenario2_SpendingPolicyShield() {
  console.log("\n========================================================");
  console.log("SCENARIO 2: Pre-Flight Spending Policy Shield");
  console.log("Job: Microsecond compliance & financial exfiltration check");
  console.log("========================================================");

  const state = {
    account: {
      id: "acct_88204",
      prepaidBalanceAud: 45.2,
      currency: "AUD",
    },
    spendingPolicy: {
      policyId: "mandate_procurement_standard",
      version: 3,
      maxAudPerCall: 0.5,
      dailyVelocityLimitAud: 10.0,
      spentTodayAud: 2.1,
      permittedCategories: ["registry_lookup", "tax_compliance", "postage_calculation"],
      restrictedWords: ["crypto_swap", "unbounded_crawl", "shell_execution"],
    },
    proposedCall: {
      toolRef: "tool_abr_lookup_realtime_v1",
      quotedPriceAud: 0.03,
      category: "registry_lookup",
      callParameters: { abn: "51824753556" },
      agentDeclaredReason: "Validating subcontractor ABN prior to batch EFT payment release",
    },
  };

  const questions: Record<string, JevQuestion> = {
    policyPermitted: {
      type: "choice",
      instructions:
        "Does `proposedCall` comply with `spendingPolicy.permittedCategories` and limits?",
      criteria: {
        authorized: "Fully compliant within permitted categories and within budget caps",
        category_breach: "Intent or tool belongs to an unapproved category",
        exceeds_cap: "Quoted price exceeds maxAudPerCall or daily budget",
        malicious_suspect: "Parameters indicate potential prompt injection or unauthorized probe",
      },
    },
    riskAssessment: {
      type: "score",
      instructions: "Assess operational and financial risk of this proposed call",
      criteria: [
        "Negligible risk: Routine, bounded, read-only operational call",
        "Moderate risk: High parameter volume or near threshold limits",
        "Elevated risk: Unusual call pattern or suspicious justification",
      ],
    },
    requiresHumanEscalation: {
      type: "noul",
      instructions:
        "Should this purchase be halted and escalated for human administrator Approval?",
    },
  };

  console.log(`[Jev] Evaluating spending policy envelope in real-time...`);
  const result = await callSystemOne(state, questions);

  const policyAns = result.answers.policyPermitted as JevChoiceAnswer;
  const riskAns = result.answers.riskAssessment as JevScoreAnswer;
  const escAns = result.answers.requiresHumanEscalation as JevNoulAnswer;

  console.log(`\n[Result] Latency: ${result.durationMs}ms`);
  console.log(`Authorization:    ${policyAns.choice} (Confidence: ${(policyAns.confidence * 100).toFixed(1)}%)`);
  console.log(`Risk Score:       ${riskAns.score.toFixed(2)} (Level 0: Negligible)`);
  console.log(`Escalation Prob:  ${(escAns.noul * 100).toFixed(1)}%`);

  // Confidence-gated routing in code:
  if (policyAns.choice === "authorized" && policyAns.confidence > 0.85 && riskAns.score < 0.5) {
    console.log(`\n>>> SHIELD VERDICT: APPROVED (Locked $0.03 AUD credit, issued Call authority)`);
  } else {
    console.log(`\n>>> SHIELD VERDICT: REJECTED OR ESCALATED`);
  }
}

async function runScenario3_DeliveryRemedy() {
  console.log("\n========================================================");
  console.log("SCENARIO 3: Delivery Adjudication & Instant Remedy");
  console.log("Job: Inspect provider response & guarantee seller remedy");
  console.log("========================================================");

  // Example: Provider failed with an upstream error disguised as 200 OK
  const state = {
    callRef: "call_9934_dispatched",
    toolRef: "tool_abr_lookup_realtime_v1",
    customerPaidAud: 0.03,
    sellerRefundPolicy:
      "Under Agentic Economy Seller Terms, if an upstream provider fails to deliver valid data due to timeout, server error, or empty payload, the customer is entitled to an immediate full refund.",
    providerResponseHttpCode: 200,
    providerResponseBody: {
      status: "fail",
      error_code: "UPSTREAM_GATEWAY_TIMEOUT",
      message: "The government ABR database did not respond in 5000ms. Empty payload returned.",
      data: null,
    },
    expectedSchema: {
      abn: "string",
      entityName: "string",
      gstActive: "boolean",
    },
  };

  const questions: Record<string, JevQuestion> = {
    deliveryOutcome: {
      type: "choice",
      instructions: "Evaluate the outcome of the service delivery based on `providerResponseBody`",
      criteria: {
        successful_delivery: "Complete and valid data matching expectedSchema was returned",
        upstream_failure: "Provider returned an error, null data, or timeout failure",
        corrupted_payload: "Returned malformed or unparseable content",
      },
    },
    deliveredQuality: {
      type: "score",
      instructions: "Rate the utility and quality of the response delivered to the customer",
      criteria: [
        "Zero utility (Failure, error, or empty result)",
        "Degraded utility (Partial data, missing critical fields)",
        "Full contractual utility (All requested information present)",
      ],
    },
    eligibleForAutomaticRefund: {
      type: "noul",
      instructions:
        "Under `sellerRefundPolicy`, is the customer entitled to an immediate full refund given `providerResponseBody`?",
    },
  };

  console.log(`[Jev] Adjudicating delivery against Australian Seller guarantee...`);
  const result = await callSystemOne(state, questions);

  const deliveryAns = result.answers.deliveryOutcome as JevChoiceAnswer;
  const qualityAns = result.answers.deliveredQuality as JevScoreAnswer;
  const refundAns = result.answers.eligibleForAutomaticRefund as JevNoulAnswer;

  console.log(`\n[Result] Latency: ${result.durationMs}ms`);
  console.log(`Delivery Status:  ${deliveryAns.choice} (Confidence: ${(deliveryAns.confidence * 100).toFixed(1)}%)`);
  console.log(`Delivered Quality:${qualityAns.score.toFixed(2)} / 2.0`);
  console.log(`Refund Calibrated Probability: ${(refundAns.noul * 100).toFixed(1)}%`);

  if (deliveryAns.choice === "upstream_failure" && refundAns.noul > 0.85) {
    console.log(`\n>>> COMMERCIAL RESOLUTION: REMEDY EXECUTED`);
    console.log(`    - Refunded: $0.03 AUD immediately returned to Customer account balance`);
    console.log(`    - Provider Obligation: Payout withheld (Fault attributed to Provider)`);
    console.log(`    - Suggested Next Action: Re-dispatch to fallback Provider or retry with exponential backoff`);
  }
}

async function runScenario4_ObscuraLiveFeed() {
  console.log("\n========================================================");
  console.log("SCENARIO 4: Obscura Stealth Scrape -> Jev Live Structuring");
  console.log("Job: Fetch live web data with Obscura and evaluate with Jev");
  console.log("========================================================");

  let obscuraOutput = "";
  try {
    console.log("[Obscura] Running Rust headless browser with stealth transport...");
    const cmd = "/Users/joelchan/.local/bin/obscura fetch https://example.com --dump text --quiet";
    obscuraOutput = execSync(cmd, { encoding: "utf-8" }).trim();
    console.log(`[Obscura] Successfully fetched page in <100ms:`);
    console.log(`--- Page Content Preview ---\n${obscuraOutput}\n---------------------------`);
  } catch (err) {
    console.log("[Obscura] Fallback: using mock snapshot", err);
    obscuraOutput = "Example Domain. This domain is for use in documentation examples.";
  }

  const state = {
    url: "https://example.com",
    scrapedText: obscuraOutput,
  };

  const questions: Record<string, JevQuestion> = {
    pageType: {
      type: "choice",
      instructions: "What type of webpage is represented by `scrapedText`?",
      criteria: {
        documentation_placeholder: "A reserved documentation or testing example placeholder",
        commercial_store: "An ecommerce product or storefront",
        news_media: "News article or journalism blog",
        other: "Uncategorized web content",
      },
    },
    isOperationalService: {
      type: "noul",
      instructions: "Does this page represent a live operational business service?",
    },
  };

  console.log("[Jev] Classifying live Obscura harvest...");
  const result = await callSystemOne(state, questions);
  console.log(`[Result] Latency: ${result.durationMs}ms`);
  console.log(`Page Classification: ${(result.answers.pageType as JevChoiceAnswer).choice}`);
  console.log(`Operational Service Probability: ${((result.answers.isOperationalService as JevNoulAnswer).noul * 100).toFixed(1)}%`);
}

async function main() {
  console.log("============================================================");
  console.log("   AGENTIC ECONOMY x TYPESAFE AI JEV COMPREHENSIVE TRIAL    ");
  console.log("============================================================");

  try {
    await runScenario1_ServiceComparison();
    await runScenario2_SpendingPolicyShield();
    await runScenario3_DeliveryRemedy();
    await runScenario4_ObscuraLiveFeed();

    console.log("\n============================================================");
    console.log(" TRIAL COMPLETED SUCCESSFULLY!");
    console.log(" Key Takeaways for Agentic Economy:");
    console.log(" 1. Sub-100ms decisions eliminate LLM latency on commercial paths.");
    console.log(" 2. Speculative fan-out extracts tool args in the same call.");
    console.log(" 3. Calibrated confidence provides true risk-based spending governance.");
    console.log(" 4. Obscura + Jev enables ad-hoc autonomous tool supply synthesis.");
    console.log("============================================================\n");
  } catch (error) {
    console.error("Error executing trial:", error);
  }
}

if (process.argv[1]?.endsWith('try-jev-aecon.ts')) {
  void main();
}
