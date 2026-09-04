import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseStorageFormat } from './storage-format-parser.js';

test('builds headingPath across nested heading levels', () => {
  const sections = parseStorageFormat(`
    <h1>Integration</h1>
    <p>Top level paragraph</p>
    <h2>Payment API</h2>
    <p>Nested paragraph</p>
  `);

  assert.deepEqual(
    sections.map((s) => ({ headingPath: s.headingPath, text: s.text })),
    [
      { headingPath: ['Integration'], text: 'Top level paragraph' },
      { headingPath: ['Integration', 'Payment API'], text: 'Nested paragraph' },
    ],
  );
});

test('a page that jumps straight to h2 (no h1) does not leave an undefined hole in headingPath (regression)', () => {
  const sections = parseStorageFormat('<h2>Straight to h2</h2><p>under it</p>');
  assert.deepEqual(sections[0]?.headingPath, ['Straight to h2']);
});

test('headingPath resets correctly when a heading level goes back up', () => {
  const sections = parseStorageFormat(`
    <h1>A</h1>
    <h2>A.1</h2>
    <p>under A.1</p>
    <h1>B</h1>
    <p>under B</p>
  `);

  assert.deepEqual(
    sections.map((s) => s.headingPath),
    [['A', 'A.1'], ['B']],
  );
});

test('skips empty paragraphs', () => {
  const sections = parseStorageFormat('<p>real text</p><p>   </p><p></p>');
  assert.equal(sections.length, 1);
  assert.equal(sections[0]?.text, 'real text');
});

test('extracts a list as a single section with one line per item', () => {
  const sections = parseStorageFormat('<ul><li>First</li><li>Second</li></ul>');
  assert.equal(sections.length, 1);
  assert.equal(sections[0]?.kind, 'list');
  assert.equal(sections[0]?.text, '- First\n- Second');
});

test('extracts a table with a header row', () => {
  const sections = parseStorageFormat(`
    <table>
      <tbody>
        <tr><th>Method</th><th>Path</th></tr>
        <tr><td>GET</td><td>/orders</td></tr>
        <tr><td>POST</td><td>/orders</td></tr>
      </tbody>
    </table>
  `);

  assert.equal(sections.length, 1);
  assert.equal(sections[0]?.kind, 'table');
  assert.deepEqual(sections[0]?.table, {
    headers: ['Method', 'Path'],
    rows: [
      ['GET', '/orders'],
      ['POST', '/orders'],
    ],
  });
});

test('extracts a table without a header row (all td) as headerless', () => {
  const sections = parseStorageFormat('<table><tbody><tr><td>a</td><td>b</td></tr></tbody></table>');
  assert.deepEqual(sections[0]?.table, { headers: [], rows: [['a', 'b']] });
});

test('extracts a code macro with language and CDATA content', () => {
  const sections = parseStorageFormat(`
    <ac:structured-macro ac:name="code" ac:schema-version="1">
      <ac:parameter ac:name="language">python</ac:parameter>
      <ac:plain-text-body><![CDATA[def foo():
    return 1]]></ac:plain-text-body>
    </ac:structured-macro>
  `);

  assert.equal(sections.length, 1);
  assert.equal(sections[0]?.kind, 'code-block');
  assert.equal(sections[0]?.codeBlock?.language, 'python');
  assert.match(sections[0]?.codeBlock?.content ?? '', /def foo\(\):/);
});

test('unsupported macros degrade to plain-text extraction under kind "macro"', () => {
  const sections = parseStorageFormat(`
    <ac:structured-macro ac:name="info">
      <ac:rich-text-body>
        <p>This is important context.</p>
      </ac:rich-text-body>
    </ac:structured-macro>
  `);

  assert.equal(sections.length, 1);
  assert.equal(sections[0]?.kind, 'macro');
  assert.equal(sections[0]?.text, 'This is important context.');
});

test('recurses through layout containers transparently (no section for the layout itself)', () => {
  const sections = parseStorageFormat(`
    <ac:layout>
      <ac:layout-section ac:type="single">
        <ac:layout-cell>
          <h2>In a cell</h2>
          <p>Cell content</p>
        </ac:layout-cell>
      </ac:layout-section>
    </ac:layout>
  `);

  assert.equal(sections.length, 1);
  assert.equal(sections[0]?.text, 'Cell content');
  assert.deepEqual(sections[0]?.headingPath, ['In a cell']);
});

test('extracts an image caption when present', () => {
  const sections = parseStorageFormat(`
    <ac:image ac:height="250">
      <ac:caption>Sequence diagram for checkout</ac:caption>
      <ri:attachment ri:filename="diagram.png" />
    </ac:image>
  `);

  assert.equal(sections.length, 1);
  assert.equal(sections[0]?.kind, 'image-caption');
  assert.equal(sections[0]?.text, 'Sequence diagram for checkout');
});

test('section ids are stable across repeated parses of the same content', () => {
  const xml = '<h1>Section</h1><p>One</p><p>Two</p>';
  const first = parseStorageFormat(xml);
  const second = parseStorageFormat(xml);
  assert.deepEqual(
    first.map((s) => s.id),
    second.map((s) => s.id),
  );
});
