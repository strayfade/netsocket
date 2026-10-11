/**
 * Registered local slash commands for the desktop command palette.
 * Entries that start with `/` are matched here and never sent to netsocket.
 */

export function createSlashCommands({ openSettings, openOtp, clearPanels, cancelQuery }) {
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
    {
      name: "/cancel",
      description: "Stop the running query",
      run: () => {
        cancelQuery();
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

export function suggestSlashCommands(text, commands) {
  const raw = String(text || "");
  if (!raw.startsWith("/") || /\s/.test(raw)) return [];

  const token = raw.toLowerCase();
  return commands.filter((command) => command.name.toLowerCase().startsWith(token));
}

export function unknownSlashHelp(commands) {
  const names = commands.map((command) => command.name).join(", ");
  return `Unknown slash command. Available: ${names}`;
}
