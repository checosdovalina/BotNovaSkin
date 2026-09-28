export type LocalRole = 'staff' | 'admin' | 'superadmin';
export type LocalUser = { id: string; email: string; role: LocalRole };
export type ManagedUser = LocalUser & { active: boolean };
export const canManageContent = (role?: LocalRole) => role === 'admin' || role === 'superadmin';
export const roleLabel = (role?: LocalRole) => role === 'superadmin' ? 'Superadministración' : role === 'admin' ? 'Administración' : 'Recepción';

export class AuthApiError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

async function request<T>(path: string, method = 'GET', body?: object): Promise<T> {
  const response = await fetch(path, {
    method,
    credentials: 'same-origin',
    headers: { Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    if (response.status === 401 && path !== '/api/auth/login' && path !== '/api/auth/me') {
      window.dispatchEvent(new Event('estetica:session-expired'));
    }
    const message = data && typeof data === 'object' && 'error' in data && typeof data.error === 'string'
      ? data.error : response.status === 401 ? 'Tu sesión terminó. Vuelve a iniciar sesión.' : 'No se pudo completar la solicitud.';
    throw new AuthApiError(message, response.status);
  }
  return data as T;
}

export const authApi = {
  me: async () => {
    try { return await request<{ user: LocalUser | null }>('/api/auth/me'); }
    catch (error) {
      if (error instanceof AuthApiError && error.status === 401) return { user: null };
      throw error;
    }
  },
  login: (email: string, password: string) => request<{ user: LocalUser }>('/api/auth/login', 'POST', { email, password }),
  logout: () => request<unknown>('/api/auth/logout', 'POST'),
  password: (currentPassword: string, newPassword: string) => request<unknown>('/api/auth/password', 'POST', { currentPassword, newPassword }),
  users: () => request<{ users: ManagedUser[] }>('/api/admin/users'),
  createUser: (email: string, password: string, role: LocalUser['role']) => request<{ user: ManagedUser }>('/api/admin/users', 'POST', { email, password, role }),
  updateUser: (id: string, changes: { active?: boolean; role?: LocalUser['role']; password?: string }) =>
    request<{ user: ManagedUser }>(`/api/admin/users/${encodeURIComponent(id)}`, 'PATCH', changes),
};