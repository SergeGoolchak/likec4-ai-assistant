#!/usr/bin/env node
/**
 * Milestone 11: «наполнение HelpTopic по всем экранам (проверяется
 * lint-скриптом на полноту)». Чистое текстовое сканирование (без импорта
 * content.ts как модуля — файл на TypeScript, а раздельного build-шага у
 * apps/web в CI нет) исходников на предмет:
 * 1) каждый экран (`apps/web/src/pages/*.tsx`, кроме самого Help Center)
 *    содержит хотя бы один `<HelpAnchor topicId="...">`;
 * 2) каждый использованный topicId существует в реестре `content.ts`
 *    (ловит опечатки сразу, а не только через рантайм-throw HelpAnchor'а);
 * 3) каждый `docLink` в реестре указывает на существующий файл в
 *    docs/user-guide/.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const pagesDir = join(root, 'apps/web/src/pages');
const contentPath = join(root, 'apps/web/src/ui-kit/help/content.ts');
const userGuideDir = join(root, 'docs/user-guide');

// Help Center рендерит и объясняет сам реестр целиком — ему не нужен HelpAnchor на себя.
const PAGES_EXEMPT_FROM_HELP = new Set(['HelpCenterPage.tsx']);

const errors = [];

const contentSource = readFileSync(contentPath, 'utf8');
const registeredTopicIds = new Set([...contentSource.matchAll(/\bid:\s*'([^']+)'/g)].map((m) => m[1]));
const docLinks = [...contentSource.matchAll(/\bdocLink:\s*'([^']+)'/g)].map((m) => m[1]);

if (registeredTopicIds.size === 0) {
  errors.push('HELP_TOPICS реестр пуст или не найден в ui-kit/help/content.ts — проверьте путь/формат.');
}

for (const docLink of docLinks) {
  const [file] = docLink.split('#');
  if (!existsSync(join(userGuideDir, file))) {
    errors.push(`docLink "${docLink}" в content.ts указывает на несуществующий файл docs/user-guide/${file}`);
  }
}

const pageFiles = readdirSync(pagesDir).filter((f) => f.endsWith('.tsx'));
const usedTopicIds = new Set();

for (const file of pageFiles) {
  const source = readFileSync(join(pagesDir, file), 'utf8');
  const matches = [...source.matchAll(/<HelpAnchor\s+topicId="([^"]+)"/g)].map((m) => m[1]);
  matches.forEach((id) => usedTopicIds.add(id));

  if (!PAGES_EXEMPT_FROM_HELP.has(file) && matches.length === 0) {
    errors.push(`Экран ${file} не содержит ни одного <HelpAnchor> — добавьте хотя бы один topicId.`);
  }

  for (const id of matches) {
    if (!registeredTopicIds.has(id)) {
      errors.push(`${file} ссылается на несуществующий topicId "${id}" — добавьте запись в ui-kit/help/content.ts или исправьте опечатку.`);
    }
  }
}

if (errors.length > 0) {
  console.error('check-help-completeness: найдены проблемы с покрытием контекстной помощи:\n');
  for (const e of errors) console.error(`  - ${e}`);
  console.error(`\nВсего экранов: ${pageFiles.length}. Тем в реестре: ${registeredTopicIds.size}. Использовано: ${usedTopicIds.size}.`);
  process.exit(1);
}

console.log(
  `check-help-completeness: OK — ${pageFiles.length} экранов, ${registeredTopicIds.size} тем в реестре, все topicId и docLink валидны.`,
);
