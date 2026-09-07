import type { FileDiff, RepositoryFile } from '@likec4-ai/core-domain';

/**
 * Стадия 17 (Diff, Milestone 10) — чистая функция без LLM/портов, как
 * `assembleGeneratedFiles`: сравнивает существующее состояние файлов с
 * гипотетическим слитым (`generatedFiles` из стадии 13) по content.
 * 'deleted' сегодня на практике не встречается (`assembleGeneratedFiles`
 * никогда не удаляет файлы), но это естественная ветка обычного diff, а не
 * спекулятивный кейс ради будущего.
 */
export function computeFileDiff(existingFiles: RepositoryFile[], generatedFiles: RepositoryFile[]): FileDiff[] {
  const before = new Map(existingFiles.map((f) => [f.path, f.content]));
  const after = new Map(generatedFiles.map((f) => [f.path, f.content]));
  const diffs: FileDiff[] = [];

  for (const [path, afterContent] of after) {
    const beforeContent = before.get(path);
    if (beforeContent === undefined) {
      diffs.push({ path, changeType: 'added', after: afterContent });
    } else if (beforeContent !== afterContent) {
      diffs.push({ path, changeType: 'modified', before: beforeContent, after: afterContent });
    }
  }

  for (const [path, beforeContent] of before) {
    if (!after.has(path)) {
      diffs.push({ path, changeType: 'deleted', before: beforeContent });
    }
  }

  return diffs;
}
