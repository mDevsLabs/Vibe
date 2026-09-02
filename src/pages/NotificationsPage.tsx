/**
 * ============================================================================
 * VIBE SOCIAL PLATFORM — NOTIFICATIONS PAGE (src/pages/NotificationsPage.tsx)
 * Real-time notification center with filter categories & real database events
 * ============================================================================
 */

import React, { useState, useEffect } from 'react';
import {
  Bell,
  Heart,
  Repeat,
  MessageSquare,
  Sparkles,
  UserPlus,
  Check
} from 'lucide-react';
import { NotificationItem } from '../types/vibe';
import { ApiService } from '../services/api';

export const NotificationsPage: React.FC = () => {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [filter, setFilter] = useState<'all' | 'verified' | 'mentions'>('all');
  const [isLoading, setIsLoading] = useState(true);

  const fetchNotifications = async () => {
    setIsLoading(true);
    try {
      const data = await ApiService.getNotifications();
      setNotifications(data.notifications || []);
    } catch {
      setNotifications([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchNotifications();
  }, []);

  const handleMarkAllAsRead = async () => {
    try {
      await ApiService.markNotificationsRead();
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    } catch {}
  };

  const getIcon = (type: string) => {
    switch (type) {
      case 'like':
      case 'reaction':
        return <Heart className="w-4 h-4 text-white fill-white" />;
      case 'repost':
        return <Repeat className="w-4 h-4 text-white" />;
      case 'reply':
        return <MessageSquare className="w-4 h-4 text-white" />;
      case 'follow':
      case 'follow_request':
      case 'follow_accept':
        return <UserPlus className="w-4 h-4 text-white" />;
      case 'ai_digest':
        return <Sparkles className="w-4 h-4 text-white" />;
      default:
        return <Bell className="w-4 h-4 text-white" />;
    }
  };

  const filteredNotifications = notifications.filter((n) => {
    if (filter === 'mentions') return n.type === 'reply' || n.type === 'mention';
    return true;
  });

  return (
    <div className="flex-1 min-h-screen border-r border-zinc-800 bg-black pb-20 select-none">
      {/* Header */}
      <header className="sticky top-0 z-20 backdrop-blur-md bg-black/80 border-b border-zinc-800 p-4 flex items-center justify-between">
        <div>
          <h1 className="text-base font-bold text-white tracking-tight">Notifications</h1>
          <p className="text-xs text-zinc-500">Activités et interactions récentes</p>
        </div>

        {notifications.some((n) => !n.is_read) && (
          <button
            onClick={handleMarkAllAsRead}
            className="flex items-center gap-1.5 py-1 px-3 rounded-full bg-zinc-900 border border-zinc-800 text-xs text-zinc-300 hover:text-white hover:bg-zinc-800 transition-colors"
          >
            <Check className="w-3.5 h-3.5" />
            <span>Tout marquer lu</span>
          </button>
        )}
      </header>

      {/* Filter Tabs */}
      <div className="flex border-b border-zinc-800 bg-zinc-950">
        {(['all', 'verified', 'mentions'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`flex-1 py-3 text-xs font-semibold uppercase tracking-wider relative transition-colors ${
              filter === f ? 'text-white' : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            <span>{f === 'all' ? 'Toutes' : f === 'verified' ? 'Vérifiés' : 'Mentions'}</span>
            {filter === f && (
              <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-12 h-1 bg-white rounded-full" />
            )}
          </button>
        ))}
      </div>

      {/* Notification Stream */}
      <div className="divide-y divide-zinc-900">
        {filteredNotifications.map((notif) => (
          <div
            key={notif.id}
            className={`p-4 flex gap-3.5 items-start hover:bg-zinc-950/60 transition-colors ${
              !notif.is_read ? 'bg-zinc-950/40' : ''
            }`}
          >
            <div className="mt-1">{getIcon(notif.type)}</div>

            <div className="flex-1 space-y-1">
              <div className="flex items-center gap-2">
                {notif.actor_avatar_url && (
                  <img
                    src={notif.actor_avatar_url}
                    alt={notif.actor_username || 'user'}
                    className="w-6 h-6 rounded-full object-cover border border-zinc-800"
                  />
                )}
                {notif.actor_username && (
                  <span className="text-xs font-bold text-white">@{notif.actor_username}</span>
                )}
                <span className="text-xs text-zinc-300">{notif.message}</span>
              </div>

              <span className="text-[11px] text-zinc-600 block font-mono">
                {new Date(notif.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
          </div>
        ))}

        {!isLoading && filteredNotifications.length === 0 && (
          <div className="p-16 text-center text-zinc-500 text-xs space-y-2">
            <Bell className="w-6 h-6 mx-auto text-zinc-600" />
            <p className="font-semibold text-zinc-400">Aucune notification pour le moment</p>
            <p className="text-[11px] text-zinc-600">Vos likes, repartages et mentions apparaîtront ici.</p>
          </div>
        )}
      </div>
    </div>
  );
};
