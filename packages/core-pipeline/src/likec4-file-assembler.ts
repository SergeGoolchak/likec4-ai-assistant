import type { ArchitectureGraph, ProposalItem, RepositoryFile } from '@likec4-ai/core-domain';

export interface AssembledFiles {
  files: RepositoryFile[];
  /** Путь к файлу -> id item'ов, чей контент туда попал — нужен стадии 15 (Architecture Review) и 16 (Repair), чтобы найти "чьи" элементы/диагностики. */
  itemsByFile: Map<string, string[]>;
}

/**
 * Стадия 13 (LikeC4 Generation, Milestone 9) — механическая сборка, БЕЗ обращения
 * к LLM: `ProposalItem.proposedLikeC4Code` уже содержит финальный текст (написанный
 * AI на стадии 11 и одобренный человеком, либо написанный человеком вручную через
 * "Изменить" на стадии 12) — сама генерация уже случилась раньше. Задача этой
 * функции — только разместить этот текст в правильном месте гипотетического
 * слитого состояния файлов:
 * - modified-* (есть `targetElementId` с известным `sourceRef`) — точечная замена
 *   строк `startLine..endLine` в существующем файле (тот самый sourceRef, который
 *   ArchitectureGraph ведёт с Milestone 1 специально "для diff/repair").
 * - остальное (новые элементы/связи/etc.) — отдельный новый файл на item, чтобы
 *   не гадать, куда именно вставлять что-то, чего в проекте ещё не существует.
 *
 * Только `approved`/`edited` item'ы попадают в сборку — `rejected` не применяются
 * вовсе, `pending`/`regenerate-requested` сюда просто не должны доходить (гейт
 * user-review не пропускает дальше, пока такие есть).
 */
export function assembleGeneratedFiles(existingFiles: RepositoryFile[], items: ProposalItem[], graph: ArchitectureGraph): AssembledFiles {
  const fileContents = new Map(existingFiles.map((f) => [f.path, f.content]));
  const itemsByFile = new Map<string, string[]>();
  const finalItems = items.filter((item) => item.decision === 'approved' || item.decision === 'edited');

  const modificationsByFile = new Map<string, { startLine: number; endLine: number; code: string; itemId: string }[]>();
  const newFileItems: ProposalItem[] = [];

  for (const item of finalItems) {
    const element = item.targetElementId ? graph.elements.get(item.targetElementId) : undefined;
    if (element?.sourceRef && fileContents.has(element.sourceRef.file)) {
      const list = modificationsByFile.get(element.sourceRef.file) ?? [];
      list.push({ startLine: element.sourceRef.startLine, endLine: element.sourceRef.endLine, code: item.proposedLikeC4Code ?? '', itemId: item.id });
      modificationsByFile.set(element.sourceRef.file, list);
    } else {
      // Либо item действительно новый (нет targetElementId), либо целевой элемент почему-то
      // не нашёлся в графе — безопасный fallback: не терять предложение молча, а всё равно
      // материализовать его в отдельном файле, а не падать посреди сборки остальных.
      newFileItems.push(item);
    }
  }

  for (const [path, mods] of modificationsByFile) {
    const original = fileContents.get(path)!;
    fileContents.set(path, spliceLines(original, mods));
    itemsByFile.set(path, mods.map((m) => m.itemId));
  }

  const usedPaths = new Set(fileContents.keys());
  for (const item of newFileItems) {
    const path = uniqueGeneratedPath(item, usedPaths);
    usedPaths.add(path);
    fileContents.set(path, item.proposedLikeC4Code ?? '');
    itemsByFile.set(path, [item.id]);
  }

  return {
    files: [...fileContents.entries()].map(([path, content]) => ({ path, content })),
    itemsByFile,
  };
}

/** Заменяет строки startLine..endLine (1-indexed, включительно) — несколько правок в одном файле применяются снизу вверх, чтобы номера строк друг на друга не влияли. */
function spliceLines(content: string, modifications: { startLine: number; endLine: number; code: string }[]): string {
  const lines = content.split('\n');
  const sorted = [...modifications].sort((a, b) => b.startLine - a.startLine);
  for (const mod of sorted) {
    lines.splice(mod.startLine - 1, mod.endLine - mod.startLine + 1, ...mod.code.split('\n'));
  }
  return lines.join('\n');
}

function uniqueGeneratedPath(item: ProposalItem, usedPaths: ReadonlySet<string>): string {
  const base = `generated/${slugify(item.title) || item.id}.c4`;
  if (!usedPaths.has(base)) return base;
  return `generated/${slugify(item.title) || item.id}-${item.id.slice(0, 8)}.c4`;
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
