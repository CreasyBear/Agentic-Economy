import { runAnswerTurnEvalCase, runAnswerThreadEvalCase } from './eval/answer/lib/evaluators.ts';
import { ANSWER_TURN_EVAL_CASES, ANSWER_THREAD_EVAL_CASES } from './eval/answer/lib/cases.ts';
for (const id of ['turn-paramata-visible-recovery','turn-unsupported-booking-boundary']) {
  const testCase = ANSWER_TURN_EVAL_CASES.find((c) => c.id === id);
  const result = await runAnswerTurnEvalCase(testCase);
  console.log(JSON.stringify({ id, ok: result.ok, problems: result.problems, diagnostics: result.diagnostics }, null, 2));
}
for (const id of ['thread-filter-uses-frozen-evidence','thread-unsupported-follow-up-keeps-boundary']) {
  const testCase = ANSWER_THREAD_EVAL_CASES.find((c) => c.id === id);
  const result = await runAnswerThreadEvalCase(testCase);
  console.log(JSON.stringify({ id, ok: result.ok, problems: result.problems, turns: result.turns.map((turn) => ({ problems: turn.problems, diagnostics: turn.diagnostics })) }, null, 2));
}
