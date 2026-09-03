import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_CONTENT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'content');

interface ManifestEntry {
  id: string;
  title: string;
  tags: string[];
  file: string;
}

interface Manifest {
  version: string;
  chunks: ManifestEntry[];
}

export interface LoadedContentChunk {
  id: string;
  title: string;
  tags: string[];
  content: string;
}

/**
 * Контент живёт в собственной директории со своим manifest.json (версия
 * отдельная от версии npm-пакета) — по требованию ФТ3 обновляться должен
 * независимо от версии приложения. Здесь просто читаем manifest + каждый
 * .md файл; сам факт вынесения контента в файлы, а не хардкод в TS, и есть
 * то, что делает независимое обновление возможным.
 */
export async function loadContentChunks(contentDir: string = DEFAULT_CONTENT_DIR): Promise<LoadedContentChunk[]> {
  const manifestRaw = await readFile(join(contentDir, 'manifest.json'), 'utf8');
  const manifest = JSON.parse(manifestRaw) as Manifest;

  return Promise.all(
    manifest.chunks.map(async (entry) => ({
      id: entry.id,
      title: entry.title,
      tags: entry.tags,
      content: await readFile(join(contentDir, entry.file), 'utf8'),
    })),
  );
}
