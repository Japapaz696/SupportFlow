export const userRoles = ['requester', 'agent', 'manager', 'admin'] as const;

export type UserRole = (typeof userRoles)[number];

export type User = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type AuthUser = Pick<User, 'id' | 'name' | 'email' | 'role'>;

/**
 * Membro de equipe apto a receber chamados (agente/gestor/admin ativo).
 * Usado para montar a lista de atribuicao no frontend.
 */
export type AssignableUser = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
};

export type LoginResponse = {
  token: string;
  user: AuthUser;
};
