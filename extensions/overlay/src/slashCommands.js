/**
 * Registered local slash commands for the desktop command palette.
 * Entries that start with `/` are matched here and never sent to netsocket.
 */

export function buildHelpMarkdown(commands) {
  const lines = commands
    .map((command) => `${command.name} — ${command.description}`)
    .join("\n");
  return `\n\`\`\`\n${lines}\n\`\`\`\n`;
}

export function createSlashCommands({ openSettings, showHelp, openOtp, clearPanels }) {
  return [
    {
      name: "/settings",
      description: "Open overlay settings",
      run: () => {
        openSettings();
        return { handled: true };
      },
    },
    {
      name: "/?",
      description: "Show this help menu",
      run: ({ commands }) => {
        showHelp(buildHelpMarkdown(commands));
        return { handled: true };
      },
    },
    {
      name: "/otp",
      description: "Show authenticator OTP codes",
      run: () => {
        openOtp();
        return { handled: true };
      },
    },
    {
      name: "/clear",
      description: "Close all response panels and reset the command position",
      run: () => {
        clearPanels();
        return { handled: true };
      },
    },
  ];
}

export function matchSlashCommand(text, commands) {
  const trimmed = String(text || "").trim();
  if (!trimmed.startsWith("/")) return null;

  const token = trimmed.split(/\s+/)[0].toLowerCase();
  return commands.find((command) => command.name.toLowerCase() === token) || null;
}

export function unknownSlashHelp(commands) {
  const names = commands.map((command) => command.name).join(", ");
  return `Unknown slash command. Available: ${names}`;
}
