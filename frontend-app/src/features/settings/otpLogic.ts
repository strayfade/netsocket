// Pure logic behind the Authenticator settings page. Deliberately side-effect free
// and import-free so tests/settingsOtpAccounts.test.js can require() this file
// directly via Node's built-in type stripping (tsconfig keeps erasableSyntaxOnly).

export type OtpAccount = { issuer: string; account: string; secret: string }

export type ParsedOtp = { accounts: OtpAccount[]; invalid: string[] }

export type OtpField = 'issuer' | 'account' | 'secret'

export type OtpValidation = { index: number; field: OtpField; message: string }

export type OtpSaveResult =
  | { ok: true; value: string; duplicates: number }
  | { ok: false; error: OtpValidation }

/**
 * Parse the stored `Issuer:Account:Secret,...` string. Account names may contain
 * colons (e.g. "Bank:Joint:Checking"), so the issuer is the first segment and the
 * secret is the last. Unparseable entries are kept in `invalid` and re-appended on
 * save so a hand-edited value never silently disappears.
 */
export function parseOtpAccounts(raw: string | null | undefined): ParsedOtp {
  const accounts: OtpAccount[] = []
  const invalid: string[] = []
  if (raw == null) return { accounts, invalid }
  for (const segment of String(raw).split(',')) {
    const seg = segment.trim()
    if (!seg) continue
    const firstColon = seg.indexOf(':')
    const lastColon = seg.lastIndexOf(':')
    if (firstColon === -1 || firstColon === lastColon) {
      invalid.push(seg)
      continue
    }
    const issuer = seg.slice(0, firstColon).trim()
    const account = seg.slice(firstColon + 1, lastColon).trim()
    const secret = seg.slice(lastColon + 1).trim().replace(/\s+/g, '')
    if (!issuer || !account || !secret) {
      invalid.push(seg)
      continue
    }
    accounts.push({ issuer, account, secret })
  }
  return { accounts, invalid }
}

/**
 * Validate and re-serialize. Returns the first validation failure (row index + field)
 * or the serialized preference value. Whitespace inside a secret is stripped, matching
 * how the server-side OTP controller tolerates pasted secrets.
 */
export function serializeOtpAccounts(accounts: OtpAccount[], invalidRaw: string[]): OtpSaveResult {
  const entries: string[] = []
  let duplicates = 0
  const seen = new Set<string>()
  for (let i = 0; i < accounts.length; i++) {
    const issuer = accounts[i].issuer.trim()
    const account = accounts[i].account.trim()
    const secret = accounts[i].secret.replace(/\s+/g, '')
    if (!issuer && !account && !secret) continue
    const field: OtpField = !issuer ? 'issuer' : !account ? 'account' : 'secret'
    if (!issuer || !account || !secret) {
      return {
        ok: false,
        error: { index: i, field, message: 'Each account needs an issuer, an account name, and a secret.' },
      }
    }
    if (issuer.includes(':') || issuer.includes(',')) {
      return { ok: false, error: { index: i, field: 'issuer', message: 'Issuer cannot contain a colon or comma.' } }
    }
    if (account.includes(',')) {
      return { ok: false, error: { index: i, field: 'account', message: 'Account name cannot contain a comma.' } }
    }
    if (secret.includes(':') || secret.includes(',')) {
      return { ok: false, error: { index: i, field: 'secret', message: 'Secret cannot contain a colon or comma.' } }
    }
    const key = `${issuer}:${account}`
    if (seen.has(key)) duplicates++
    seen.add(key)
    entries.push(`${key}:${secret}`)
  }
  return { ok: true, value: entries.concat(invalidRaw).join(','), duplicates }
}

export function otpCountLabel(n: number): string {
  return n === 1 ? '1 account' : `${n} accounts`
}
