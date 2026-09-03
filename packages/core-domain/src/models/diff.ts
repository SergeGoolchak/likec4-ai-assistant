export interface FileDiff {
  path: string;
  changeType: 'added' | 'modified' | 'deleted';
  before?: string;
  after?: string;
}
