#!/usr/bin/env node
/**
 * Milestone 12 (риск №5 из плана): «CI-проверка на утечку тестового
 * секрета». Маленький Node-скрипт без внешних зависимостей — тот же стиль,
 * что уже есть `scripts/check-help-completeness.mjs`, а не тяжёлый
 * gitleaks/trufflehog.
 *
 * Паттерны намеренно консервативны (длинные alnum-последовательности) —
 * чтобы не давать ложных срабатываний на короткие человекочитаемые тестовые
 * фикстуры вида `sk-test-secret`/`fake-pat-token`, уже использующиеся в
 * `*.test.ts` по всему репозиторию (см. `packages/core-domain/src/redact-secrets.ts`,
 * который защищает по тем же паттернам во время исполнения — здесь та же
 * логика применяется статически, к самому исходному коду).
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const SECRET_PATTERNS = [
  { name: 'OpenAI-shaped API key', pattern: /sk-[A-Za-z0-9_-]{20,}/g },
  { name: 'AWS access key id', pattern: /AKIA[0-9A-Z]{16}/g },
  { name: 'PEM private key block', pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----/g },
];

// package-lock.json — генерируемый файл, может содержать длинные hex-хэши, случайно похожие
// на паттерны выше; сам скрипт и его тесты сознательно исключены, чтобы описание паттернов
// в исходниках не триггерило само себя.
const EXCLUDED_FILES = new Set(['package-lock.json', 'scripts/check-secret-leaks.mjs']);

const trackedFiles = execFileSync('git', ['ls-files'], { encoding: 'utf8' })
  .split('\n')
  .filter(Boolean)
  .filter((file) => !EXCLUDED_FILES.has(file));

const findings = [];

for (const file of trackedFiles) {
  let content;
  try {
    content = readFileSync(file, 'utf8');
  } catch {
    continue; // симлинк на несуществующий файл, бинарник без прав на чтение и т.п. — пропускаем.
  }
  for (const { name, pattern } of SECRET_PATTERNS) {
    const matches = content.match(pattern);
    if (matches) findings.push({ file, name, count: matches.length });
  }
}

if (findings.length > 0) {
  console.error('check-secret-leaks: найдены строки, похожие на реальные секреты:\n');
  for (const f of findings) console.error(`  - ${f.file}: ${f.name} (${f.count})`);
  console.error('\nЕсли это ложное срабатывание на тестовую фикстуру — используйте короткое,');
  console.error('явно ненастоящее значение (см. уже существующие sk-test-secret/fake-pat-token).');
  process.exit(1);
}

console.log(`check-secret-leaks: OK — проверено файлов: ${trackedFiles.length}, совпадений не найдено.`);
