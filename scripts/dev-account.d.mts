export type EnsureDevAccountResult =
  | { status: 'created' | 'reset' | 'already-works' }
  | { status: 'hidden'; seen: number }
  | { status: 'list-failed'; message: string }
  | { status: 'error'; message: string }

export function ensureDevAccount(options: {
  admin: {
    createUser(attributes: { email: string; password: string; email_confirm: boolean }): Promise<{ error: { code?: string; message: string } | null }>
    listUsers(params: { page: number; perPage: number }): Promise<{ data: { users: { id: string; email?: string | null }[] } | null; error: { message: string } | null }>
    updateUserById(id: string, attributes: { password: string; email_confirm: boolean }): Promise<{ error: { message: string } | null }>
  }
  signIn(email: string, password: string): Promise<{ error: unknown }>
  email: string
  password: string
}): Promise<EnsureDevAccountResult>
