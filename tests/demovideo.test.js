import { describe, expect, test } from 'claude-code/testing';
import { setupVerdict, TEAMMATE_POINTER, videoSkillSettings, voiceDir } from '../hooks/demovideo';
import { settingsOf } from '../hooks/settings';
describe('before/after videos', () => {
    test('off until chosen', () => {
        expect(settingsOf({}).demoVideos).toBe(false);
        expect(settingsOf({ demoVideos: true }).demoVideos).toBe(true);
    });
    test('video quality: 1080p medium unless chosen; the video skill reads it and its capture size', () => {
        expect(settingsOf({}).videoQuality).toBe('medium');
        expect(settingsOf({ videoQuality: 'low' }).videoQuality).toBe('low');
        expect(settingsOf({ videoQuality: '4k' }).videoQuality).toBe('medium');
        expect(videoSkillSettings('medium')).toBe('- Video quality: medium. Capture at 1920x1080 or more; make it with `--quality medium`.');
        expect(videoSkillSettings('low')).toContain('Capture at 1280x720 or more');
    });
    test("the teammate's prompt keeps a pointer: the how-to is the video skill, loaded before the first change", () => {
        expect(TEAMMATE_POINTER).toContain('load the `better-tasks:video` skill before your first change');
        expect(TEAMMATE_POINTER).not.toContain('demo-video.sh');
    });
    test('the voice lives outside any project: its own folder, else XDG data, else ~/.local/share', () => {
        expect(voiceDir({ custom: '/x/kokoro', home: '/Users/a' })).toBe('/x/kokoro');
        expect(voiceDir({ dataHome: '/data', home: '/Users/a' })).toBe('/data/better-tasks/kokoro');
        expect(voiceDir({ home: '/Users/a' })).toBe('/Users/a/.local/share/better-tasks/kokoro');
    });
    test("the setup's last line says whether the voice is ready", () => {
        expect(setupVerdict('ready /Users/a/.local/share/better-tasks/kokoro\n').isReady).toBe(true);
        const failed = setupVerdict('failed: uv is missing: brew install uv (log: /tmp/setup.log)\n');
        expect(failed).toEqual({ isReady: false, text: 'better-tasks: the Kokoro voice setup failed: uv is missing: brew install uv (log: /tmp/setup.log)' });
        expect(setupVerdict('').isReady).toBe(false);
    });
});
