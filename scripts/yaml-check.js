// Checks task front matter with real YAML parsers: Ruby's Psych (what GitHub renders with) and Bun.YAML.
// Run: `bun scripts/yaml-check.ts` checks tricky titles as formatTask writes them;
// `bun scripts/yaml-check.ts <tasks folder>` checks those files as they are and as formatTask rewrites them.
import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { bodyOf, formatTask, parseTask } from '../hooks/tasks';
import { TRICKY_TITLES } from '../tests/titles';
const FIELDS = ['id', 'title', 'sprint', 'urgent', 'status', 'owner', 'rolled', 'order', 'created'];
const PSYCH = `
require "yaml"; require "json"; require "date"
out = JSON.parse(STDIN.read).map do |head|
  value = YAML.safe_load(head, permitted_classes: [Date])
  value.is_a?(Hash) ? { "fields" => value.transform_values { |v| v.nil? ? "" : v.to_s } } : { "error" => "not a mapping" }
rescue => e
  { "error" => e.message }
end
puts JSON.generate(out)
`;
const headOf = (text) => text.match(/^---\n([\s\S]*?)\n---/)?.[1] ?? '';
function withPsych(heads) {
    const run = spawnSync('ruby', ['-e', PSYCH], { input: JSON.stringify(heads), encoding: 'utf8' });
    if (run.status !== 0)
        throw new Error(`ruby failed: ${run.stderr}`);
    return JSON.parse(run.stdout);
}
function withBun(head) {
    try {
        const value = Bun.YAML.parse(head);
        return { fields: Object.fromEntries(Object.entries(value).map(([key, v]) => [key, v == null ? '' : String(v)])) };
    }
    catch (error) {
        return { error: String(error) };
    }
}
/** What is wrong with one parse of the sample: an error, or a field that reads differently from parseTask. */
function problemsOf(parser, parsed, task) {
    if (parsed.error)
        return [`${parser}: ${parsed.error}`];
    return FIELDS.filter(name => name in parsed.fields && parsed.fields[name] !== String(task[name])).map(name => `${parser}: ${name} reads ${JSON.stringify(parsed.fields[name])}, parseTask ${JSON.stringify(String(task[name]))}`);
}
function check(label, samples) {
    const psych = withPsych(samples.map(sample => headOf(sample.text)));
    let failed = 0;
    samples.forEach((sample, at) => {
        const task = parseTask(sample.text, sample.name);
        const problems = [...problemsOf('psych', psych[at], task), ...problemsOf('bun', withBun(headOf(sample.text)), task)];
        if (formatTask(parseTask(formatTask(task), sample.name)) !== formatTask(task))
            problems.push('write, read, write differs');
        if (problems.length === 0)
            return;
        failed++;
        console.log(`FAIL ${label} ${sample.name}\n  ${problems.join('\n  ')}`);
    });
    console.log(`${label}: ${samples.length - failed}/${samples.length} ok`);
    return failed;
}
const blank = {
    id: 'T-001', title: '', sprint: 'backlog', urgent: false, status: 'todo', owner: '', rolled: 0, order: 0,
    created: '2026-10-04', file: '/t.md', body: bodyOf('g'),
};
const folders = process.argv.slice(2);
let failed = check('written', TRICKY_TITLES.map(title => ({ name: JSON.stringify(title), text: formatTask({ ...blank, title }) })));
for (const folder of folders) {
    const files = readdirSync(folder).filter(name => name.endsWith('.md'));
    const samples = files.map(name => ({ name, text: readFileSync(`${folder}/${name}`, 'utf8') }));
    failed += check(`as is ${folder}`, samples);
    failed += check(`rewritten ${folder}`, samples.map(sample => ({ ...sample, text: formatTask(parseTask(sample.text, sample.name)) })));
    const changed = samples.filter(sample => formatTask(parseTask(sample.text, sample.name)) !== sample.text).map(sample => sample.name);
    console.log(`rewriting would change ${changed.length} file(s)${changed.length ? `: ${changed.join(', ')}` : ''}`);
}
process.exit(failed === 0 ? 0 : 1);
