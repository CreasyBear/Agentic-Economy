import fs from "node:fs";
import path from "node:path";

const repositoryRoot = process.cwd();
const ledgerPath = path.join(
  repositoryRoot,
  ".planning/whop-docs/WHOP-SCAVENGE-PAPERCUTS.md",
);
const logPath = path.join(
  repositoryRoot,
  ".planning/whop-docs/WHOP-SCAVENGE-OX-LOG.jsonl",
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
  const headings = [...markdown.matchAll(/^## (WHOP-\d{3}) —[^\n]*/gm)];
  return headings.map((heading, index) => ({
    id: heading[1],
    text: markdown
      .slice(
        heading.index,
        headings[index + 1]?.index ?? markdown.length,
      )
      .trimEnd(),
  }));
}

const items = extractItems(ledger).filter(
  ({ id, text }) =>
    text.includes("**Ox review:** PENDING") &&
    (requestedIds.size === 0 || requestedIds.has(id)),
);

if (items.length === 0) {
  console.log("No pending Ox reviews.");
  process.exit(0);
}

console.log(
  `Starting ${items.length} fresh ${model} reviews with concurrency ${concurrency}.`,
);

const systemPrompt = `You are an independent product economist and market-maker reviewing one evidence-backed finding about Whop for Agentic Economy (AE).

AE is a future-facing market/source where agents or people dynamically acquire external units of work. AE does not need a unique mechanism. It may begin in one narrow market and expand horizontally. Judge this as a customer-and-market question, not an agent protocol question. Do not propose trust protocols, verification layers, or generic onboarding. Do not inherit any opinion from other reviews.

Evaluate only the supplied item. Distinguish customer demand, supply, liquidity, operator role, economic capture, and dependency on Whop. A risky or scammy-looking mechanism may still be economically useful; assess it on merit. Conversely, an attractive API is not an AE opportunity if Whop owns the economics and AE adds no market-making value.

Respond in 110–180 words using exactly these labels:
Verdict: ENDORSE | MODIFY | REJECT | WATCH
Independent read: <your concrete opinion>
What is valuable: <strongest economic value, or none>
Hidden assumption: <most important unproven premise>
Market-making implication: <passive, active, principal, or not market making, and why>
Best next test: <smallest demand/economic test>
Disposition: SCAVENGE | PARTNER | COMPETE | AVOID | MONITOR`;

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function requestReview(item, attempt = 1) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 180_000);
  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "X-Title": "Agentic Economy Whop Scavenge Review",
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: `Review this single finding independently. It is the only item in this conversation.\n\n${item.text.replace("**Ox review:** PENDING", "")}`,
          },
        ],
        max_tokens: 1_400,
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
    console.log(`${item.id} attempt ${attempt} failed; retrying.`);
    await sleep(delay);
    return requestReview(item, attempt + 1);
  } finally {
    clearTimeout(timeout);
  }
}

function writeCheckpoint(item, review) {
  const reviewedAt = new Date().toISOString();
  const quotedReview = review.content
    .split("\n")
    .map((line) => `> ${line}`)
    .join("\n");
  const replacement = [
    "**Ox review:** OX_REVIEWED",
    "",
    `- **Fresh instance:** yes — one isolated single-turn request with no prior Ox history.`,
    `- **Model:** \`${model}\`.`,
    `- **OpenRouter response:** \`${review.responseId ?? "not_returned"}\`.`,
    `- **Reviewed at:** ${reviewedAt}.`,
    "",
    quotedReview,
  ].join("\n");

  const currentItem = extractItems(ledger).find(({ id }) => id === item.id);
  if (!currentItem || !currentItem.text.includes("**Ox review:** PENDING")) {
    throw new Error(`Could not find pending placeholder for ${item.id}`);
  }

  const updatedItem = currentItem.text
    .replace("- **Tracking status:** CAPTURED.", "- **Tracking status:** OX_REVIEWED.")
    .replace("**Ox review:** PENDING", replacement);
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
      const review = await requestReview(item);
      writeCheckpoint(item, review);
      completed += 1;
      console.log(`${item.id} reviewed (${completed}/${items.length}).`);
    } catch (error) {
      failures.push({ id: item.id, error: String(error) });
      console.error(`${item.id} failed after retries.`);
    }
  }
}

await Promise.all(
  Array.from({ length: Math.min(concurrency, items.length) }, () => worker()),
);

const finalItems = extractItems(fs.readFileSync(ledgerPath, "utf8"));
const pending = finalItems.filter(({ text }) =>
  text.includes("**Ox review:** PENDING"),
);
const reviewed = finalItems.filter(({ text }) =>
  text.includes("**Ox review:** OX_REVIEWED"),
);

console.log(
  JSON.stringify({
    total: finalItems.length,
    reviewed: reviewed.length,
    pending: pending.length,
    failures,
  }),
);

if (pending.length > 0) {
  process.exitCode = 1;
}
