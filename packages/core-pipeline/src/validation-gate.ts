import type { ArchitecturalValidationResult, TechnicalValidationResult } from '@likec4-ai/core-domain';

/**
 * Apply gate (план, раздел "Валидация и repair"): разрешён только если Level 1
 * (техническая) без ошибок и нет неразрешённых Level 2 (архитектурных)
 * must-findings. Общая точка для стадии 16 (Repair — есть ли ещё что чинить),
 * роута `apply.ts` (Milestone 10 — не пропустить Apply мимо валидации на
 * сервере, не только на фронтенде) и `sessions.ts` (UI-статус) — раньше это
 * вычислялось в трёх местах по отдельности, что рисковало разойтись.
 * `undefined` => один из двух уровней ещё не посчитан (валидация не завершена).
 */
export function hasBlockingValidationIssues(
  validationResult: { technical?: TechnicalValidationResult; architectural?: ArchitecturalValidationResult } | undefined,
): boolean | undefined {
  const { technical, architectural } = validationResult ?? {};
  if (!technical || !architectural) return undefined;
  return !technical.ok || architectural.findings.some((f) => f.severity === 'must');
}
