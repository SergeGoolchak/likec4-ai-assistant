import type {
  ArchitecturalFinding,
  ArchitecturalValidationResult,
  LikeC4Diagnostic,
  ProposalItem,
  TechnicalValidationResult,
} from '@likec4-ai/core-domain';
import { assembleGeneratedFiles } from '../likec4-file-assembler.js';
import type { PipelineStageDef } from '../stage.js';

/**
 * Жёсткий cap — риск №2 из плана ("Repair-зацикливание"). При исчерпании —
 * explicit stop (см. ниже), никогда тихое применение всё ещё невалидного кода.
 */
const MAX_REPAIR_ATTEMPTS = 2;

function hasBlockingIssues(technical: TechnicalValidationResult, architectural: ArchitecturalValidationResult): boolean {
  return !technical.ok || architectural.findings.some((f) => f.severity === 'must');
}

/**
 * Стадия 16 (Milestone 9). В отличие от остальных стадий, это внутренний
 * цикл repair→re-validate внутри ОДНОГО вызова `run()`, а не переход между
 * стадиями оркестратора — `PipelineOrchestrator.run()` проходит STAGES
 * строго по порядку один раз за вызов и не умеет "вернуться" к стадиям 14/15
 * после repair. Каждая итерация: точечно чинит только item'ы, чьи файлы/
 * находки реально сломаны (`ProposalGenerator.repair`), пересобирает
 * `generatedFiles` и валидирует заново. Останавливается, когда блокирующих
 * проблем не осталось, либо кидает ошибку по исчерпании попыток — тот же
 * механизм `fail()` оркестратора, что и у любой другой упавшей стадии,
 * сохраняющий прогресс и явно показывающий пользователю полный дамп
 * диагностик, а не тихо продолжающий с невалидным кодом.
 */
export const repairStage: PipelineStageDef = {
  id: 'repair',
  label: 'Исправление ошибок валидации',
  isDone: (outputs) => {
    const { technical, architectural } = outputs.validationResult ?? {};
    if (!technical || !architectural) return false;
    return !hasBlockingIssues(technical, architectural);
  },
  async run(state, { session, ports }) {
    const proposal = state.stageOutputs.proposal;
    const graph = state.stageOutputs.architectureGraph;
    const existingFiles = state.stageOutputs.existingFiles;
    let technical = state.stageOutputs.validationResult?.technical;
    let architectural = state.stageOutputs.validationResult?.architectural;
    if (!proposal || !graph || !existingFiles || !technical || !architectural) {
      throw new Error('repair requires proposal, architectureGraph, existingFiles and a completed validationResult from earlier stages');
    }
    if (!ports.proposalGenerator) throw new Error('repair requires a ProposalGenerator — configure AI settings for this project');
    if (!ports.likec4Parser) throw new Error('repair requires a LikeC4Parser');
    if (!ports.likec4Validator) throw new Error('repair requires a LikeC4Validator');
    if (!ports.architecturalReviewer) throw new Error('repair requires an ArchitecturalReviewer');

    let items = proposal.items;
    let generatedFiles = state.stageOutputs.generatedFiles ?? [];
    const attempts = [...(state.stageOutputs.repairAttempts ?? [])];
    const rules = (await ports.architectureRuleStore?.list(session.projectId)) ?? [];

    while (hasBlockingIssues(technical, architectural)) {
      const { itemsByFile } = assembleGeneratedFiles(existingFiles, items, graph);
      const affectedItemIds = identifyAffectedItemIds(technical.diagnostics, architectural.findings, itemsByFile);

      if (affectedItemIds.length === 0) {
        throw new Error(
          `Валидация нашла блокирующие проблемы, но ни одна не сопоставляется с известным предложением — чинить нечего.\n\n${describeIssues(technical, architectural)}`,
        );
      }
      if (attempts.length >= MAX_REPAIR_ATTEMPTS) {
        throw new Error(`Не удалось исправить проблемы валидации за ${MAX_REPAIR_ATTEMPTS} попытки(-ок).\n\n${describeIssues(technical, architectural)}`);
      }

      const diagnosticsBefore = technical.diagnostics;
      const repairedById = new Map<string, ProposalItem>();
      for (const itemId of affectedItemIds) {
        const item = items.find((i) => i.id === itemId);
        if (!item) continue;
        const itemDiagnostics = diagnosticsForItem(itemId, technical.diagnostics, itemsByFile);
        const itemFindings = architectural.findings.filter((f) => f.affectedItemId === itemId);
        repairedById.set(itemId, await ports.proposalGenerator.repair({ item, diagnostics: itemDiagnostics, findings: itemFindings, graph, rules }));
      }
      items = items.map((i) => repairedById.get(i.id) ?? i);

      const assembled = assembleGeneratedFiles(existingFiles, items, graph);
      generatedFiles = assembled.files;
      technical = await ports.likec4Validator.validateTechnical(generatedFiles);
      const { graph: newGraph } = await ports.likec4Parser.parseProject(generatedFiles);
      architectural = await ports.architecturalReviewer.review({ items, newGraph, existingGraph: graph, rules, itemsByFile: assembled.itemsByFile });

      attempts.push({
        attempt: attempts.length + 1,
        targetItemIds: affectedItemIds,
        diagnosticsBefore,
        diagnosticsAfter: technical.diagnostics,
        succeeded: !hasBlockingIssues(technical, architectural),
      });
    }

    return {
      proposal: { ...proposal, items },
      generatedFiles,
      validationResult: { technical, architectural },
      repairAttempts: attempts,
    };
  },
};

function identifyAffectedItemIds(
  diagnostics: LikeC4Diagnostic[],
  findings: ArchitecturalFinding[],
  itemsByFile: Map<string, string[]>,
): string[] {
  const ids = new Set<string>();
  for (const diagnostic of diagnostics) {
    for (const id of itemsByFile.get(diagnostic.file) ?? []) ids.add(id);
  }
  for (const finding of findings) {
    if (finding.severity === 'must') ids.add(finding.affectedItemId);
  }
  return [...ids];
}

function diagnosticsForItem(itemId: string, diagnostics: LikeC4Diagnostic[], itemsByFile: Map<string, string[]>): LikeC4Diagnostic[] {
  return diagnostics.filter((d) => (itemsByFile.get(d.file) ?? []).includes(itemId));
}

function describeIssues(technical: TechnicalValidationResult, architectural: ArchitecturalValidationResult): string {
  const lines = ['Технические диагностики:'];
  for (const d of technical.diagnostics) lines.push(`  [${d.severity}] ${d.file}: ${d.message}`);
  if (technical.diagnostics.length === 0) lines.push('  (нет)');

  const must = architectural.findings.filter((f) => f.severity === 'must');
  lines.push('', 'Архитектурные находки (must):');
  for (const f of must) lines.push(`  [${f.ruleId}] ${f.message} (item: ${f.affectedItemId})`);
  if (must.length === 0) lines.push('  (нет)');

  return lines.join('\n');
}
