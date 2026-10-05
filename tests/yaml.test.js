import { describe, expect, test } from 'claude-code/testing';
import { bodyOf, formatTask, parseTask } from '../hooks/tasks';
import { oneLine, readYamlValue, yamlValue } from '../hooks/yaml';
import { LINE_SEPARATOR, PLAIN_TITLES, QUOTED_TITLES, TRICKY_TITLES } from './titles';
// The real-parser check (Ruby's Psych, as GitHub uses, and Bun.YAML) is `bun scripts/yaml-check.ts`:
// the test runner has neither.
const task = (fields) => ({
    id: 'T-034',
    title: 'Fix login redirect',
    sprint: 'backlog',
    urgent: false,
    status: 'todo',
    owner: '',
    rolled: 0,
    order: 0,
    created: '2026-10-03',
    file: '/p/.claude/tasks/T-034-x.md',
    body: bodyOf('g'),
    ...fields,
});
const titleLine = (text) => text.split('\n').find(line => line.startsWith('title:'));
describe('yaml front-matter values', () => {
    test('simple values stay plain, so existing files do not change', () => {
        for (const plain of ['T-034', 'backlog', '2026-09-28', 'Fix login redirect', 'billing-export', ...PLAIN_TITLES])
            expect(yamlValue(plain)).toBe(plain);
        const text = formatTask(task({ title: 'Fix login redirect', owner: 'auth', order: -1, urgent: true }));
        expect(text).toStartWith('---\nid: T-034\ntitle: Fix login redirect\nsprint: backlog\nurgent: true\nstatus: todo\nowner: auth\nrolled: 0\norder: -1\ncreated: 2026-10-03\n---\n');
    });
    test('the title that broke GitHub is quoted', () => {
        const text = formatTask(task({ title: TRICKY_TITLES[0] }));
        expect(titleLine(text)).toBe('title: "Music page like the Songs page: playlists, search, recents, queue orders"');
    });
    test('every tricky title is quoted and reads back the same', () => {
        for (const title of QUOTED_TITLES) {
            const quoted = yamlValue(title);
            expect(quoted).toStartWith('"');
            expect(readYamlValue(quoted)).toBe(title);
        }
    });
    test('write, read, write gives the same file (a line separator becomes a space)', () => {
        for (const title of TRICKY_TITLES) {
            const original = task({ title, owner: 'music: page' });
            const text = formatTask(original);
            const read = parseTask(text, original.file);
            expect(read).toEqual({ ...original, title: oneLine(title) });
            expect(formatTask(read)).toBe(text);
        }
    });
    test('escapes: quotes, backslashes, control characters', () => {
        expect(yamlValue('"a" \\ b')).toBe('"\\"a\\" \\\\ b"');
        expect(yamlValue('tab\there')).toBe('"tab\\there"');
        expect(yamlValue(`x${String.fromCharCode(7)}`)).toBe('"x\\u0007"');
        expect(yamlValue(LINE_SEPARATOR)).toBe('"\\u2028"');
    });
    test('a single-line field loses its line breaks', () => {
        expect(oneLine('  Fix login\n  redirect\r\nnow  ')).toBe('Fix login redirect now');
        const text = formatTask(task({ title: 'Fix login\nredirect: now' }));
        expect(titleLine(text)).toBe('title: "Fix login redirect: now"');
        expect(text.split('\n---\n')[0].split('\n')).toHaveLength(10);
    });
    test('reads quoted values a person wrote, single or double', () => {
        expect(readYamlValue("'It''s: fine'")).toBe("It's: fine");
        expect(readYamlValue('"\\x41\\u0103\\U0001F680\\n"')).toBe('Aă🚀\n');
        expect(readYamlValue('"quoted"  # a comment')).toBe('quoted');
    });
    test('older unquoted files read as written', () => {
        const old = '---\nid: T-034\ntitle: Music page: playlists #2\nsprint: backlog\nstatus: todo\n---\nbody';
        expect(parseTask(old, '/f.md').title).toBe('Music page: playlists #2');
        expect(readYamlValue('"Fix" the bug')).toBe('"Fix" the bug');
        expect(readYamlValue('"unterminated')).toBe('"unterminated');
        expect(readYamlValue('"bad \\q escape"')).toBe('"bad \\q escape"');
    });
});
