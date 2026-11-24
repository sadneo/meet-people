// Write-side username rule. Read schemas stay permissive: older rows may be
// mixed-case or contain spaces and must keep loading.
export const usernameRule = /^[a-z0-9._]{3,30}$/
export const usernameRuleMessage = 'Use 3-30 lowercase letters, numbers, . or _ for your username.'
export const normalizeUsername = (value: string) => value.trim().toLowerCase()
// Returns the normalized handle for a new or changed username, or an error message.
// An unchanged saved username is passed through so legacy handles keep saving.
export function checkUsernameWrite(value: string, saved: string | null | undefined): { username: string } | { error: string } {
  if (saved !== undefined && saved !== null && value.trim() === saved.trim()) return { username: value.trim() }
  const username = normalizeUsername(value)
  return usernameRule.test(username) ? { username } : { error: usernameRuleMessage }
}
