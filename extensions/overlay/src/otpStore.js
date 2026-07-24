const STORAGE_KEY = "netsocket.otp_accounts";

export function loadOtpAccounts() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    const accounts = Array.isArray(parsed?.accounts) ? parsed.accounts : [];
    return accounts
      .map((item) => {
        const key = String(item?.key || "").trim();
        const secret = String(item?.secret || "").trim();
        if (!key || !secret) return null;
        return {
          key,
          issuer: String(item?.issuer || ""),
          account: String(item?.account || ""),
          secret,
          code: null,
          periodSeconds: Number(item?.periodSeconds) || 30,
        };
      })
      .filter(Boolean);
  } catch {
    return [];
  }
}

export function saveOtpAccounts(accounts) {
  try {
    const payload = {
      accounts: accounts.map((account) => ({
        key: account.key,
        issuer: account.issuer,
        account: account.account,
        secret: account.secret,
        periodSeconds: account.periodSeconds || 30,
      })),
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // Best-effort persistence; in-memory list still works for this session.
  }
}
