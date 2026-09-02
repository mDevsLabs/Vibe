/**
 * ============================================================================
 * VIBE SOCIAL PLATFORM — AUTH PORTAL (src/pages/AuthModal.tsx)
 * Minimalist Authentication: Register, Login, Email OTP & Session
 * ============================================================================
 */

import React, { useState } from 'react';
import { Lock, Mail, User as UserIcon, KeyRound, AlertCircle, Eye, EyeOff, Sparkles, ArrowRight } from 'lucide-react';
import { ApiService } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { VibeLogo } from '../components/layout/VibeLogo';

interface AuthModalProps {
  isOpen?: boolean;
  onClose?: () => void;
  isFullScreen?: boolean;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen = true,
  onClose,
  isFullScreen = false,
}) => {
  const { loginWithToken } = useAuth();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [step, setStep] = useState<'credentials' | 'otp'>('credentials');

  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [noticeMessage, setNoticeMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleCredentialsSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);
    setNoticeMessage(null);

    try {
      if (mode === 'register') {
        if (!email.trim() || !username.trim() || !password.trim()) {
          throw new Error('Tous les champs sont requis.');
        }
        const res = await ApiService.register(email.trim(), username.trim(), password);
        if (res.status === 'verification_required') {
          setStep('otp');
          setNoticeMessage(`Un code de vérification a été envoyé à ${email}.`);
        }
      } else {
        if (!email.trim() || !password.trim()) {
          throw new Error('Identifiant et mot de passe requis.');
        }
        const res = await ApiService.login(email.trim(), password);
        if (res.status === 'verification_required') {
          setStep('otp');
          setNoticeMessage(`Un code de connexion a été envoyé à votre adresse e-mail.`);
        }
      }
    } catch (err: any) {
      setError(err.message || 'Erreur lors de la requête.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleOtpSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      let token = '';
      if (mode === 'register') {
        const res = await ApiService.verifyRegister(email.trim(), username.trim(), password, otpCode.trim());
        token = res.token;
      } else {
        const res = await ApiService.verifyLogin(email.trim(), otpCode.trim());
        token = res.token;
      }

      if (!token) {
        throw new Error('Code incorrect ou expiré.');
      }

      await loginWithToken(token);
      if (onClose) onClose();
    } catch (err: any) {
      setError(err.message || 'Code invalide ou expiré.');
    } finally {
      setIsLoading(false);
    }
  };

  const content = (
    <div className="w-full max-w-md bg-zinc-950 border border-zinc-800 rounded-3xl p-6 sm:p-8 shadow-2xl space-y-6 animate-scaleUp select-none">
      {/* Brand Header */}
      <div className="text-center space-y-2">
        <div className="flex justify-center mx-auto">
          <VibeLogo size={48} showText={false} />
        </div>
        <div>
          <h2 className="text-xl font-extrabold text-white tracking-tight">
            {mode === 'login' ? 'Connexion à Vibe' : 'Créer un compte Vibe'}
          </h2>
          <p className="text-xs text-zinc-400">Le réseau social avec intelligence artificielle mAI</p>
        </div>
      </div>

      {error && (
        <div className="p-3.5 rounded-2xl bg-zinc-900 border border-zinc-700 text-xs text-zinc-200 flex items-center gap-2 animate-fadeIn">
          <AlertCircle className="w-4 h-4 text-white shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {noticeMessage && (
        <div className="p-3.5 rounded-2xl bg-zinc-900 border border-zinc-700 text-xs text-zinc-300 flex items-center gap-2 animate-fadeIn">
          <Mail className="w-4 h-4 text-white shrink-0" />
          <span>{noticeMessage}</span>
        </div>
      )}

      {/* Step 1: Credentials Form */}
      {step === 'credentials' ? (
        <form onSubmit={handleCredentialsSubmit} className="space-y-4">
          <div className="space-y-1">
            <label className="text-xs font-semibold text-zinc-300">
              {mode === 'register' ? 'Adresse E-mail' : 'E-mail ou Nom d’utilisateur'}
            </label>
            <div className="relative">
              <Mail className="w-4 h-4 text-zinc-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type={mode === 'register' ? 'email' : 'text'}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={mode === 'register' ? 'nom@exemple.com' : 'Votre nom ou email'}
                className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-zinc-900 border border-zinc-800 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-zinc-500"
                required
              />
            </div>
          </div>

          {mode === 'register' && (
            <div className="space-y-1">
              <label className="text-xs font-semibold text-zinc-300">Nom d’utilisateur</label>
              <div className="relative">
                <UserIcon className="w-4 h-4 text-zinc-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/\s+/g, '_'))}
                  placeholder="nom_utilisateur"
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-zinc-900 border border-zinc-800 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-zinc-500 font-mono"
                  required
                />
              </div>
            </div>
          )}

          <div className="space-y-1">
            <label className="text-xs font-semibold text-zinc-300">Mot de passe</label>
            <div className="relative">
              <Lock className="w-4 h-4 text-zinc-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full pl-10 pr-10 py-2.5 rounded-xl bg-zinc-900 border border-zinc-800 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-zinc-500"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white transition-colors"
                title={showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-3 rounded-xl bg-white text-black font-bold text-sm hover:bg-zinc-200 transition-all flex items-center justify-center gap-2 shadow-lg disabled:opacity-40"
          >
            {isLoading ? (
              <span className="animate-pulse">Chargement...</span>
            ) : (
              <>
                <span>{mode === 'login' ? 'Continuer' : 'S’inscrire'}</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>

          <div className="text-center pt-2">
            <button
              type="button"
              onClick={() => {
                setMode(mode === 'login' ? 'register' : 'login');
                setError(null);
                setNoticeMessage(null);
              }}
              className="text-xs text-zinc-400 hover:text-white font-medium transition-colors"
            >
              {mode === 'login'
                ? 'Pas encore de compte ? S’inscrire'
                : 'Déjà inscrit ? Se connecter'}
            </button>
          </div>
        </form>
      ) : (
        /* Step 2: OTP Verification */
        <form onSubmit={handleOtpSubmit} className="space-y-4">
          <div className="space-y-1">
            <label className="text-xs font-semibold text-zinc-300">Code de vérification (6 chiffres)</label>
            <div className="relative">
              <KeyRound className="w-4 h-4 text-zinc-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={otpCode}
                onChange={(e) => setOtpCode(e.target.value.trim())}
                placeholder="123456"
                maxLength={6}
                className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-zinc-900 border border-zinc-800 text-sm text-white text-center tracking-widest font-mono focus:outline-none focus:border-zinc-500"
                required
                autoFocus
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={isLoading || otpCode.length < 4}
            className="w-full py-3 rounded-xl bg-white text-black font-bold text-sm hover:bg-zinc-200 transition-all flex items-center justify-center gap-2 shadow-lg disabled:opacity-40"
          >
            {isLoading ? (
              <span className="animate-pulse">Validation...</span>
            ) : (
              <span>Accéder à Vibe</span>
            )}
          </button>

          <div className="text-center pt-2">
            <button
              type="button"
              onClick={() => {
                setStep('credentials');
                setOtpCode('');
                setError(null);
              }}
              className="text-xs text-zinc-400 hover:text-white transition-colors"
            >
              ← Retour
            </button>
          </div>
        </form>
      )}
    </div>
  );

  if (isFullScreen) {
    return (
      <div className="w-full flex items-center justify-center">
        {content}
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fadeIn">
      {content}
    </div>
  );
};
