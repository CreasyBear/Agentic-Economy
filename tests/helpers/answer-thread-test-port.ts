import { setAnswerThreadPortForTests } from "@/modules/answer-thread/answer-thread.functions";
import type { FinalizeReservedAnswerTurnArgs } from "@/modules/answer-thread/answer-thread.functions";
import { readCookie, serializeCookie } from "@/lib/http/cookies";
import type {
  AnswerThreadRecord,
  PublicThreadProjection,
} from "@/modules/answer-thread/public";
import { ANSWER_TURN_EXECUTION_LEASE_MS } from "@/modules/answer-thread/answer-thread.schema";
import type {
  AnswerTurnCheckpoint,
  AnswerTurnRecord,
  AnswerTurnReservationRecord,
} from "@/modules/answer-thread/answer-thread.schema";
import type { AnswerToolCallInputRow } from "@/modules/answer-thread/internal/commands";
import { serializeAnswerTurnCheckpoint } from "@/modules/answer-thread/internal/answer-turn-checkpoint";
import { toolCallsMatch } from "@/modules/answer-thread/internal/convex-helpers";
import {
  buildPublicReservationTurn,
  buildPublicThreadProjection,
} from "@/modules/answer-thread/internal/public-projection";
export type AnswerThreadTestStore = {
  threads: Map<string, AnswerThreadRecord>;
  turns: Map<string, AnswerTurnRecord>;
  reservations: Map<string, AnswerTurnReservationRecord>;
  checkpoints: Map<string, AnswerTurnCheckpoint>;
  generations: Map<string, number>;
  shares: Map<
    string,
    { threadId: string; shareToken: string; revoked: boolean }
  >;
  persisted: unknown[];
  finalizationWrites: FinalizeReservedAnswerTurnArgs[];
  reserveError?: unknown;
  persistError?: unknown;
  persistErrors?: unknown[];
  getAnswerThreadError?: unknown;
  getThreadTurnsError?: unknown;
  listSessionThreadsError?: unknown;
  getOwnedThreadProjectionError?: unknown;
  issueShareError?: unknown;
  revokeShareError?: unknown;
  deleteThreadError?: unknown;
};

type PersistedAnswerTurnRow = Record<string, unknown> & {
  turnId: string;
  evidenceJson: string;
  snapshotHash: string;
  createdAt: number;
  toolCalls: readonly AnswerToolCallInputRow[];
  status: AnswerTurnRecord["status"];
};

export function createAnswerThreadTestStore(): AnswerThreadTestStore {
  return {
    threads: new Map(),
    turns: new Map(),
    reservations: new Map(),
    checkpoints: new Map(),
    generations: new Map(),
    shares: new Map(),
    persisted: [],
    finalizationWrites: [],
  };
}

export function installAnswerThreadTestPort(
  store: AnswerThreadTestStore,
): () => void {
  const turnsForThread = (threadId: string): AnswerTurnRecord[] =>
    [...store.turns.values()]
      .filter((turn) => turn.threadId === threadId)
      .sort((left, right) => left.seq - right.seq);

  const reservationsForThread = (
    threadId: string,
  ): AnswerTurnReservationRecord[] =>
    [...store.reservations.values()]
      .filter((reservation) => reservation.threadId === threadId)
      .sort((left, right) => left.seq - right.seq);

  const turnCountForThread = (threadId: string): number => {
    const seenTurnIds = new Set<string>();
    const seenSeqs = new Set<number>();
    let count = 0;
    for (const turn of turnsForThread(threadId)) {
      if (seenTurnIds.has(turn.turnId) || seenSeqs.has(turn.seq)) continue;
      seenTurnIds.add(turn.turnId);
      seenSeqs.add(turn.seq);
      count += 1;
    }
    for (const reservation of reservationsForThread(threadId)) {
      if (buildPublicReservationTurn(reservation) === undefined) continue;
      if (seenTurnIds.has(reservation.turnId) || seenSeqs.has(reservation.seq))
        continue;
      seenTurnIds.add(reservation.turnId);
      seenSeqs.add(reservation.seq);
      count += 1;
    }
    return Math.min(count, 26);
  };

  const publicProjectionForThread = (
    thread: AnswerThreadRecord,
  ): PublicThreadProjection => {
    const persisted = buildPublicThreadProjection(
      thread,
      turnsForThread(thread.threadId),
    );
    const turns: PublicThreadProjection["turns"][number][] = [];
    const seenTurnIds = new Set<string>();
    const seenSeqs = new Set<number>();
    for (const turn of persisted.turns) {
      if (seenTurnIds.has(turn.turnId) || seenSeqs.has(turn.seq)) continue;
      seenTurnIds.add(turn.turnId);
      seenSeqs.add(turn.seq);
      turns.push(turn);
    }
    for (const reservation of reservationsForThread(thread.threadId)) {
      const turn = buildPublicReservationTurn(reservation);
      if (
        turn === undefined ||
        seenTurnIds.has(turn.turnId) ||
        seenSeqs.has(turn.seq)
      )
        continue;
      seenTurnIds.add(turn.turnId);
      seenSeqs.add(turn.seq);
      turns.push(turn);
    }
    turns.sort((left, right) => left.seq - right.seq);
    return {
      ...persisted,
      turns: turns.slice(0, 25),
    };
  };

  return setAnswerThreadPortForTests({
    reserveAnswerTurn: async (args) => {
      if (store.reserveError !== undefined) throw store.reserveError;
      const requestedThreadScope = args.threadId ?? "new";
      const prior = store.reservations.get(args.reservationKey);
      if (prior !== undefined) {
        if (
          prior.sessionId !== args.sessionId ||
          prior.requestedThreadScope !== requestedThreadScope
        ) {
          return { kind: "conflict", reason: "identity_mismatch" };
        }
        if (prior.requestDigest !== args.requestDigest) {
          return { kind: "conflict", reason: "request_digest_mismatch" };
        }
        const timestamp = Date.now();
        const generation = store.generations.get(prior.reservationKey) ?? 0;
        if (prior.state === "reserved") {
          if (timestamp - prior.updatedAt < ANSWER_TURN_EXECUTION_LEASE_MS) {
            return {
              kind: "in_progress",
              reservationKey: prior.reservationKey,
              threadId: prior.threadId,
              turnId: prior.turnId,
              turnSeq: prior.seq,
              generation,
            };
          }
          const nextGeneration = generation + 1;
          const checkpoint = store.checkpoints.get(prior.reservationKey);
          if (checkpoint !== undefined) {
            const serialized = serializeAnswerTurnCheckpoint(checkpoint);
            if (
              serialized === null ||
              checkpoint.reservationKey !== prior.reservationKey ||
              checkpoint.requestDigest !== prior.requestDigest ||
              checkpoint.generation !== generation ||
              checkpoint.threadId !== prior.threadId ||
              checkpoint.turnId !== prior.turnId ||
              checkpoint.turnSeq !== prior.seq
            ) {
              return { kind: "conflict", reason: "checkpoint_conflict" };
            }
            const migrated = { ...checkpoint, generation: nextGeneration };
            if (serializeAnswerTurnCheckpoint(migrated) === null) {
              return { kind: "conflict", reason: "checkpoint_conflict" };
            }
            store.checkpoints.set(prior.reservationKey, migrated);
          }
          store.generations.set(prior.reservationKey, nextGeneration);
          store.reservations.set(prior.reservationKey, {
            ...prior,
            updatedAt: timestamp,
          });
          return {
            kind: "reserved",
            reservationKey: prior.reservationKey,
            threadId: prior.threadId,
            turnId: prior.turnId,
            turnSeq: prior.seq,
            generation: nextGeneration,
            isNewThread: false,
          };
        }
        return {
          kind: "replayed",
          reservationKey: prior.reservationKey,
          threadId: prior.threadId,
          turnId: prior.turnId,
          turnSeq: prior.seq,
          generation,
          state: prior.state,
          ...(prior.finalStatus === undefined
            ? {}
            : { finalStatus: prior.finalStatus }),
        };
      }

      let thread =
        args.threadId === undefined
          ? undefined
          : store.threads.get(args.threadId);
      if (args.threadId !== undefined && thread === undefined) {
        return { kind: "refused", reason: "thread_not_found" };
      }
      if (
        thread !== undefined &&
        thread.pseudonymousSessionId !== args.sessionId
      ) {
        return { kind: "refused", reason: "thread_forbidden" };
      }
      if (thread === undefined) {
        const timestamp = Date.now();
        thread = {
          threadId: crypto.randomUUID(),
          pseudonymousSessionId: args.sessionId,
          title: args.title,
          createdAt: timestamp,
          updatedAt: timestamp,
        };
        store.threads.set(thread.threadId, thread);
      }

      if (turnCountForThread(thread.threadId) >= 25) {
        return { kind: "refused", reason: "thread_turn_limit" };
      }
      const threadReservations = [...store.reservations.values()].filter(
        (reservation) => reservation.threadId === thread?.threadId,
      );

      const turnSeq =
        Math.max(
          0,
          ...turnsForThread(thread.threadId).map((turn) => turn.seq),
          ...threadReservations.map((reservation) => reservation.seq),
        ) + 1;
      const timestamp = Date.now();
      const reservation: AnswerTurnReservationRecord = {
        reservationKey: args.reservationKey,
        sessionId: args.sessionId,
        requestedThreadScope,
        requestDigest: args.requestDigest,
        threadId: thread.threadId,
        turnId: crypto.randomUUID(),
        seq: turnSeq,
        query: args.query,
        state: "reserved",
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      store.generations.set(reservation.reservationKey, 0);
      store.reservations.set(reservation.reservationKey, reservation);
      store.threads.set(thread.threadId, { ...thread, updatedAt: timestamp });
      return {
        kind: "reserved",
        reservationKey: reservation.reservationKey,
        threadId: reservation.threadId,
        turnId: reservation.turnId,
        turnSeq: reservation.seq,
        generation: 0,
        isNewThread: requestedThreadScope === "new",
      };
    },
    renewAnswerTurnLease: async (args) => {
      const reservation = store.reservations.get(args.reservationKey);
      if (reservation === undefined)
        return { kind: "conflict", reason: "reservation_not_found" };
      if (
        reservation.sessionId !== args.sessionId ||
        reservation.threadId !== args.threadId ||
        reservation.turnId !== args.turnId ||
        reservation.seq !== args.turnSeq
      ) {
        return { kind: "conflict", reason: "reservation_identity_mismatch" };
      }
      if (reservation.requestDigest !== args.requestDigest) {
        return { kind: "conflict", reason: "request_digest_mismatch" };
      }
      if (reservation.state === "stopped")
        return { kind: "conflict", reason: "stopped" };
      if (reservation.state === "finalized") {
        return { kind: "conflict", reason: "settled" };
      }
      const generation = store.generations.get(args.reservationKey) ?? 0;
      if (generation !== args.generation)
        return { kind: "conflict", reason: "generation_mismatch" };
      store.reservations.set(args.reservationKey, {
        ...reservation,
        updatedAt: Date.now(),
      });
      return {
        kind: "renewed",
        reservationKey: reservation.reservationKey,
        threadId: reservation.threadId,
        turnId: reservation.turnId,
        turnSeq: reservation.seq,
        generation,
      };
    },
    persistAnswerTurnCheckpoint: async (args) => {
      const reservation = store.reservations.get(args.reservationKey);
      if (reservation === undefined)
        return { kind: "conflict", reason: "reservation_not_found" };
      if (
        reservation.sessionId !== args.sessionId ||
        reservation.threadId !== args.threadId ||
        reservation.turnId !== args.turnId ||
        reservation.seq !== args.turnSeq
      ) {
        return { kind: "conflict", reason: "reservation_identity_mismatch" };
      }
      if (reservation.requestDigest !== args.requestDigest) {
        return { kind: "conflict", reason: "request_digest_mismatch" };
      }
      if (reservation.state === "stopped")
        return { kind: "conflict", reason: "stopped" };
      if (reservation.state === "finalized") {
        return { kind: "conflict", reason: "settled" };
      }
      const generation = store.generations.get(args.reservationKey) ?? 0;
      if (
        generation !== args.generation ||
        args.checkpoint.generation !== generation
      ) {
        return { kind: "conflict", reason: "generation_mismatch" };
      }
      const serialized = serializeAnswerTurnCheckpoint(args.checkpoint);
      if (serialized === null)
        return { kind: "conflict", reason: "checkpoint_invalid" };
      if (
        args.checkpoint.reservationKey !== args.reservationKey ||
        args.checkpoint.requestDigest !== args.requestDigest ||
        args.checkpoint.threadId !== args.threadId ||
        args.checkpoint.turnId !== args.turnId ||
        args.checkpoint.turnSeq !== args.turnSeq
      ) {
        return { kind: "conflict", reason: "checkpoint_invalid" };
      }
      const existing = store.checkpoints.get(args.reservationKey);
      if (existing !== undefined) {
        const existingSerialized = serializeAnswerTurnCheckpoint(existing);
        if (existingSerialized === null)
          return { kind: "conflict", reason: "checkpoint_invalid" };
        if (
          existingSerialized.checkpointDigest === serialized.checkpointDigest
        ) {
          store.reservations.set(args.reservationKey, {
            ...reservation,
            updatedAt: Date.now(),
          });
          return {
            kind: "replayed",
            reservationKey: args.reservationKey,
            threadId: args.threadId,
            turnId: args.turnId,
            turnSeq: args.turnSeq,
            generation,
            checkpointDigest: serialized.checkpointDigest,
          };
        }
        if (
          args.checkpoint.stepOrdinal !== existing.stepOrdinal + 1 ||
          args.checkpoint.parentCheckpointDigest !==
            existingSerialized.checkpointDigest
        ) {
          return { kind: "conflict", reason: "checkpoint_conflict" };
        }
      } else if (
        args.checkpoint.stepOrdinal !== 1 ||
        args.checkpoint.parentCheckpointDigest !== undefined
      ) {
        return { kind: "conflict", reason: "checkpoint_conflict" };
      }
      store.reservations.set(args.reservationKey, {
        ...reservation,
        updatedAt: Date.now(),
      });
      store.checkpoints.set(args.reservationKey, args.checkpoint);
      return {
        kind: "persisted",
        reservationKey: args.reservationKey,
        threadId: args.threadId,
        turnId: args.turnId,
        turnSeq: args.turnSeq,
        generation,
        checkpointDigest: serialized.checkpointDigest,
      };
    },
    readAnswerTurnCheckpoint: async (args) => {
      const reservation = store.reservations.get(args.reservationKey);
      if (reservation === undefined) return { kind: "missing" };
      if (
        reservation.sessionId !== args.sessionId ||
        reservation.threadId !== args.threadId ||
        reservation.turnId !== args.turnId ||
        reservation.seq !== args.turnSeq
      ) {
        return { kind: "conflict", reason: "reservation_identity_mismatch" };
      }
      if (reservation.requestDigest !== args.requestDigest) {
        return { kind: "conflict", reason: "request_digest_mismatch" };
      }
      if (reservation.state === "stopped")
        return { kind: "conflict", reason: "stopped" };
      if (reservation.state === "finalized")
        return { kind: "conflict", reason: "settled" };
      const generation = store.generations.get(args.reservationKey) ?? 0;
      if (generation !== args.generation)
        return { kind: "conflict", reason: "generation_mismatch" };
      const checkpoint = store.checkpoints.get(args.reservationKey);
      if (checkpoint === undefined) return { kind: "missing" };
      if (
        checkpoint.generation !== generation ||
        checkpoint.reservationKey !== args.reservationKey ||
        checkpoint.requestDigest !== args.requestDigest ||
        checkpoint.threadId !== args.threadId ||
        checkpoint.turnId !== args.turnId ||
        checkpoint.turnSeq !== args.turnSeq
      ) {
        return { kind: "conflict", reason: "checkpoint_invalid" };
      }
      const serialized = serializeAnswerTurnCheckpoint(checkpoint);
      if (serialized === null)
        return { kind: "conflict", reason: "checkpoint_invalid" };
      return {
        kind: "checkpoint",
        checkpointJson: serialized.checkpointJson,
        checkpointDigest: serialized.checkpointDigest,
        generation,
        checkpointStep: checkpoint.stepOrdinal,
      };
    },
    stopAnswerTurn: async (args) => {
      const reservation = [...store.reservations.values()].find(
        (candidate) =>
          candidate.threadId === args.threadId &&
          candidate.turnId === args.turnId &&
          candidate.sessionId === args.sessionId,
      );
      if (reservation === undefined) return { kind: "not_found" };
      if (reservation.state === "finalized") {
        return {
          kind: "already_settled",
          threadId: args.threadId,
          turnId: args.turnId,
          status: reservation.finalStatus ?? "error",
        };
      }
      if (reservation.state === "stopped") {
        return {
          kind: "already_settled",
          threadId: args.threadId,
          turnId: args.turnId,
          status: "stopped",
        };
      }
      store.generations.set(
        reservation.reservationKey,
        (store.generations.get(reservation.reservationKey) ?? 0) + 1,
      );
      store.reservations.set(reservation.reservationKey, {
        ...reservation,
        state: "stopped",
        updatedAt: Date.now(),
      });
      const turn = store.turns.get(args.turnId);
      if (turn !== undefined)
        store.turns.set(args.turnId, { ...turn, status: "stopped" });
      return { kind: "stopped", threadId: args.threadId, turnId: args.turnId };
    },
    finalizeReservedAnswerTurn: async (args) => {
      const reservation = store.reservations.get(args.reservationKey);
      if (reservation === undefined) {
        return {
          status: "conflict",
          reason: "reservation_not_found",
          message: "Answer turn reservation does not exist.",
        };
      }
      if (
        reservation.sessionId !== args.sessionId ||
        reservation.threadId !== args.threadId ||
        reservation.turnId !== args.turnId ||
        reservation.seq !== args.turnSeq
      ) {
        return {
          status: "conflict",
          reason: "reservation_identity_mismatch",
          message: "Reservation identity mismatch.",
        };
      }
      if (reservation.requestDigest !== args.requestDigest) {
        return {
          status: "conflict",
          reason: "request_digest_mismatch",
          message: "Request digest mismatch.",
        };
      }
      if (reservation.state === "stopped") {
        return {
          status: "conflict",
          reason: "stopped",
          message: "Answer turn was stopped.",
        };
      }
      const generation = store.generations.get(args.reservationKey) ?? 0;
      if (generation !== args.expectedGeneration) {
        return {
          status: "conflict",
          reason: "generation_mismatch",
          message: "Generation mismatch.",
        };
      }
      const thread = store.threads.get(args.threadId);
      if (
        thread === undefined ||
        thread.pseudonymousSessionId !== args.sessionId
      ) {
        return {
          status: "conflict",
          reason: "parent_conflict",
          message: "Thread parent mismatch.",
        };
      }
      if (
        args.entries.some(
          (entry) =>
            entry.sessionId !== args.sessionId ||
            entry.runId !== args.turnId ||
            entry.turnId !== args.turnId,
        )
      ) {
        return {
          status: "conflict",
          reason: "entry_identity_mismatch",
          message: "Journal identity mismatch.",
        };
      }
      const existingTurn = store.turns.get(args.turnId);
      const turnMatches =
        existingTurn !== undefined &&
        existingTurn.threadId === args.threadId &&
        existingTurn.seq === args.turnSeq &&
        existingTurn.query === args.query &&
        existingTurn.intent === args.intent &&
        existingTurn.evidenceJson === args.evidenceJson &&
        existingTurn.snapshotHash === args.snapshotHash &&
        existingTurn.proseJson === args.proseJson &&
        existingTurn.artifactKindsJson === args.artifactKindsJson &&
        existingTurn.status === args.finalStatus &&
        existingTurn.createdAt === args.createdAt;
      const existingTools =
        store.persisted.find(
          (candidate): candidate is PersistedAnswerTurnRow =>
            typeof candidate === "object" &&
            candidate !== null &&
            "turnId" in candidate &&
            candidate.turnId === args.turnId &&
            "toolCalls" in candidate &&
            Array.isArray(candidate.toolCalls),
        )?.toolCalls ?? [];
      if (reservation.state === "finalized") {
        if (reservation.answerDigest !== args.answerDigest) {
          return {
            status: "conflict",
            reason: "answer_digest_conflict",
            message: "Answer digest mismatch.",
          };
        }
        if (reservation.harnessFinalizationDigest !== args.finalizationHash) {
          return {
            status: "conflict",
            reason: "evidence_conflict",
            message: "Finalization digest mismatch.",
          };
        }
        if (!turnMatches)
          return {
            status: "conflict",
            reason: "turn_conflict",
            message: "Turn replay mismatch.",
          };
        if (!toolCallsMatch(existingTools, args.toolCalls)) {
          return {
            status: "conflict",
            reason: "tool_call_conflict",
            message: "Tool replay mismatch.",
          };
        }
        return {
          status: "replayed",
          turnId: args.turnId,
          finalizationHash: args.finalizationHash,
          entriesAccepted: 0,
          entriesReplayed: args.entries.length,
        };
      }
      const persistError = store.persistErrors?.shift() ?? store.persistError;
      if (persistError !== undefined) throw persistError;
      store.finalizationWrites.push(args);
      if (existingTurn === undefined) {
        store.turns.set(args.turnId, {
          turnId: args.turnId,
          threadId: args.threadId,
          seq: args.turnSeq,
          query: args.query,
          intent: args.intent,
          evidenceJson: args.evidenceJson,
          snapshotHash: args.snapshotHash,
          proseJson: args.proseJson,
          artifactKindsJson: args.artifactKindsJson,
          status: args.finalStatus,
          ...(args.errorCopyId === undefined
            ? {}
            : { errorCopyId: args.errorCopyId }),
          ...(args.errorProblemJson === undefined
            ? {}
            : { errorProblemJson: args.errorProblemJson }),
          createdAt: args.createdAt,
        });
        store.persisted.push({ ...args, status: args.finalStatus });
      }
      store.reservations.set(args.reservationKey, {
        ...reservation,
        state: "finalized",
        finalStatus: args.finalStatus,
        answerDigest: args.answerDigest,
        harnessFinalizationDigest: args.finalizationHash,
        updatedAt: Date.now(),
      });
      store.threads.set(args.threadId, { ...thread, updatedAt: Date.now() });
      const activeLeafEntryId = args.entries.at(-1)?.entryId;
      return {
        status: "accepted",
        turnId: args.turnId,
        finalizationHash: args.finalizationHash,
        entriesAccepted: args.entries.length,
        entriesReplayed: 0,
        ...(activeLeafEntryId === undefined ? {} : { activeLeafEntryId }),
      };
    },

    listSessionThreads: async (sessionId, limit = 20) => {
      if (store.listSessionThreadsError !== undefined)
        throw store.listSessionThreadsError;
      return {
        threads: [...store.threads.values()]
          .filter((thread) => thread.pseudonymousSessionId === sessionId)
          .sort((left, right) => right.updatedAt - left.updatedAt)
          .slice(0, Math.max(1, Math.min(50, Math.floor(limit)))),
      };
    },
    getOwnedThreadProjection: async (threadId, sessionId) => {
      if (store.getOwnedThreadProjectionError !== undefined)
        throw store.getOwnedThreadProjectionError;
      const thread = store.threads.get(threadId);
      if (thread === undefined || thread.pseudonymousSessionId !== sessionId)
        return null;
      return publicProjectionForThread(thread);
    },
    issueShare: async (args) => {
      if (store.issueShareError !== undefined) throw store.issueShareError;
      const thread = store.threads.get(args.threadId);
      if (
        thread === undefined ||
        thread.pseudonymousSessionId !== args.pseudonymousSessionId
      ) {
        throw new Error("thread_not_found");
      }
      const existing = store.shares.get(args.threadId);
      const shareToken =
        existing?.revoked === false
          ? existing.shareToken
          : Array.from(crypto.getRandomValues(new Uint8Array(32)), (byte) =>
              byte.toString(16).padStart(2, "0"),
            ).join("");
      store.shares.set(args.threadId, {
        threadId: args.threadId,
        shareToken,
        revoked: false,
      });
      return { threadId: args.threadId, shareToken };
    },
    revokeShare: async (args) => {
      if (store.revokeShareError !== undefined) throw store.revokeShareError;
      const thread = store.threads.get(args.threadId);
      if (
        thread === undefined ||
        thread.pseudonymousSessionId !== args.pseudonymousSessionId
      ) {
        throw new Error("thread_not_found");
      }
      const existing = store.shares.get(args.threadId);
      if (existing === undefined || existing.revoked)
        return { threadId: args.threadId, revoked: false };
      store.shares.set(args.threadId, { ...existing, revoked: true });
      return { threadId: args.threadId, revoked: true };
    },
    getSharedThreadProjection: async (shareToken) => {
      const share = [...store.shares.values()].find(
        (candidate) =>
          candidate.shareToken === shareToken && !candidate.revoked,
      );
      if (share === undefined) return null;
      const thread = store.threads.get(share.threadId);
      return thread === undefined ? null : publicProjectionForThread(thread);
    },
    getThreadTurns: async (threadId, sessionId, paginationOpts) => {
      if (store.getThreadTurnsError !== undefined)
        throw store.getThreadTurnsError;
      const thread = store.threads.get(threadId);
      if (thread === undefined || thread.pseudonymousSessionId !== sessionId) {
        return { page: [], isDone: true, continueCursor: "" };
      }
      const rows = turnsForThread(threadId);
      const start =
        paginationOpts.cursor === null ? 0 : Number(paginationOpts.cursor);
      const page = rows.slice(start, start + paginationOpts.numItems);
      return {
        page,
        isDone: start + page.length >= rows.length,
        continueCursor: String(start + page.length),
      };
    },
    getAnswerThreadWithTurns: async (threadId, sessionId, paginationOpts) => {
      const thread = store.threads.get(threadId);
      if (thread === undefined || thread.pseudonymousSessionId !== sessionId)
        return null;
      const rows = turnsForThread(threadId);
      const start =
        paginationOpts.cursor === null ? 0 : Number(paginationOpts.cursor);
      const page = rows.slice(start, start + paginationOpts.numItems);
      return {
        thread: { ...thread, turnCount: turnCountForThread(threadId) },
        turns: {
          page,
          isDone: start + page.length >= rows.length,
          continueCursor: String(start + page.length),
        },
      };
    },
    deleteThread: async (args) => {
      if (store.deleteThreadError !== undefined) throw store.deleteThreadError;
      const thread = store.threads.get(args.threadId);
      if (thread === undefined) return { threadId: args.threadId };
      if (thread.pseudonymousSessionId !== args.pseudonymousSessionId)
        throw new Error("thread_not_found");
      store.threads.delete(args.threadId);
      store.shares.delete(args.threadId);
      for (const turn of turnsForThread(args.threadId))
        store.turns.delete(turn.turnId);
      for (const reservation of store.reservations.values()) {
        if (reservation.threadId !== args.threadId) continue;
        store.reservations.delete(reservation.reservationKey);
        store.checkpoints.delete(reservation.reservationKey);
        store.generations.delete(reservation.reservationKey);
      }
      return { threadId: args.threadId };
    },
    getAnswerThread: async (threadId, sessionId) => {
      if (store.getAnswerThreadError !== undefined)
        throw store.getAnswerThreadError;
      const thread = store.threads.get(threadId);
      if (thread === undefined || thread.pseudonymousSessionId !== sessionId)
        return null;
      return { ...thread, turnCount: turnCountForThread(threadId) };
    },
  });
}

export function readSessionCookieFromResponse(response: Response): string {
  for (const setCookie of response.headers.getSetCookie()) {
    const session = readCookie(setCookie, "ae_session");
    if (session !== undefined) return session;
  }
  return "";
}

export function sessionCookieHeader(sessionId: string): string {
  return sessionId.length === 0 ? "" : serializeCookie("ae_session", sessionId);
}
