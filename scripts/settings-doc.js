// Writes skills/settings/SKILL.md from scripts/settingsdocs.ts, hooks/settings.ts and plugin.json.
// Run: `bun scripts/settings-doc.ts` writes it; `bun scripts/settings-doc.ts --check` exits 1 when it is stale.
import { readFileSync, writeFileSync } from 'node:fs';
import { docGaps, renderSkill } from './settingsdocs';
const root = new URL('..', import.meta.url).pathname;
const skillPath = `${root}skills/settings/SKILL.md`;
const plugin = JSON.parse(readFileSync(`${root}.claude-plugin/plugin.json`, 'utf8'));
const gaps = docGaps();
if (gaps.undocumented.length + gaps.unknown.length > 0) {
    console.error(`settings-doc: add to scripts/settingsdocs.ts: ${gaps.undocumented.join(', ') || '-'}; remove: ${gaps.unknown.join(', ') || '-'}`);
    process.exit(1);
}
const text = renderSkill(plugin.userConfig ?? {});
if (process.argv.includes('--check')) {
    const current = readFileSync(skillPath, 'utf8');
    if (current !== text) {
        console.error('settings-doc: skills/settings/SKILL.md is stale; run `bun scripts/settings-doc.ts`');
        process.exit(1);
    }
    console.log('settings-doc: skills/settings/SKILL.md is current');
}
else {
    writeFileSync(skillPath, text);
    console.log(`settings-doc: wrote ${skillPath}`);
}
