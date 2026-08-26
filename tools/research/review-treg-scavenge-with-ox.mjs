import fs from "node:fs";
import path from "node:path";

const repositoryRoot = process.cwd();
const ledgerPath = path.join(
  repositoryRoot,
  ".planning/reference/treg/TREG-SCAVENGE-PAPERCUTS.md",
);
const logPath = path.join(
  repositoryRoot,
  ".planning/reference/treg/TREG-SCAVENGE-OX-LOG.jsonl",
);
const portfolioPath = path.join(
  repositoryRoot,
  ".planning/reference/treg/TREG-OX-PORTFOLIO-REVIEW.md",
);
const model = process.env.OX_REVIEW_MODEL ?? "stealth/ox-alpha";
const concurrency = Number(process.env.OX_REVIEW_CONCURRENCY ?? "4");
const requestedIds = new Set(
  (process.env.OX_REVIEW_IDS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean),
);

const apiKey = process.env.OPENROUTER_API_KEY;
if (!apiKey) {
  throw new Error("OPENROUTER_API_KEY is required");
}

let ledger = fs.readFileSync(ledgerPath, "utf8");

function extractItems(markdown) {
  const headings = [...markdown.matchAll(/^## ([^\n]+)/gm)];
  return headings
    .map((heading, index) => ({
      heading: heading[1],
      start: heading.index,
      end: headings[index + 1]?.index ?? markdown.length,
    }))
    .filter(({ heading }) => /^TREG-\d{3} —/.test(heading))
    .map(({ heading, start, end }) => ({
      id: heading.match(/^(TREG-\d{3})/)[1],
      heading,
      text: markdown.slice(start, end).trimEnd(),
    }));
}

const items = extractItems(ledger).filter(
  ({ id, text }) =>
    !text.includes("**Ox review:** OX_REVIEWED") &&
    (requestedIds.size === 0 || requestedIds.has(id)),
);

const systemPrompt = `You are Ox, an independent product economist and systems strategist reviewing one evidence-backed Treg finding for Agentic Economy (AE).

Context: AE has evidence that paid x402 supply exists but has not yet proven one unfamiliar external agent can complete the end-to-end transaction loop or that repeated demand exists. AE is intentionally cloning Treg's product shape as a start line, while its longer thesis is an economic graph connecting intent, consideration, execution, payment, Qualified Use, productive continuation, supplier earnings, and incentives. The founder feels competitive pressure. Do not reward motion caused only by pressure.

Evaluate only the supplied item. Separate what Treg demonstrably proves from what AE is inferring. Judge customer value, graph compounding, execution leverage, defensibility, opportunity cost, and whether the item belongs before or after the unfamiliar-agent proof. Do not default to extra protocols, validation, onboarding, or generic trust layers. A clean primitive is not automatically a business; a missing feature is not automatically an opportunity.

Respond in 120–190 words using exactly these labels:
Verdict: ENDORSE | MODIFY | REJECT | WATCH
Independent read: <blunt concrete opinion>
What Treg actually proves: <the strongest demonstrated fact, or none>
What AE should do: <specific action and timing>
Hidden assumption: <largest unsupported leap>
Pressure test: <whether competitive pressure should accelerate, narrow, or not affect this item>
Best next evidence: <smallest decisive test>
Disposition: EXACT_CLONE | CLONE_SHAPE | GRAPH_EXTENSION | DEFER | REJECT | FIX_FIRST`;

const portfolioSystemPrompt = `You are Ox acting as a hard-nosed independent CEO and market economist. You are reviewing the complete Treg scavenge portfolio for Agentic Economy (AE).

AE has evidence that paid x402 supply exists but has not proven one unfamiliar external agent can discover, pay for, receive, inspect, and recover one independently supplied Operation end to end. AE is cloning Treg's product shape to reach that start line. Its larger thesis is an economic graph connecting intent, consideration, execution, payment, Qualified Use, productive continuation, supplier earnings, and incentives. The founder says competitive pressure is on.

Give the portfolio judgment straight. Do not confuse engineering completeness, attractive abstractions, or competitor breadth with customer demand. Identify what must be cloned now, what is distraction, whether the graph thesis is real or retrospective storytelling, and what evidence would justify acceleration. Do not prescribe broad onboarding, validation programs, or generic protocol work.

Respond in 700–1100 words with exactly these headings:
# Overall verdict
# Brutal read
# What Treg proves
# What Treg does not prove
# The graph thesis
# Pressure response
# Clone now
# Explicitly defer
# Defensible wedge
# Next 30 days
# Kill conditions

The first line under Overall verdict must be one of: PROCEED | NARROW | PAUSE | PIVOT.`;

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function requestCompletion(messages, maxTokens, title, attempt = 1) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 180_000);
  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "X-Title": title,
      },
      body: JSON.stringify({
        model,
        messages,
        max_tokens: maxTokens,
        reasoning: { effort: "low" },
      }),
      signal: controller.signal,
    });

    const body = await response.text();
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${body.slice(0, 240)}`);
    }

    const parsed = JSON.parse(body);
    const content = parsed?.choices?.[0]?.message?.content?.trim();
    if (!content) {
      throw new Error("Ox returned an empty response");
    }

    return {
      content,
      responseId: parsed.id ?? null,
      provider: parsed.provider ?? null,
      usage: parsed.usage ?? null,
    };
  } catch (error) {
    if (attempt >= 4) {
      throw error;
    }
    const delay = [5_000, 15_000, 35_000][attempt - 1] ?? 35_000;
    console.log(`Request attempt ${attempt} failed; retrying.`);
    await sleep(delay);
    return requestCompletion(messages, maxTokens, title, attempt + 1);
  } finally {
    clearTimeout(timeout);
  }
}

async function requestItemReview(item) {
  return requestCompletion(
    [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: `Review this single finding independently. It is the only ledger item in this conversation.\n\n${item.text}`,
      },
    ],
    1_500,
    "Agentic Economy Treg Scavenge Review",
  );
}

function writeCheckpoint(item, review) {
  const reviewedAt = new Date().toISOString();
  const quotedReview = review.content
    .split("\n")
    .map((line) => `> ${line}`)
    .join("\n");
  const reviewBlock = [
    "",
    "**Ox review:** OX_REVIEWED",
    "",
    "- **Fresh instance:** yes — one isolated single-turn request with no prior Ox history.",
    `- **Model:** \`${model}\`.`,
    `- **OpenRouter response:** \`${review.responseId ?? "not_returned"}\`.`,
    `- **Reviewed at:** ${reviewedAt}.`,
    "",
    quotedReview,
  ].join("\n");

  const currentItem = extractItems(ledger).find(({ id }) => id === item.id);
  if (!currentItem || currentItem.text.includes("**Ox review:** OX_REVIEWED")) {
    throw new Error(`Could not find unreviewed item ${item.id}`);
  }

  const updatedItem = currentItem.text
    .replace(/(\- \*\*Confidence\/status:\*\* [^\n]+) · CAPTURED\./, "$1 · OX_REVIEWED.")
    .concat(reviewBlock);
  ledger = ledger.replace(currentItem.text, updatedItem);
  fs.writeFileSync(`${ledgerPath}.tmp`, ledger, "utf8");
  fs.renameSync(`${ledgerPath}.tmp`, ledgerPath);

  fs.appendFileSync(
    logPath,
    `${JSON.stringify({
      id: item.id,
      model,
      freshInstance: true,
      reviewedAt,
      responseId: review.responseId,
      provider: review.provider,
      usage: review.usage,
    })}\n`,
  );
}

let cursor = 0;
let completed = 0;
const failures = [];

async function worker() {
  while (cursor < items.length) {
    const item = items[cursor];
    cursor += 1;
    try {
      const review = await requestItemReview(item);
      writeCheckpoint(item, review);
      completed += 1;
      console.log(`${item.id} reviewed (${completed}/${items.length}).`);
    } catch (error) {
      failures.push({ id: item.id, error: String(error) });
      console.error(`${item.id} failed after retries: ${String(error)}`);
    }
  }
}

if (items.length > 0) {
  console.log(
    `Starting ${items.length} fresh ${model} reviews with concurrency ${concurrency}.`,
  );
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => worker()),
  );
} else {
  console.log("No unreviewed Treg items.");
}

const finalLedger = fs.readFileSync(ledgerPath, "utf8");
const finalItems = extractItems(finalLedger);
const pending = finalItems.filter(
  ({ text }) => !text.includes("**Ox review:** OX_REVIEWED"),
);
const reviewed = finalItems.filter(({ text }) =>
  text.includes("**Ox review:** OX_REVIEWED"),
);

if (pending.length === 0 && requestedIds.size === 0) {
  const portfolioInput = reviewed
    .map(({ id, heading, text }) => {
      const finding = text.match(/- \*\*Finding:\*\* ([^\n]+)/)?.[1] ?? "";
      const aeMove = text.match(/- \*\*AE move:\*\* ([^\n]+)/)?.[1] ?? "";
      const disposition = text.match(/- \*\*Disposition:\*\* ([^\n]+)/)?.[1] ?? "";
      const oxReview = text.match(/\*\*Ox review:\*\* OX_REVIEWED[\s\S]*?\n\n>([\s\S]*)$/)?.[1]
        ?.replace(/^> ?/gm, "")
        .trim() ?? "";
      return `${id} ${heading.replace(/^TREG-\d{3} — /, "")}\nFinding: ${finding}\nAE move: ${aeMove}\nOriginal disposition: ${disposition}\nOx: ${oxReview}`;
    })
    .join("\n\n");

  const portfolioReview = await requestCompletion(
    [
      { role: "system", content: portfolioSystemPrompt },
      {
        role: "user",
        content: `Here are all 64 independently reviewed Treg findings. Give the portfolio judgment.\n\n${portfolioInput}`,
      },
    ],
    5_000,
    "Agentic Economy Treg Portfolio Pressure Review",
  );
  const reviewedAt = new Date().toISOString();
  const portfolioDocument = `---\n` +
    `title: Treg Ox Portfolio Pressure Review\n` +
    `date: 2026-08-25\n` +
    `model: ${model}\n` +
    `response_id: ${portfolioReview.responseId ?? "not_returned"}\n` +
    `reviewed_at: ${reviewedAt}\n` +
    `context: Independent portfolio judgment after 64 isolated item reviews\n` +
    `---\n\n` +
    `${portfolioReview.content}\n`;
  fs.writeFileSync(portfolioPath, portfolioDocument, "utf8");
  fs.appendFileSync(
    logPath,
    `${JSON.stringify({
      id: "TREG-PORTFOLIO",
      model,
      freshInstance: true,
      reviewedAt,
      responseId: portfolioReview.responseId,
      provider: portfolioReview.provider,
      usage: portfolioReview.usage,
    })}\n`,
  );
  console.log(`Portfolio review written to ${portfolioPath}.`);
}

console.log(
  JSON.stringify({
    total: finalItems.length,
    reviewed: reviewed.length,
    pending: pending.length,
    failures,
    portfolioWritten: fs.existsSync(portfolioPath),
  }),
);

if (pending.length > 0 || failures.length > 0) {
  process.exitCode = 1;
}
