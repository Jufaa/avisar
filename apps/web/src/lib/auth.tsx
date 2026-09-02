import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { UserDto } from '@avisar/shared';
import { api, getToken, setToken } from './api';

interface AuthValue {
  user: UserDto | null;
  loading: boolean;
  signIn(token: string): Promise<void>;
  signOut(): void;
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  /**
   * The token lives in React state, not only in localStorage.
   *
   * localStorage is not reactive: reading it during render means signing in
   * never re-renders this provider, the `/me` query stays disabled, and the
   * route guard bounces the user straight back to the login screen.
   * localStorage is the persistence layer; this state is the source of truth
   * for rendering.
   */
  const [token, setTokenState] = useState<string | null>(() => getToken());

  const { data, isPending, isError } = useQuery({
    queryKey: ['me', token],
    queryFn: () => api<UserDto>('/me'),
    enabled: token !== null,
    retry: false,
    staleTime: 5 * 60_000,
  });

  const signIn = useCallback(
    async (next: string) => {
      setToken(next);
      setTokenState(next);
      await queryClient.invalidateQueries();
    },
    [queryClient],
  );

  const signOut = useCallback(() => {
    setToken(null);
    setTokenState(null);
    // `clear()` drops every cached response, so nothing from the previous
    // account survives. A full page reload used to do this too, but it also
    // made signing out depend on the server answering a fresh request — and
    // left a blank page when it could not.
    queryClient.clear();
    navigate('/ingresar', { replace: true });
  }, [queryClient, navigate]);

  // A stored token the API refuses is the same as no session at all. Clearing
  // it stops every later request from retrying with credentials already known
  // to be dead.
  useEffect(() => {
    if (isError && token !== null) {
      setToken(null);
      setTokenState(null);
    }
  }, [isError, token]);

  const value = useMemo<AuthValue>(
    () => ({
      user: data ?? null,
      // `isPending` covers the window between "we have a token" and "the API
      // answered". `isLoading` does not: it is false on the first render after
      // the query is enabled, which is exactly when the guard runs.
      loading: token !== null && isPending && !isError,
      signIn,
      signOut,
    }),
    [data, token, isPending, isError, signIn, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside <AuthProvider>');
  return context;
}
