/*
 * Client-side-only slash commands, mirroring the desktop overlay's
 * src/slashCommands.js. These never reach the host — the command palette
 * checks isSlashCommand() first and, if true, calls run() instead of
 * sending the text over the network.
 */
export const SLASH_COMMANDS = [
    { name: '/?', help: 'Show this list of commands' },
    { name: '/settings', help: 'Open extension preferences' },
    { name: '/otp', help: 'Open the authenticator window' },
    { name: '/clear', help: 'Clear the chat and start a new conversation' },
];

export function isSlashCommand(text) {
    return typeof text === 'string' && text.trim().startsWith('/');
}

/**
 * @param {string} text raw input, already confirmed to be a slash command
 * @param {object} actions {openSettings, openOtp, clearChat}
 * @returns {string} a line of local feedback to show in the chat log
 */
export function runSlashCommand(text, actions) {
    const cmd = text.trim().split(/\s+/)[0].toLowerCase();
    switch (cmd) {
        case '/?':
            return SLASH_COMMANDS.map(c => `${c.name} — ${c.help}`).join('\n');
        case '/settings':
            actions.openSettings?.();
            return 'Opening preferences…';
        case '/otp':
            actions.openOtp?.();
            return 'Opening authenticator…';
        case '/clear':
            actions.clearChat?.();
            return 'Started a new conversation.';
        default:
            return `Unknown command "${cmd}". Type /? for a list of local commands.`;
    }
}
