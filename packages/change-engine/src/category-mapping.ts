import type { ProposalItemType, RequirementCategory } from '@likec4-ai/core-domain';

const CATEGORY_TO_TYPE: Record<RequirementCategory, ProposalItemType> = {
  'new-service': 'new-element',
  'modified-service': 'modified-element',
  'new-integration': 'new-relationship',
  'modified-integration': 'modified-relationship',
  'new-api': 'api-definition',
  'modified-api': 'api-definition',
  'new-data-entity': 'data-model',
  'modified-data-entity': 'data-model',
  'new-algorithm': 'sequence-diagram',
  'modified-sequence': 'sequence-diagram',
  'new-queue': 'new-element',
  'new-database': 'new-element',
  'new-external-system': 'new-element',
  'new-event': 'new-relationship',
  'data-ownership-change': 'modified-element',
};

/**
 * Категория, извлечённая из спецификации, говорит "new" или "modified" по
 * формулировке аналитика — но именно entity matching (стадия 7) может
 * обнаружить, что "новый" сервис на самом деле уже существует под другим
 * названием. В этом случае тип понижается до modified-* — это и есть
 * практическое воплощение ФТ7 ("не дублировать"), а не просто справочная
 * таблица категорий.
 */
export function mapCategoryToProposalType(category: RequirementCategory, hasMatch: boolean): ProposalItemType {
  const base = CATEGORY_TO_TYPE[category];
  if (hasMatch && base === 'new-element') return 'modified-element';
  if (hasMatch && base === 'new-relationship') return 'modified-relationship';
  return base;
}
