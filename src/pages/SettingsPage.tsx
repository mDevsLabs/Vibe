/**
 * ============================================================================
 * VIBE SOCIAL PLATFORM — SETTINGS PAGE (src/pages/SettingsPage.tsx)
 * Personalize Feeds, Security (2FA), Privacy (DMs, Mentions), Moderation & Data Export
 * ============================================================================
 */

import React, { useState, useEffect } from 'react';
import {
  Settings,
  Bell,
  Shield,
  Download,
  Check,
  Sliders,
  EyeOff,
  Sparkles,
  Palette,
  Type,
  Sun,
  Moon,
  Laptop
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useTheme, ACCENT_COLORS } from '../context/ThemeContext';
import { ApiService } from '../services/api';
import { NotificationService } from '../services/notificationService';

/** Encart indiquant l'état réel de la permission notifications de l'appareil */
const DevicePermissionHint: React.FC = () => {
  const [state, setState] = useState<ReturnType<typeof NotificationService.getPermissionState>>('default');

  useEffect(() => {
    setState(NotificationService.getPermissionState());
  }, []);

  if (state === 'granted' || state === 'unsupported') return null;

  return (
    <div className="p-3 rounded-2xl bg-zinc-900/60 border border-zinc-800 flex items-center justify-between gap-3">
      <p className="text-[11px] text-zinc-400">
        {state === 'denied'
          ? 'Les notifications sont bloquées pour ce site. Modifiez les réglages de votre navigateur pour les réactiver.'
          : "Les notifications ne sont pas encore autorisées sur cet appareil."}
      </p>
      {state === 'default' && (
        <button
          type="button"
          onClick={async () => {
            const res = await NotificationService.requestPermission();
            setState(res);
          }}
          className="shrink-0 py-1.5 px-3 rounded-full bg-white text-black text-[11px] font-bold hover:bg-zinc-200"
        >
          Autoriser
        </button>
      )}
    </div>
  );
};

export const SettingsPage: React.FC = () => {
  const { user } = useAuth();
  const { theme, setTheme, accentColor, setAccentColor, fontSize, setFontSize } = useTheme();

  // Feed customization
  const [feedDefaultMode, setFeedDefaultMode] = useState<'for_you' | 'stream' | 'trending'>('for_you');
  const [hideReposts, setHideReposts] = useState(false);
  const [blockedKeywords, setBlockedKeywords] = useState('');

  // Security & Privacy
  const [allowDms, setAllowDms] = useState<'everyone' | 'following' | 'nobody'>('everyone');
  const [dmsEnabled, setDmsEnabled] = useState(true);
  const [allowMentions, setAllowMentions] = useState<'everyone' | 'following' | 'nobody'>('everyone');

  // Moderation & Notifications
  const [contentFilter, setContentFilter] = useState<'low' | 'medium' | 'strict'>('medium');
  const [blurSensitive, setBlurSensitive] = useState(true);
  const [emailNotifs, setEmailNotifs] = useState(true);
  const [pushNotifs, setPushNotifs] = useState(true);
  const [maiAutoApproveTools, setMaiAutoApproveTools] = useState(false);

  const [savedSuccess, setSavedSuccess] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    const loadSettings = async () => {
      try {
        const res = await ApiService.getSettings();
        if (res.settings) {
          const s = res.settings;
          if (s.theme_preference && ['light', 'dark', 'system'].includes(s.theme_preference)) {
            setTheme(s.theme_preference as any);
          }
          setFeedDefaultMode(s.feed_default_mode || 'for_you');
          setHideReposts(s.hide_reposts ?? false);
          setBlockedKeywords(Array.isArray(s.blocked_keywords) ? s.blocked_keywords.join(', ') : (s.blocked_keywords || ''));
          setAllowDms(s.allow_dms || s.allow_dms_from || 'everyone');
          setDmsEnabled(s.dms_enabled ?? true);
          setAllowMentions(s.allow_mentions || 'everyone');
          setContentFilter(s.content_filter_level || 'medium');
          setBlurSensitive(s.blur_sensitive_content ?? true);
          setEmailNotifs(s.email_notifications ?? true);
          setPushNotifs(s.push_notifications ?? true);
          if (s.mai_auto_approve_tools !== undefined) {
            setMaiAutoApproveTools(Boolean(s.mai_auto_approve_tools));
          }
          if (s.accent_color && s.accent_color in ACCENT_COLORS) {
            setAccentColor(s.accent_color as any);
          }
          if (s.font_size && ['small', 'medium', 'large'].includes(s.font_size)) {
            setFontSize(s.font_size as any);
          }
        }
      } catch {}
    };
    loadSettings();
  }, []);

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      const keywordsArray = blockedKeywords
        .split(',')
        .map((k) => k.trim())
        .filter(Boolean);

      await ApiService.updateSettings({
        feed_default_mode: feedDefaultMode,
        hide_reposts: hideReposts,
        blocked_keywords: keywordsArray,
        two_factor_auth: true,
        allow_dms: allowDms,
        allow_dms_from: allowDms,
        dms_enabled: dmsEnabled,
        allow_mentions: allowMentions,
        content_filter_level: contentFilter,
        blur_sensitive_content: blurSensitive,
        email_notifications: emailNotifs,
        push_notifications: pushNotifs,
        theme_preference: theme,
        accent_color: accentColor,
        font_size: fontSize,
        mai_auto_approve_tools: maiAutoApproveTools,
      });

      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 3000);
    } catch (err: any) {
      alert(`Erreur: ${err.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleExportData = async () => {
    setIsExporting(true);
    try {
      const data = await ApiService.exportData();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `vibe-export-${user?.username || 'user'}-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err: any) {
      alert(err?.message || "Erreur lors de l'export. Vérifiez votre connexion.");
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="flex-1 min-h-screen border-r border-zinc-800 bg-black pb-8 select-none">
      {/* Header */}
      <header className="sticky top-0 z-20 backdrop-blur-md bg-black/80 border-b border-zinc-800 p-4">
        <h1 className="text-lg font-bold text-white tracking-tight flex items-center gap-2">
          <Settings className="w-5 h-5 text-white" />
          <span>Paramètres & Personnalisation</span>
        </h1>
      </header>

      <div className="p-4 sm:p-6 space-y-6 max-w-2xl">
        {savedSuccess && (
          <div className="p-3 rounded-2xl bg-zinc-900 border border-zinc-700 text-xs text-zinc-200 flex items-center gap-2 animate-fadeIn">
            <Check className="w-4 h-4 text-white" />
            <span>Vos paramètres ont été enregistrés avec succès.</span>
          </div>
        )}

        <form onSubmit={handleSaveSettings} className="space-y-6">
          {/* Section 0: Apparence & Thème d'affichage */}
          <div className="p-5 rounded-3xl bg-zinc-950 border border-zinc-800 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-white font-bold text-sm">
                <Sun className="w-4 h-4 text-amber-400" />
                <span>Apparence & Thème</span>
              </div>
              <span className="text-[11px] font-mono text-zinc-500 uppercase">Par défaut : Clair</span>
            </div>

            <p className="text-xs text-zinc-400">
              Choisissez l’affichage qui vous convient le mieux. Le thème clair est défini par défaut, ou optez pour le thème de votre système ou le mode sombre.
            </p>

            <div className="grid grid-cols-3 gap-2.5 sm:gap-3">
              {[
                {
                  id: 'light',
                  label: 'Clair',
                  badge: 'Par défaut',
                  icon: Sun,
                  iconColor: 'text-amber-400',
                  previewBg: 'bg-white border-zinc-200 text-zinc-900',
                },
                {
                  id: 'system',
                  label: 'Système',
                  badge: 'Auto OS',
                  icon: Laptop,
                  iconColor: 'text-sky-400',
                  previewBg: 'bg-gradient-to-r from-white to-zinc-900 border-zinc-500 text-zinc-800',
                },
                {
                  id: 'dark',
                  label: 'Sombre',
                  badge: 'Nuit',
                  icon: Moon,
                  iconColor: 'text-indigo-400',
                  previewBg: 'bg-zinc-950 border-zinc-800 text-white',
                },
              ].map((item) => {
                const isSelected = theme === item.id;
                const IconComponent = item.icon;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setTheme(item.id as any)}
                    className={`relative p-3 sm:p-4 rounded-2xl border text-left transition-all flex flex-col justify-between gap-3 ${
                      isSelected
                        ? 'bg-zinc-900 border-white text-white shadow-lg ring-1 ring-white/30'
                        : 'bg-zinc-900/50 border-zinc-800 text-zinc-400 hover:border-zinc-700 hover:text-white'
                    }`}
                  >
                    <div className="flex items-center justify-between w-full">
                      <div className="p-2 rounded-xl bg-zinc-800/80">
                        <IconComponent className={`w-4 h-4 sm:w-5 sm:h-5 ${item.iconColor}`} />
                      </div>
                      {isSelected ? (
                        <div className="w-5 h-5 rounded-full bg-white text-black flex items-center justify-center shadow">
                          <Check className="w-3 h-3 stroke-[3]" />
                        </div>
                      ) : (
                        <div className="w-4 h-4 rounded-full border border-zinc-700" />
                      )}
                    </div>

                    <div>
                      <div className="font-bold text-xs sm:text-sm text-white flex items-center gap-1.5">
                        {item.label}
                      </div>
                      <div className="text-[10px] text-zinc-500 font-mono mt-0.5">
                        {item.badge}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Section 0b: Personnalisation (accent + taille de texte) */}
          <div className="p-5 rounded-3xl bg-zinc-950 border border-zinc-800 space-y-4">
            <div className="flex items-center gap-2 text-white font-bold text-sm">
              <Palette className="w-4 h-4 text-fuchsia-400" />
              <span>Personnalisation de l'interface</span>
            </div>

            <div className="space-y-4 text-xs">
              <div className="space-y-2">
                <label className="text-zinc-400 font-mono uppercase text-[11px] flex items-center gap-1.5">
                  <Palette className="w-3 h-3" /> Couleur d'accent
                </label>
                <p className="text-zinc-500 text-[11px]">Teinte appliquée aux boutons d'action et éléments interactifs clés.</p>
                <div className="flex flex-wrap gap-2.5">
                  {(Object.keys(ACCENT_COLORS) as Array<keyof typeof ACCENT_COLORS>).map((key) => {
                    const c = ACCENT_COLORS[key];
                    const isSelected = accentColor === key;
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setAccentColor(key as any)}
                        title={c.label}
                        className={`relative w-9 h-9 rounded-full border-2 transition-all hover:scale-110 ${
                          isSelected ? 'border-white shadow-lg' : 'border-zinc-700'
                        }`}
                        style={{ backgroundColor: c.hex }}
                      >
                        {isSelected && (
                          <Check className="w-4 h-4 text-black stroke-[3] absolute inset-0 m-auto" />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-2 pt-2 border-t border-zinc-900">
                <label className="text-zinc-400 font-mono uppercase text-[11px] flex items-center gap-1.5">
                  <Type className="w-3 h-3" /> Taille du texte
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {([
                    { id: 'small', label: 'Petite', sample: 'text-[11px]' },
                    { id: 'medium', label: 'Moyenne', sample: 'text-xs' },
                    { id: 'large', label: 'Grande', sample: 'text-sm' },
                  ] as const).map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => setFontSize(s.id as any)}
                      className={`py-2 px-3 rounded-xl border font-semibold transition-all flex flex-col items-center gap-0.5 ${
                        fontSize === s.id
                          ? 'bg-white text-black border-white'
                          : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-white'
                      }`}
                    >
                      <span className={s.sample}>Aa</span>
                      <span className="text-[10px]">{s.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Section 1: Personnalisation des Fils */}
          <div className="p-5 rounded-3xl bg-zinc-950 border border-zinc-800 space-y-4">
            <div className="flex items-center gap-2 text-white font-bold text-sm">
              <Sliders className="w-4 h-4 text-white" />
              <span>Personnalisation des Fils d’actualité</span>
            </div>

            <div className="space-y-4 text-xs">
              <div className="space-y-1.5">
                <label className="text-zinc-400 font-mono uppercase text-[11px]">Fil d'actualité par défaut</label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: 'for_you', label: 'Pour Vous (IA)' },
                    { id: 'stream', label: 'Abonnements' },
                    { id: 'trending', label: 'Tendances' },
                  ].map((mode) => (
                    <button
                      key={mode.id}
                      type="button"
                      onClick={() => setFeedDefaultMode(mode.id as any)}
                      className={`py-2 px-3 rounded-xl border text-xs font-semibold transition-all ${
                        feedDefaultMode === mode.id
                          ? 'bg-white text-black border-white'
                          : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-white'
                      }`}
                    >
                      {mode.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-zinc-900">
                <div>
                  <span className="font-semibold text-white">Masquer les repartages (reposts)</span>
                  <p className="text-zinc-500 text-[11px]">N'affiche que les publications originales dans votre flux</p>
                </div>
                <input
                  type="checkbox"
                  checked={hideReposts}
                  onChange={(e) => setHideReposts(e.target.checked)}
                  className="w-4 h-4 accent-white cursor-pointer"
                />
              </div>

              <div className="space-y-1.5 pt-2 border-t border-zinc-900">
                <label className="text-zinc-400 font-mono uppercase text-[11px]">Mots-clés & #Hashtags masqués</label>
                <input
                  type="text"
                  value={blockedKeywords}
                  onChange={(e) => setBlockedKeywords(e.target.value)}
                  placeholder="spoilers, politique, crypto (séparés par des virgules)"
                  className="w-full p-2.5 rounded-xl bg-zinc-900 border border-zinc-800 text-white placeholder-zinc-500 focus:outline-none focus:border-zinc-500"
                />
              </div>
            </div>
          </div>

          {/* Section 2: Sécurité & Confidentialité */}
          <div className="p-5 rounded-3xl bg-zinc-950 border border-zinc-800 space-y-4">
            <div className="flex items-center gap-2 text-white font-bold text-sm">
              <Shield className="w-4 h-4 text-white" />
              <span>Sécurité & Confidentialité</span>
            </div>

            <div className="space-y-4 text-xs">
              {/* 2FA — Actif et obligatoire, non modifiable */}
              <div className="flex items-center gap-3 p-3 rounded-2xl bg-zinc-900 border border-zinc-700">
                <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center flex-shrink-0">
                  <Shield className="w-4 h-4 text-white" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-white text-xs">Double authentification (2FA)</span>
                    <span className="text-[10px] bg-white text-black px-2 py-0.5 rounded-full font-bold">ACTIF</span>
                  </div>
                  <p className="text-zinc-500 text-[11px] mt-0.5">
                    La 2FA est activée sur votre compte et protège vos connexions. Elle est obligatoire sur Vibe.
                  </p>
                </div>
              </div>

              <div className="space-y-1.5 pt-2 border-t border-zinc-900">
                <label className="text-zinc-400 font-mono uppercase text-[11px]">Qui peut vous envoyer des messages privés (DM)</label>
                <select
                  value={allowDms}
                  onChange={(e) => setAllowDms(e.target.value as any)}
                  className="w-full p-2.5 rounded-xl bg-zinc-900 border border-zinc-800 text-white focus:outline-none focus:border-zinc-500"
                >
                  <option value="everyone">Tout le monde</option>
                  <option value="following">Mes abonnements uniquement</option>
                  <option value="nobody">Personne (DMs désactivés)</option>
                </select>
              </div>

              <div className="space-y-1.5 pt-2 border-t border-zinc-900">
                <label className="text-zinc-400 font-mono uppercase text-[11px]">Qui peut vous mentionner (@pseudo)</label>
                <select
                  value={allowMentions}
                  onChange={(e) => setAllowMentions(e.target.value as any)}
                  className="w-full p-2.5 rounded-xl bg-zinc-900 border border-zinc-800 text-white focus:outline-none focus:border-zinc-500"
                >
                  <option value="everyone">Tout le monde</option>
                  <option value="following">Mes abonnements uniquement</option>
                  <option value="nobody">Personne</option>
                </select>
              </div>
            </div>
          </div>

          {/* Section 3: Modération & Contenu */}
          <div className="p-5 rounded-3xl bg-zinc-950 border border-zinc-800 space-y-4">
            <div className="flex items-center gap-2 text-white font-bold text-sm">
              <EyeOff className="w-4 h-4 text-white" />
              <span>Modération du contenu</span>
            </div>

            <div className="space-y-4 text-xs">
              <div className="space-y-1.5">
                <label className="text-zinc-400 font-mono uppercase text-[11px]">Filtre IA de toxicité</label>
                <div className="grid grid-cols-3 gap-2">
                  {(['low', 'medium', 'strict'] as const).map((lvl) => (
                    <button
                      key={lvl}
                      type="button"
                      onClick={() => setContentFilter(lvl)}
                      className={`py-2 px-3 rounded-xl border text-xs font-semibold capitalize transition-all ${
                        contentFilter === lvl
                          ? 'bg-white text-black border-white'
                          : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-white'
                      }`}
                    >
                      {lvl === 'low' ? 'Léger' : lvl === 'medium' ? 'Modéré' : 'Strict'}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-zinc-900">
                <div>
                  <span className="font-semibold text-white">Flouter les médias sensibles</span>
                  <p className="text-zinc-500 text-[11px]">Affiche un filtre d'avertissement sur les images sensibles</p>
                </div>
                <input
                  type="checkbox"
                  checked={blurSensitive}
                  onChange={(e) => setBlurSensitive(e.target.checked)}
                  className="w-4 h-4 accent-white cursor-pointer"
                />
              </div>
            </div>
          </div>

          {/* Section 4: Notifications */}
          <div className="p-5 rounded-3xl bg-zinc-950 border border-zinc-800 space-y-4">
            <div className="flex items-center gap-2 text-white font-bold text-sm">
              <Bell className="w-4 h-4 text-white" />
              <span>Notifications</span>
            </div>

            <div className="space-y-3 text-xs">
              <div className="flex items-center justify-between">
                <div>
                  <span className="font-semibold text-white">Notifications par e-mail</span>
                  <p className="text-zinc-500 text-[11px]">Réception de résumés d'activités et messages importants</p>
                </div>
                <input
                  type="checkbox"
                  checked={emailNotifs}
                  onChange={(e) => setEmailNotifs(e.target.checked)}
                  className="w-4 h-4 accent-white cursor-pointer"
                />
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-zinc-900">
                <div>
                  <span className="font-semibold text-white">Notifications push sur l'appareil</span>
                  <p className="text-zinc-500 text-[11px]">Alertes en direct pour les likes, partages et messages</p>
                </div>
                <input
                  type="checkbox"
                  checked={pushNotifs}
                  onChange={(e) => setPushNotifs(e.target.checked)}
                  className="w-4 h-4 accent-white cursor-pointer"
                />
              </div>

              <DevicePermissionHint />
            </div>
          </div>

          {/* Section 5: Agent Autonome & mAI */}
          <div className="p-5 rounded-3xl bg-zinc-950 border border-zinc-800 space-y-4">
            <div className="flex items-center gap-2 text-white font-bold text-sm">
              <Sparkles className="w-4 h-4 text-purple-400" />
              <span>Intelligence Artificielle mAI</span>
            </div>

            <div className="space-y-3 text-xs">
              <div className="flex items-center justify-between">
                <div>
                  <span className="font-semibold text-white">Approbation automatique des outils mAI</span>
                  <p className="text-zinc-500 text-[11px]">
                    Autoriser l'agent mAI à exécuter ses requêtes et outils d'assistance sans confirmation manuelle
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={maiAutoApproveTools}
                  onChange={(e) => setMaiAutoApproveTools(e.target.checked)}
                  className="w-4 h-4 accent-purple-500 cursor-pointer"
                />
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="submit"
              disabled={isSaving}
              className="py-3 px-8 rounded-full bg-white text-black font-bold text-xs hover:bg-zinc-200 transition-all shadow-lg active:scale-95 disabled:opacity-40"
            >
              {isSaving ? 'Enregistrement...' : 'Enregistrer les paramètres'}
            </button>
          </div>
        </form>

        {/* Section 5: Données & Compte */}
        <div className="p-5 rounded-3xl bg-zinc-950 border border-zinc-800 space-y-4">
          <div className="flex items-center gap-2 text-white font-bold text-sm">
            <Download className="w-4 h-4 text-white" />
            <span>Données personnelles & Export</span>
          </div>

          <p className="text-xs text-zinc-400">
            Téléchargez une archive complète de vos publications, messages et paramètres au format JSON.
          </p>

          <button
            onClick={handleExportData}
            disabled={isExporting}
            className="py-2.5 px-5 rounded-2xl bg-zinc-900 border border-zinc-800 text-zinc-200 hover:text-white hover:bg-zinc-800 text-xs font-semibold transition-all flex items-center gap-2"
          >
            <Download className="w-4 h-4" />
            <span>{isExporting ? 'Exportation...' : 'Télécharger mes données (JSON)'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
