// Fails on high/critical production advisories that are not in .github/audit-allowlist.json (or whose entry expired).
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

type Entry = { id: string; reason: string; expires: string };
type Via = { url?: string; severity?: string; title?: string };

const allow: Entry[] = JSON.parse(readFileSync(".github/audit-allowlist.json", "utf8"));
const raw = (() => {
  try {
    return execFileSync("npm", ["audit", "--omit=dev", "--json"], { encoding: "utf8", maxBuffer: 1 << 26 });
  } catch (e) {
    return (e as { stdout: string }).stdout; // npm audit exits non-zero when vulnerabilities exist
  }
})();
const vulns = Object.values(JSON.parse(raw).vulnerabilities ?? {}) as { via: (Via | string)[] }[];
const found = new Map<string, string>();
for (const v of vulns)
  for (const via of v.via)
    if (typeof via !== "string" && via.url && ["high", "critical"].includes(via.severity ?? ""))
      found.set(via.url.split("/").pop()!, via.title ?? "");

const now = new Date();
const bad = [...found].filter(([id]) => {
  const e = allow.find((a) => a.id === id);
  return !e || new Date(e.expires) < now;
});
for (const [id, title] of found) console.log(`${bad.some(([b]) => b === id) ? "FAIL" : "allowed"} ${id} ${title}`);
if (bad.length) process.exit(1);
console.log("audit gate passed");
