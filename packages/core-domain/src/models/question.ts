export type QuestionOriginKind =
  | 'specification-fact'
  | 'existing-architecture-fact'
  | 'user-decision-needed'
  | 'ai-assumption-needs-confirmation';

export interface QuestionOption {
  id: string;
  label: string;
  description?: string;
  implicationsSummary?: string;
}

export type QuestionStatus = 'open' | 'answered' | 'deferred' | 'marked-unknown';

export interface ClarificationQuestion {
  id: string;
  originKind: QuestionOriginKind;
  text: string;
  /** Зачем системе нужна эта информация — ФТ14 требует, чтобы это всегда было объяснено. */
  whyNeeded: string;
  relatedProposalItemIds: string[];
  options?: QuestionOption[];
  allowFreeText: boolean;
  status: QuestionStatus;
  answer?: {
    selectedOptionId?: string;
    freeText?: string;
    answeredAt: string;
  };
}
