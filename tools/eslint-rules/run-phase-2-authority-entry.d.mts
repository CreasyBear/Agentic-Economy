export type FoundationAuthorityEntryLintResult = Readonly<{
  format: "phase-2-authority-entry-eslint:v1";
  safe: number;
  unsafe: number;
  diagnostics: number;
}>;

export function runFoundationAuthorityEntryLint(): Promise<FoundationAuthorityEntryLintResult>;
