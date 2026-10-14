const ACTIONS = [
  {
    id: "lock",
    title: "Lock",
    subtitle: "Lock this PC",
    aliases: ["lock", "lock pc", "lock computer"],
  },
  {
    id: "sleep",
    title: "Sleep",
    subtitle: "Sleep this PC",
    aliases: ["sleep", "suspend"],
  },
  {
    id: "hibernate",
    title: "Hibernate",
    subtitle: "Hibernate this PC",
    aliases: ["hibernate"],
  },
  {
    id: "taskmgr",
    title: "Task Manager",
    subtitle: "Open Task Manager",
    aliases: ["task manager", "taskmgr"],
  },
  {
    id: "settings",
    title: "Windows Settings",
    subtitle: "Open Settings",
    aliases: ["settings", "windows settings"],
  },
  {
    id: "shutdown",
    title: "Shut down",
    subtitle: "Press Enter again to shut down",
    aliases: ["shutdown", "shut down", "power off"],
    confirm: true,
  },
  {
    id: "restart",
    title: "Restart",
    subtitle: "Press Enter again to restart",
    aliases: ["restart", "reboot"],
    confirm: true,
  },
  {
    id: "signout",
    title: "Sign out",
    subtitle: "Press Enter again to sign out",
    aliases: ["sign out", "log off", "logoff", "signout"],
    confirm: true,
  },
  {
    id: "recycle",
    title: "Empty Recycle Bin",
    subtitle: "Press Enter again to empty the recycle bin",
    aliases: ["empty recycle bin", "empty trash", "recycle bin"],
    confirm: true,
  },
];

export function systemResults(query, scoreText) {
  const text = String(query || "").trim();
  if (text.length < 2) return [];
  return ACTIONS.map((action) => {
    const labels = [action.title, ...action.aliases];
    const score = Math.max(...labels.map((label) => scoreText(text, label)));
    const exact = labels.some((label) => scoreText(text, label) >= 1000);
    const direct = exact || (score >= 800 && text.length >= 4);
    return {
      id: `system:${action.id}`,
      title: action.title,
      subtitle: action.subtitle,
      category: "System",
      score: 1600 + score,
      direct: direct && score >= 800,
      confirm: Boolean(action.confirm),
      action: { type: "invoke", invoke: "system", target: action.id },
    };
  })
    .filter((result) => result.score >= 1600 + 800)
    .sort((a, b) => b.score - a.score);
}
