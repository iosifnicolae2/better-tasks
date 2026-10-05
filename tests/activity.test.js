import { expect, test } from 'claude-code/testing';
import { activityOf, stateWord } from '../hooks/activity';
test('a tool call reads as a few words of activity', () => {
    expect(activityOf('Edit', { file_path: '/repo/hooks/auth.ts' })).toBe('editing auth.ts');
    expect(activityOf('Read', { file_path: '/repo/README.md' })).toBe('reading README.md');
    expect(activityOf('Bash', { command: 'npm test\necho done' })).toBe('running npm test');
    expect(activityOf('Grep', { pattern: 'login' })).toBe('searching login');
    expect(activityOf('AskUserQuestion', {})).toBe('waiting for your answer');
    expect(activityOf('mcp__better-tasks__task_update', {})).toBe('task update');
    expect(activityOf('Bash', { command: 'x'.repeat(80) })).toHaveLength(40);
});
test('engine statuses read as plain words', () => {
    expect(stateWord('running')).toBe('working');
    expect(stateWord('completed')).toBe('done');
    expect(stateWord('idle')).toBe('idle');
});
