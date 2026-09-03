/**
 * ============================================================================
 * VIBE SOCIAL PLATFORM — AUTH CONTEXT (src/context/AuthContext.tsx)
 * User session, JWT lifecycle & Quotas provider
 * ============================================================================
 */

import React, { createContext, useContext, useState, useEffect } from 'react';
import type { User, Profile, MAIQuotas } from '../types/vibe';
import { ApiService } from '../services/api';

interface AuthContextType {
  user: User | null;
  profile: Profile | null;
  isAuthenticated: boolean;
  isLoadingSession: boolean;
  token: string | null;
  quotas: MAIQuotas | null;
  loginWithToken: (token: string) => Promise<void>;
  logout: () => void;
  refreshQuotas: () => Promise<void>;
  updateUserAvatar: (avatarUrl: string) => Promise<void>;
  updateUser: (partial: Partial<User>) => void;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [token, setToken] = useState<string | null>(() => ApiService.getToken());
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [quotas, setQuotas] = useState<MAIQuotas | null>(null);
  const [isLoadingSession, setIsLoadingSession] = useState(true);

  const fetchSession = async () => {
    const currentToken = ApiService.getToken();
    if (!currentToken) {
      setUser(null);
      setProfile(null);
      setQuotas(null);
      setIsLoadingSession(false);
      return;
    }

    try {
      const data = await ApiService.getCurrentUser();
      setUser(data.user);
      setProfile(data.profile);
      setQuotas(data.quotas);
    } catch (err: any) {
      // On ne déconnecte que sur une vraie invalidation (401).
      // Une erreur réseau ou un 500 ponctuel ne doit pas détruire la session.
      if (err?.status === 401) {
        console.warn('[AuthContext] Session expirée ou non autorisée:', err.message);
        ApiService.removeToken();
        setToken(null);
        setUser(null);
        setProfile(null);
        setQuotas(null);
      } else {
        console.warn('[AuthContext] Erreur transitoire de session (session conservée):', err?.message);
      }
      throw err;
    } finally {
      setIsLoadingSession(false);
    }
  };

  const refreshQuotas = async () => {
    try {
      const q = await ApiService.getMAIQuotas();
      setQuotas(q);
    } catch {}
  };

  const updateUser = (partial: Partial<User>) => {
    setUser((prev) => (prev ? { ...prev, ...partial } : prev));
  };

  const refreshProfile = async () => {
    try {
      // Passer par /me (JWT) évite tout problème de username périmé après renommage
      const data = await ApiService.getCurrentUser();
      setUser(data.user);
      setProfile(data.profile);
      setQuotas(data.quotas);
    } catch {}
  };

  const updateUserAvatar = async (avatarUrl: string) => {
    try {
      await ApiService.updateAvatar(avatarUrl);
      setUser((prev) => (prev ? { ...prev, avatar_url: avatarUrl } : null));
      setProfile((prev) => (prev ? { ...prev, avatarUrl } : null));
    } catch (err: any) {
      throw new Error(err.message || 'Erreur lors de la mise à jour de l’avatar.');
    }
  };

  const loginWithToken = async (newToken: string) => {
    ApiService.setToken(newToken);
    setToken(newToken);
    setIsLoadingSession(true);
    await fetchSession();
  };

  const logout = () => {
    ApiService.removeToken();
    setToken(null);
    setUser(null);
    setProfile(null);
    setQuotas(null);
  };

  useEffect(() => {
    fetchSession().catch(() => {});
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        isAuthenticated: !!user && !!token,
        isLoadingSession,
        token,
        quotas,
        loginWithToken,
        logout,
        refreshQuotas,
        updateUserAvatar,
        updateUser,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
