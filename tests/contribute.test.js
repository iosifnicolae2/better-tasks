import { describe, expect, test } from 'claude-code/testing';
import { CONTRIBUTE_POINTER, contributeSkillSettings, readUpstreamPr, saveUpstreamPr, upstreamPrOf, userFile } from '../hooks/contribute';
function memoryFiles(start = {}) {
    const disk = { ...start };
    return {
        disk,
        read: async (path) => {
            if (!(path in disk))
                throw new Error('missing');
            return disk[path];
        },
        write: async (path, text) => {
            disk[path] = text;
        },
    };
}
const DIR = '/home/me/.claude';
describe('changes to better-tasks itself', () => {
    test("the lead's prompt keeps a pointer; the steps are the contribute skill", () => {
        expect(CONTRIBUTE_POINTER).toContain('load the `better-tasks:contribute` skill before you file it');
        expect(CONTRIBUTE_POINTER).not.toContain('gh repo fork');
    });
    test('the skill asks the PR question until the user says "Never"', () => {
        const asks = contributeSkillSettings('ask');
        expect(asks).toContain('"Yes, open a PR"');
        expect(asks).toContain('gh pr create --repo iosifnicolae2/better-tasks');
        expect(asks).toContain('"Not now"');
        expect(asks).toContain('"Never"');
        const never = contributeSkillSettings('never');
        expect(never).not.toContain('AskUserQuestion');
        expect(never).toContain('the user chose "Never"');
    });
    test('no file, or a broken one, means ask', () => {
        expect(upstreamPrOf(undefined)).toBe('ask');
        expect(upstreamPrOf('not json')).toBe('ask');
        expect(upstreamPrOf('{"upstreamPr":"never"}')).toBe('never');
    });
    test('"Never" sticks per user; "Not now" and "Yes" ask again; other keys stay', async () => {
        const files = memoryFiles({ [userFile(DIR)]: '{"other":1}' });
        expect(await readUpstreamPr(files, DIR)).toBe('ask');
        await saveUpstreamPr(files, DIR, 'never');
        expect(await readUpstreamPr(files, DIR)).toBe('never');
        expect(JSON.parse(files.disk[userFile(DIR)])).toEqual({ other: 1, upstreamPr: 'never' });
        await saveUpstreamPr(files, DIR, 'not-now');
        expect(await readUpstreamPr(files, DIR)).toBe('ask');
        expect(await saveUpstreamPr(files, DIR, 'yes')).toContain('gh pr create --repo iosifnicolae2/better-tasks');
        expect(await readUpstreamPr(files, DIR)).toBe('ask');
    });
    test('an unknown answer counts as ask', async () => {
        const files = memoryFiles();
        await saveUpstreamPr(files, DIR, 'maybe');
        expect(await readUpstreamPr(files, DIR)).toBe('ask');
    });
    test('kept in the Claude Code folder, outside any project', () => {
        expect(userFile(DIR)).toBe('/home/me/.claude/better-tasks/user.json');
    });
});
