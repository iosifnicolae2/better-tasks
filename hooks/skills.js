// The plugin's skills (skills/<name>/SKILL.md): how-tos loaded when their step comes, instead of rules
// pasted into every prompt. The prompts keep a one-line pointer to each. When one loads, register.tsx's
// skill.prompt hook fills in the plugin's path and puts the settings it follows under its title ("## Settings"),
// so a skill always follows the settings in force.
const PLUGIN = 'better-tasks';
const SKILLS = ['video', 'testing', 'done', 'contribute', 'pull-request'];
const PLUGIN_ROOT = /\$\{CLAUDE_PLUGIN_ROOT\}/g;
/** The name as the model calls it. */
export const skillCall = (name) => `${PLUGIN}:${name}`;
/** Which of our skills a skill.prompt event is about: "better-tasks:video" (or a bare "video"). */
export function ourSkill(skill) {
    const name = skill.startsWith(`${PLUGIN}:`) ? skill.slice(PLUGIN.length + 1) : skill;
    return SKILLS.find(own => own === name);
}
const TITLE = /^# .*$/m;
/**
 * The skill's text with the plugin's path filled in and its settings right under its title, so they
 * read as this skill's even when several load in a row (none: as it is).
 */
export function fillSkill(text, root, settingsLines) {
    const filled = text.replace(PLUGIN_ROOT, root);
    if (!settingsLines)
        return filled;
    const settings = `## Settings\n${settingsLines}`;
    const title = TITLE.exec(filled);
    if (!title)
        return `${settings}\n\n${filled}`;
    const end = title.index + title[0].length;
    return `${filled.slice(0, end)}\n${settings}\n${filled.slice(end)}`;
}
