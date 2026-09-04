import { parseDocument, DomUtils } from 'htmlparser2';
import { isTag, type AnyNode, type Element } from 'domhandler';
import type { ConfluenceSection, ConfluenceSectionKind } from '@likec4-ai/core-domain';

const HEADING_TAGS = new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6']);

/**
 * Confluence storage format — это XHTML-подобный XML с псевдо-namespace
 * тегами (`ac:structured-macro`, `ri:page` и т.п.). `xmlMode: true` в
 * htmlparser2 сохраняет такие имена тегов/атрибутов как есть, не пытаясь
 * их резолвить как настоящие XML namespaces — то есть ведёт себя ровно так,
 * как нужно для этого формата без специальной namespace-магии.
 *
 * Поддерживается конечный список блоков (ФТ1: paragraph/table/code-block/
 * list, плюс macro/image-caption): heading (для headingPath), paragraph,
 * list, table, code-block macro, image caption. Всё остальное — неизвестные
 * теги (div, ac:layout*, другие макросы) — либо рекурсивно обходится в
 * поисках знакомого контента, либо (для незнакомых макросов) деградирует в
 * plain-text extraction, как и предполагалось риском №4 из плана: не
 * пытаемся поддержать все возможные макросы Confluence сразу.
 */
export function parseStorageFormat(storageXml: string): ConfluenceSection[] {
  const document = parseDocument(storageXml, { xmlMode: true });
  const sections: ConfluenceSection[] = [];
  const headingStack: HeadingStackEntry[] = [];
  let nextIndex = 0;

  walk(document.children, headingStack, sections, () => nextIndex++);
  return sections;
}

interface HeadingStackEntry {
  level: number;
  text: string;
}

function walk(nodes: AnyNode[], headingStack: HeadingStackEntry[], sections: ConfluenceSection[], nextIndex: () => number): void {
  for (const node of nodes) {
    if (!isTag(node)) continue;
    const tag = node.name;

    if (HEADING_TAGS.has(tag)) {
      const level = Number(tag[1]);
      // Стек, а не запись по фиксированному индексу `level - 1`: страницы
      // не всегда начинают с h1 (например, сразу с h2) — запись по индексу
      // в этом случае оставляла бы "дыру" (undefined) на месте пропущенного
      // уровня. Стек просто схлопывает всё glubже-или-равно текущему уровню.
      while (headingStack.length > 0 && headingStack[headingStack.length - 1]!.level >= level) {
        headingStack.pop();
      }
      headingStack.push({ level, text: textOf(node) });
      continue;
    }

    const headingPath = headingStack.map((h) => h.text);

    if (tag === 'p') {
      const text = textOf(node).trim();
      if (text) sections.push(makeSection(nextIndex(), headingPath, 'paragraph', { text }));
      continue;
    }

    if (tag === 'ul' || tag === 'ol') {
      const items = DomUtils.findAll((el) => el.name === 'li', node.children)
        .map((li) => textOf(li).trim())
        .filter(Boolean);
      if (items.length > 0) {
        sections.push(makeSection(nextIndex(), headingPath, 'list', { text: items.map((item) => `- ${item}`).join('\n') }));
      }
      continue;
    }

    if (tag === 'table') {
      const table = extractTable(node);
      if (table.headers.length > 0 || table.rows.length > 0) {
        sections.push(makeSection(nextIndex(), headingPath, 'table', { table }));
      }
      continue;
    }

    if (tag === 'ac:structured-macro') {
      const macroName = node.attribs['ac:name'];
      if (macroName === 'code') {
        sections.push(makeSection(nextIndex(), headingPath, 'code-block', { codeBlock: extractCodeMacro(node) }));
      } else {
        const text = textOf(node).trim();
        if (text) sections.push(makeSection(nextIndex(), headingPath, 'macro', { text }));
      }
      continue;
    }

    if (tag === 'ac:image') {
      const caption = DomUtils.findOne((el) => el.name === 'ac:caption', node.children);
      const text = caption ? textOf(caption).trim() : '';
      if (text) sections.push(makeSection(nextIndex(), headingPath, 'image-caption', { text }));
      continue;
    }

    // Незнакомый контейнер (div, ac:layout, ac:layout-section, ac:layout-cell, span и т.п.) — обходим внутрь.
    walk(node.children, headingStack, sections, nextIndex);
  }
}

function extractTable(table: Element): { headers: string[]; rows: string[][] } {
  const rowElements = DomUtils.findAll((el) => el.name === 'tr', table.children);
  if (rowElements.length === 0) return { headers: [], rows: [] };

  const [firstRow, ...restRows] = rowElements as [Element, ...Element[]];
  const firstRowHasHeaderCells = DomUtils.findAll((el) => el.name === 'th', firstRow.children).length > 0;

  const headers = firstRowHasHeaderCells
    ? DomUtils.findAll((el) => el.name === 'th' || el.name === 'td', firstRow.children).map((cell) => textOf(cell).trim())
    : [];
  const dataRows = firstRowHasHeaderCells ? restRows : rowElements;

  const rows = dataRows.map((row) =>
    DomUtils.findAll((el) => el.name === 'td' || el.name === 'th', row.children).map((cell) => textOf(cell).trim()),
  );

  return { headers, rows };
}

function extractCodeMacro(macro: Element): { language?: string; content: string } {
  const languageParam = DomUtils.findOne(
    (el) => el.name === 'ac:parameter' && el.attribs['ac:name'] === 'language',
    macro.children,
  );
  const plainBody = DomUtils.findOne((el) => el.name === 'ac:plain-text-body', macro.children);
  const richBody = DomUtils.findOne((el) => el.name === 'ac:rich-text-body', macro.children);

  const content = plainBody ? textOf(plainBody) : richBody ? textOf(richBody) : '';
  const language = languageParam ? textOf(languageParam).trim() : undefined;

  return language ? { language, content } : { content };
}

function makeSection(
  index: number,
  headingPath: string[],
  kind: ConfluenceSectionKind,
  extra: Pick<ConfluenceSection, 'text' | 'table' | 'codeBlock'>,
): ConfluenceSection {
  const lastHeading = headingPath[headingPath.length - 1];
  const slug = lastHeading ? slugify(lastHeading) : 'page';
  return {
    id: `${slug}-${index}`,
    headingPath: [...headingPath],
    kind,
    ...extra,
  };
}

function slugify(text: string): string {
  const slug = text
    .toLowerCase()
    .replace(/[^a-z0-9а-яё]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return slug || 'section';
}

function textOf(node: AnyNode): string {
  return DomUtils.textContent(node);
}
