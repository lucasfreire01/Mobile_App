import * as SecureStore from "expo-secure-store";
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from "react";
import { Platform } from "react-native";
import { getApiUrl } from "../config/api";
import { fetchWithTimeout, revokeAccessToken } from "../lib/fetch-with-timeout";

const SESSION_KEY = "browan.session";

const sessionStorage = {
 async setItem(key: string, value: string) {
 // Web sessions stay in memory so a page reload always requires sign-in.
 if (Platform.OS === "web") return;
 await SecureStore.setItemAsync(key, value);
  },
  async removeItem(key: string) {
    if (Platform.OS === "web") {
      window.localStorage.removeItem(key);
      return;
    }

    await SecureStore.deleteItemAsync(key);
  },
};

type AuthenticatedUser = {
  id: number;
  fullName: string;
  email: string;
  isAdmin: boolean;
};

type AuthContextValue = {
  token: string | null;
  user: AuthenticatedUser | null;
  isRestoring: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  apiFetch: (url: string, options?: RequestInit) => Promise<Response>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: PropsWithChildren) {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<AuthenticatedUser | null>(null);
  const [isRestoring, setIsRestoring] = useState(true);

  useEffect(() => {
    let isMounted = true;

 async function clearPreviousSession() {
 try {
 await sessionStorage.removeItem(SESSION_KEY);
 } catch {
 // A storage failure must never restore an old credential.
      } finally {
        if (isMounted) setIsRestoring(false);
      }
    }

 void clearPreviousSession();
    return () => {
      isMounted = false;
    };
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      token,
      user,
      isRestoring,
      async login(email, password) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10_000);

        try {
          const response = await fetchWithTimeout(`${getApiUrl()}/auth/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email, password }),
            signal: controller.signal,
          });
          const body = await response.json().catch(() => null);

          if (!response.ok || !body?.data?.token) {
            const message =
              body?.errors?.[0]?.message ?? "Não foi possível entrar.";
            throw new Error(message);
          }

          await sessionStorage.setItem(
            SESSION_KEY,
            JSON.stringify({ token: body.data.token, user: body.data.user }),
          );
          setToken(body.data.token);
          setUser(body.data.user);
        } catch (error) {
          if (error instanceof Error && error.name === "AbortError") {
            throw new Error(
              "A API não respondeu em 10 segundos. Verifique a URL e o servidor.",
            );
          }

          throw error;
        } finally {
          clearTimeout(timeout);
        }
      },
      async logout() {
        setToken(null);
        setUser(null);
        await Promise.all([
          sessionStorage.removeItem(SESSION_KEY).catch(() => undefined),
          token
            ? revokeAccessToken(getApiUrl(), token).catch(() => undefined)
            : Promise.resolve(),
        ]);
      },
      async apiFetch(url, options) {
        const headers = new Headers(options?.headers);
        if (token) headers.set("Authorization", `Bearer ${token}`);

        const response = await fetchWithTimeout(url, { ...options, headers });
        if (response.status === 401) {
          setToken(null);
          setUser(null);
          await sessionStorage.removeItem(SESSION_KEY).catch(() => undefined);
        }

        return response;
      },
    }),
    [isRestoring, token, user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth deve ser usado dentro de AuthProvider.");
  }

  return context;
}
