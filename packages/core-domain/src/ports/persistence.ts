import type { ItemDecisionStatus, Proposal } from '../models/proposal.js';
import type { RepositoryFile } from '../models/common.js';
import type { SessionRecord, SessionRecordSummary } from '../models/session.js';
import type { Snapshot, SnapshotMeta } from '../models/snapshot.js';

export interface ProposalStore {
  save(proposal: Proposal): Promise<void>;
  get(proposalId: string): Promise<Proposal | null>;
  updateItemDecision(proposalId: string, itemId: string, decision: ItemDecisionStatus): Promise<void>;
}

export interface SessionHistoryStore {
  create(session: SessionRecord): Promise<void>;
  update(sessionId: string, patch: Partial<SessionRecord>): Promise<void>;
  get(sessionId: string): Promise<SessionRecord | null>;
  list(filter?: { projectId?: string }): Promise<SessionRecordSummary[]>;
}

export interface SnapshotStore {
  create(projectId: string, files: RepositoryFile[], meta: SnapshotMeta): Promise<Snapshot>;
  restore(snapshotId: string): Promise<RepositoryFile[]>;
  list(projectId: string): Promise<Snapshot[]>;
}
