import { isOpen } from './tasks';
const SCORE = { id: 1000, phrase: 300, word: 100, prefix: 50, body: 10, bodyRepeat: 2, open: 5 };
const SNIPPET_SIDE = 60;
const REPEATS_COUNTED = 5;
/** Lower case, accents dropped ("Café" → "cafe"), with each kept character's place in the original. */
function folded(text) {
    let out = '';
    const at = [];
    for (let index = 0; index < text.length; index++) {
        const plain = (text[index] ?? '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
        out += plain;
        for (let n = 0; n < plain.length; n++)
            at.push(index);
    }
    return { text: out, at };
}
export const fold = (text) => folded(text).text;
const wordsOf = (query) => fold(query).split(/[^\p{L}\p{N}-]+/u).filter(Boolean);
const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const hasWord = (text, word) => new RegExp(`(^|[^\\p{L}\\p{N}])${escape(word)}($|[^\\p{L}\\p{N}])`, 'u').test(text);
const hasPrefix = (text, word) => new RegExp(`(^|[^\\p{L}\\p{N}])${escape(word)}`, 'u').test(text);
const count = (text, word) => text.split(word).length - 1;
/** Where the words occur in `text`, as merged [start, end) ranges of the original characters. */
export function matchRanges(text, words) {
    const { text: plain, at } = folded(text);
    const ranges = [];
    for (const word of words) {
        for (let index = plain.indexOf(word); index >= 0; index = plain.indexOf(word, index + word.length)) {
            ranges.push([at[index] ?? 0, (at[index + word.length - 1] ?? 0) + 1]);
        }
    }
    ranges.sort((a, b) => a[0] - b[0]);
    return ranges.reduce((merged, range) => {
        const last = merged.at(-1);
        if (last && range[0] <= last[1])
            last[1] = Math.max(last[1], range[1]);
        else
            merged.push([...range]);
        return merged;
    }, []);
}
/** "…around the first match…" in the original body text, on one line. */
function snippetOf(body, words) {
    const { text, at } = folded(body);
    const hits = words.map(word => text.indexOf(word)).filter(index => index >= 0);
    if (hits.length === 0)
        return '';
    const first = Math.min(...hits);
    const start = at[Math.max(0, first - SNIPPET_SIDE)] ?? 0;
    const end = (at[Math.min(text.length - 1, first + SNIPPET_SIDE)] ?? body.length - 1) + 1;
    const middle = body.slice(start, end).replace(/^#+ /gm, '').replace(/\s+/g, ' ').trim();
    const before = body.slice(0, start).trim() ? '…' : '';
    const after = body.slice(end).trim() ? '…' : '';
    return `${before}${middle}${after}`;
}
/** The body without the template's own headings, so "goal" or "notes" don't match every task. */
const bodyText = (task) => task.body.replace(/^## (Goal|Notes|Plan)\s*$/gm, '');
function scoreOf(task, query, words) {
    const id = fold(task.id);
    const title = fold(task.title);
    const body = fold(bodyText(task));
    const isId = fold(query.trim()) === id;
    const fields = new Set();
    let score = isId ? SCORE.id : 0;
    if (isId)
        fields.add('id');
    if (title.includes(words.join(' ')))
        score += SCORE.phrase;
    for (const word of words) {
        const inId = id.includes(word);
        const inTitle = title.includes(word);
        const inBody = body.includes(word);
        if (!inId && !inTitle && !inBody && !isId)
            return undefined;
        if (inId)
            fields.add('id');
        if (inTitle) {
            fields.add('title');
            score += hasWord(title, word) ? SCORE.word : hasPrefix(title, word) ? SCORE.prefix : SCORE.body;
        }
        if (inBody) {
            fields.add('body');
            score += SCORE.body + SCORE.bodyRepeat * Math.min(REPEATS_COUNTED, count(body, word));
        }
    }
    if (isOpen(task))
        score += SCORE.open;
    const snippet = snippetOf(bodyText(task), words);
    const titleMatches = matchRanges(task.title, words);
    if (!snippet)
        return { task, score, fields: [...fields], titleMatches };
    return { task, score, fields: [...fields], titleMatches, snippet, snippetMatches: matchRanges(snippet, words) };
}
const newestFirst = (a, b) => b.created.localeCompare(a.created) || b.id.localeCompare(a.id, undefined, { numeric: true });
/** Every task matching all the query's words, best first: id, then title phrase, title words, title prefixes, then body. */
export function searchTasks(tasks, query, limit = 20) {
    const words = wordsOf(query);
    if (words.length === 0)
        return [];
    return tasks
        .flatMap(task => scoreOf(task, query, words) ?? [])
        .sort((a, b) => b.score - a.score || newestFirst(a.task, b.task))
        .slice(0, limit);
}
