// Task titles that test the YAML front matter: read by tests/yaml.test.ts and scripts/yaml-check.ts.
export const LINE_SEPARATOR = String.fromCharCode(0x2028);
/** Titles that break, or change type in, an unquoted YAML value. */
export const QUOTED_TITLES = [
    'Music page like the Songs page: playlists, search, recents, queue orders',
    'Ends with a colon:',
    'Fix #12 and the # sign',
    'Bug #12',
    "'single' quoted start",
    '"double" quoted start',
    '"whole title in quotes"',
    '[draft] leading bracket',
    '{braces} first',
    '* starred',
    '- dashed',
    '& anchor',
    '! tag',
    '| pipe',
    '> fold',
    '% percent',
    '@ at',
    '`code` first',
    '? question',
    ', comma',
    'Cântări noi: ș, ț, ă, î, â',
    'yes',
    'No',
    'null',
    '~',
    'true',
    '1.0',
    '42',
    '0x1F',
    '.inf',
    '1:20',
    'Back\\slash and tab\there',
    `Line${LINE_SEPARATOR}separator`,
];
/** Titles YAML reads back the same unquoted. */
export const PLAIN_TITLES = ['Ship it 🚀 now', 'Search → results', 'Cântări noi și țară', 'It\'s "quoted" inside', 'C:\\path\\to', 'a:b', 'C# build'];
export const TRICKY_TITLES = [...QUOTED_TITLES, ...PLAIN_TITLES];
