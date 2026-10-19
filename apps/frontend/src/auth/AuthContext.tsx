import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { AuthUser } from '@supportflow/shared';

import { loginRequest, logoutRequest, meRequest, setUnauthorizedHandler } from '../services/api';

type AuthContextValue = {
  user: AuthUser | null;
  token: string | null;
  isLoading: boolean;
  /** Aviso mostrado na tela de login quando a sessao expira sozinha. */
  sessionNotice: string;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [sessionNotice, setSessionNotice] = useState('');

  const endSession = useCallback((notice: string) => {
    setToken(null);
    setUser(null);
    setSessionNotice(notice);
  }, []);

  // O token vive so na memoria. Se ele ainda estiver aqui ao montar (por
  // exemplo, depois de um recarregamento em desenvolvimento), a sessao e
  // validada com a API antes de mostrar a tela.
  useEffect(() => {
    if (!token) {
      setIsLoading(false);
      return;
    }

    let cancelado = false;
    setIsLoading(true);

    meRequest(token)
      .then((usuario) => {
        if (!cancelado) setUser(usuario);
      })
      .catch(() => {
        if (!cancelado) endSession('Sua sessao expirou. Entre novamente.');
      })
      .finally(() => {
        if (!cancelado) setIsLoading(false);
      });

    return () => {
      cancelado = true;
    };
  }, [token, endSession]);

  // Qualquer 401 vindo da API encerra a sessao e explica o motivo, em vez de
  // deixar a tela travada com um erro generico.
  useEffect(() => {
    setUnauthorizedHandler(() => {
      endSession('Sua sessao expirou. Entre novamente.');
    });
    return () => setUnauthorizedHandler(null);
  }, [endSession]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      token,
      isLoading,
      sessionNotice,
      login: async (email, password) => {
        setSessionNotice('');
        const result = await loginRequest(email, password);
        setToken(result.token);
        setUser(result.user);
        setIsLoading(false);
      },
      logout: async () => {
        const tokenAtual = token;
        setToken(null);
        setUser(null);
        setSessionNotice('');
        if (tokenAtual) {
          try {
            await logoutRequest(tokenAtual);
          } catch {
            // A sessao ja foi encerrada localmente. Falhar ao avisar o
            // servidor nao deve impedir o usuario de sair.
          }
        }
      },
    }),
    [token, user, isLoading, sessionNotice, endSession],
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
