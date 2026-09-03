export interface ConfluencePageRef {
  baseUrl: string;
  pageId: string;
}

export type ConfluenceSectionKind = 'paragraph' | 'table' | 'code-block' | 'list' | 'macro' | 'image-caption';

export interface ConfluenceSection {
  /** Стабильный якорь (производный от heading-path + индекса), используемый для traceability в ProposalItem.sources. */
  id: string;
  headingPath: string[];
  kind: ConfluenceSectionKind;
  text?: string;
  table?: { headers: string[]; rows: string[][] };
  codeBlock?: { language?: string; content: string };
}

export interface ConfluencePageContent {
  pageId: string;
  title: string;
  version: number;
  spaceKey: string;
  url: string;
  sections: ConfluenceSection[];
  fetchedAt: string;
}
