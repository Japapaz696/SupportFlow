import { userRoles, type AuthUser, type User, type UserRole } from '@supportflow/shared';

export type UserRow = {
  id: string;
  name: string;
  email: string;
  password_hash: string;
  role: UserRole;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
};

export type CreateUserInput = {
  name: string;
  email: string;
  passwordHash: string;
  role: UserRole;
};

export type UpdateUserInput = {
  name?: string;
  role?: UserRole;
  isActive?: boolean;
};

export function isUserRole(value: unknown): value is UserRole {
  return typeof value === 'string' && userRoles.includes(value as UserRole);
}

export function toUser(row: UserRow): User {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    isActive: row.is_active,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

export function toAuthUser(row: UserRow): AuthUser {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
  };
}
