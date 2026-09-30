import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import type { AuthUser } from '@supportflow/shared';

import { loginRequest, logoutRequest } from '../services/api';

type AuthContextValue = {
  user: AuthUser | null;
  token: string | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      token,
      isLoading: false,
      login: async (email, password) => {
        const result = await loginRequest(email, password);
        setToken(result.token);
        setUser(result.user);
      },
      logout: async () => {
        if (token) {
          try {
            await logoutRequest(token);
          } finally {
            setToken(null);
            setUser(null);
          }
        }
      },
    }),
    [token, user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }

  return context;
}
