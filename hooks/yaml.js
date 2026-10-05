// One YAML front-matter value: written plain when YAML reads it back as the same string, else double-quoted.
// Words and numbers YAML (1.1 or 1.2) reads as a boolean, null or number instead of a string.
const TYPED = [
    /^(?:~|null|Null|NULL|true|True|TRUE|false|False|FALSE|yes|Yes|YES|no|No|NO|on|On|ON|off|Off|OFF|y|Y|n|N)$/,
    /^[-+]?(?:\d[\d_]*(?:\.[\d_]*)?|\.\d[\d_]*)(?:[eE][-+]?\d+)?$/,
    /^[-+]?\d[\d_]*(?::[0-5]?\d)+(?:\.[\d_]*)?$/,
    /^[-+]?\.(?:inf|Inf|INF)$/,
    /^\.(?:nan|NaN|NAN)$/,
    /^0(?:x[\da-fA-F_]+|o[0-7_]+|b[01_]+)$/,
];
// A plain value can't start with an indicator, hold ": " or " #", end in ":" or space, or hold a non-printable.
const INDICATOR_START = /^[-?:,[\]{}#&*!|>'"%@`\s]/;
const BREAKS_PLAIN = /: |:\t|:$| #|\t#|\s$/;
const UNPRINTABLE = /[^\x20-\x7E\xA0-\u2027\u202A-\uD7FF\uE000-\uFFFD\u{10000}-\u{10FFFF}]/u;
const ESCAPES = { '\\': '\\\\', '"': '\\"', '\n': '\\n', '\r': '\\r', '\t': '\\t' };
const UNESCAPES = {
    '0': '\0', a: '\x07', b: '\b', t: '\t', '\t': '\t', n: '\n', v: '\v', f: '\f', r: '\r', e: '\x1B',
    ' ': ' ', '"': '"', '/': '/', '\\': '\\', N: '\x85', _: '\xA0', L: '\u2028', P: '\u2029',
};
const HEX_LENGTH = { x: 2, u: 4, U: 8 };
/** Joins the lines with a space: front-matter fields hold one line. */
export function oneLine(text) {
    return text.replace(/\s*[\r\n\x85\u2028\u2029]+\s*/g, ' ').trim();
}
export function isPlainSafe(text) {
    if (text === '')
        return true;
    return !INDICATOR_START.test(text) && !BREAKS_PLAIN.test(text) && !UNPRINTABLE.test(text) && !TYPED.some(typed => typed.test(text));
}
function escaped(char) {
    return ESCAPES[char] ?? `\\u${char.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')}`;
}
/** The text as a YAML value: plain when that reads back the same, else double-quoted. */
export function yamlValue(text) {
    if (isPlainSafe(text))
        return text;
    return `"${text.replace(new RegExp(`[\\\\"\\n\\r\\t]|${UNPRINTABLE.source}`, 'gu'), escaped)}"`;
}
function doubleQuoted(raw) {
    let text = '';
    for (let at = 1; at < raw.length; at++) {
        const char = raw[at];
        if (char === '"')
            return { text, end: at + 1 };
        if (char !== '\\') {
            text += char;
            continue;
        }
        const code = raw[++at] ?? '';
        const length = HEX_LENGTH[code];
        if (length) {
            const hex = raw.slice(at + 1, at + 1 + length);
            if (!/^[\da-fA-F]+$/.test(hex) || hex.length !== length)
                return undefined;
            text += String.fromCodePoint(parseInt(hex, 16));
            at += length;
        }
        else if (code in UNESCAPES) {
            text += UNESCAPES[code];
        }
        else {
            return undefined;
        }
    }
    return undefined;
}
function singleQuoted(raw) {
    let text = '';
    for (let at = 1; at < raw.length; at++) {
        const char = raw[at];
        if (char !== "'")
            text += char;
        else if (raw[at + 1] === "'")
            text += raw[++at];
        else
            return { text, end: at + 1 };
    }
    return undefined;
}
/**
 * The string a one-line YAML value holds. A quoted value is unquoted and unescaped; anything else,
 * including a value an older version wrote unquoted (like "Fix: the redirect"), reads as written.
 */
export function readYamlValue(raw) {
    const value = raw.trim();
    const quoted = value.startsWith('"') ? doubleQuoted(value) : value.startsWith("'") ? singleQuoted(value) : undefined;
    if (!quoted)
        return value;
    const rest = value.slice(quoted.end).trim();
    return rest === '' || rest.startsWith('#') ? quoted.text : value;
}
