import type { Explanation, ProposalItem } from '../models/proposal.js';
import type { SessionRecord } from '../models/session.js';

export interface HelpContent {
  topicId: string;
  level1Label: string;
  level2InlineDescription: string;
  level3Tooltip: string;
  level4ContextHelp: string;
  level5DocLink: { anchor: string; docPath: string };
}

export interface DocumentationEngine {
  explain(item: ProposalItem): Promise<Explanation>;
  renderChangelogEntry(session: SessionRecord): Promise<string>;
  renderHelpContent(topicId: string): Promise<HelpContent>;
}
