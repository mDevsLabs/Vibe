/**
 * ============================================================================
 * VIBE SOCIAL PLATFORM — BOOKS PAGE (src/pages/BooksPage.tsx)
 * « Livres » : collections de Vibe préférées (max 5 par compte).
 * Liste des Livres (icône + titre + nb de Vibe), vue d'un Livre avec ses Vibe,
 * création (titre + icône lucide), édition et suppression.
 * ============================================================================
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Plus,
  Loader2,
  AlertCircle,
  Trash2,
  Pencil,
  Check,
  X,
  BookHeart,
  Sparkles
} from 'lucide-react';
import type { VibeBook, Post } from '../types/vibe';
import { ApiService } from '../services/api';
import { NotificationService } from '../services/notificationService';
import { BOOK_ICON_OPTIONS, getBookIcon } from '../components/common/bookIcons';
import { PostCard } from '../components/feed/PostCard';

export const BooksPage: React.FC = () => {
  const navigate = useNavigate();
  const { bookId } = useParams<{ bookId?: string }>();

  const [books, setBooks] = useState<VibeBook[]>([]);
  const [maxBooks, setMaxBooks] = useState(5);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Création / édition
  const [showCreate, setShowCreate] = useState(false);
  const [editingBook, setEditingBook] = useState<VibeBook | null>(null);
  const [formTitle, setFormTitle] = useState('');
  const [formIcon, setFormIcon] = useState('BookHeart');
  const [isSaving, setIsSaving] = useState(false);

  // Vue d'un Livre
  const [book, setBook] = useState<VibeBook | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [isLoadingPosts, setIsLoadingPosts] = useState(false);

  const fetchBooks = useCallback(() => {
    setIsLoading(true);
    setError(null);
    ApiService.getBooks()
      .then((res) => {
        setBooks(res.books || []);
        setMaxBooks(res.maxBooks || 5);
      })
      .catch((err: any) => setError(err?.message || 'Impossible de charger vos Livres.'))
      .finally(() => setIsLoading(false));
  }, []);

  useEffect(() => {
    if (!bookId) fetchBooks();
  }, [bookId, fetchBooks]);

  // Contenu d'un Livre
  useEffect(() => {
    if (!bookId) return;
    let cancelled = false;
    setIsLoadingPosts(true);
    setPosts([]);
    setBook(null);
    ApiService.getBookPosts(bookId)
      .then((res) => {
        if (cancelled) return;
        setBook(res.book || null);
        setPosts(res.posts || []);
      })
      .catch((err: any) => {
        if (!cancelled) setError(err?.message || 'Livre introuvable.');
      })
      .finally(() => {
        if (!cancelled) setIsLoadingPosts(false);
      });
    return () => {
      cancelled = true;
    };
  }, [bookId]);

  const openCreate = () => {
    setEditingBook(null);
    setFormTitle('');
    setFormIcon('BookHeart');
    setShowCreate(true);
  };

  const openEdit = (b: VibeBook) => {
    setEditingBook(b);
    setFormTitle(b.title);
    setFormIcon(b.icon || 'BookHeart');
    setShowCreate(true);
  };

  const handleSave = async () => {
    if (!formTitle.trim() || isSaving) return;
    setIsSaving(true);
    setError(null);
    try {
      if (editingBook) {
        const res = await ApiService.updateBook(editingBook.id, { title: formTitle.trim(), icon: formIcon });
        setBooks((list) => list.map((b) => (b.id === editingBook.id ? { ...b, ...res.book } : b)));
        NotificationService.showInAppToast('Livre modifié', `« ${res.book.title} » a été mis à jour.`, 'success');
      } else {
        const res = await ApiService.createBook(formTitle.trim(), formIcon);
        setBooks((list) => [...list, res.book]);
        NotificationService.showInAppToast('Livre créé', `« ${res.book.title} » est prêt à recevoir vos Vibe préférées.`, 'success');
      }
      setShowCreate(false);
    } catch (err: any) {
      setError(err?.message || "La sauvegarde du Livre a échoué.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteBook = async (b: VibeBook) => {
    if (!window.confirm(`Supprimer le Livre « ${b.title} » ? Les Vibe enregistrées ne seront pas supprimées.`)) return;
    try {
      await ApiService.deleteBook(b.id);
      setBooks((list) => list.filter((x) => x.id !== b.id));
      NotificationService.showInAppToast('Livre supprimé', `« ${b.title} » a été supprimé.`, 'info');
    } catch (err: any) {
      NotificationService.showInAppToast('Erreur', err?.message || 'La suppression a échoué.', 'error');
    }
  };

  const handleRemoveFromBook = async (postId: string) => {
    if (!bookId || !book) return;
    // Optimiste
    const prev = posts;
    setPosts((list) => list.filter((p) => p.id !== postId));
    try {
      await ApiService.toggleBookItem(bookId, postId);
      NotificationService.showInAppToast('Retiré', `Cette Vibe a été retirée du Livre « ${book.title} ».`, 'info');
    } catch {
      setPosts(prev);
      NotificationService.showInAppToast('Erreur', 'Le retrait a échoué.', 'error');
    }
  };

  // ─────────────── Vue d'un Livre ───────────────
  if (bookId) {
    const BookIcon = getBookIcon(book?.icon || 'BookHeart');
    return (
      <div className="flex-1 border-r border-zinc-800 min-h-screen bg-black pb-16 md:pb-0">
        <header className="sticky top-0 z-10 backdrop-blur-md bg-black/70 border-b border-zinc-800 p-4 flex items-center gap-3">
          <button onClick={() => navigate('/books')} className="p-2 -m-2 rounded-full text-zinc-400 hover:text-white" title="Retour aux Livres">
            <ArrowLeft className="w-5 h-5" />
          </button>
          {book && (
            <span className="p-2 rounded-xl text-sky-300 bg-sky-500/10 border border-sky-500/30">
              <BookIcon className="w-4 h-4" />
            </span>
          )}
          <div className="min-w-0">
            <h1 className="text-lg font-bold text-white truncate">{book?.title || 'Livre'}</h1>
            <p className="text-xs text-zinc-500">{posts.length} Vibe enregistrée{posts.length > 1 ? 's' : ''}</p>
          </div>
        </header>

        {isLoadingPosts ? (
          <div className="flex items-center justify-center py-20 text-zinc-500">
            <Loader2 className="w-6 h-6 animate-spin" />
          </div>
        ) : posts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 px-6 text-center space-y-3">
            <span className="p-4 rounded-full bg-zinc-900 text-zinc-500">
              <BookHeart className="w-8 h-8" />
            </span>
            <p className="text-sm text-zinc-400">Ce Livre est vide pour l'instant.</p>
            <p className="text-xs text-zinc-600 max-w-xs">
              Enregistrez vos Vibe préférées avec le bouton « Livre » sous une publication.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-zinc-800">
            {posts.map((p) => (
              <PostCard
                key={p.id}
                post={p}
                onPostDeleted={(id) => handleRemoveFromBook(id)}
                onRemoveFromBook={(id) => handleRemoveFromBook(id)}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  // ─────────────── Liste des Livres ───────────────
  return (
    <div className="flex-1 border-r border-zinc-800 min-h-screen bg-black pb-16 md:pb-0">
      <header className="sticky top-0 z-10 backdrop-blur-md bg-black/70 border-b border-zinc-800 p-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="p-2 rounded-xl text-sky-300 bg-sky-500/10 border border-sky-500/30">
            <BookHeart className="w-4 h-4" />
          </span>
          <div>
            <h1 className="text-lg font-bold text-white">Livres</h1>
            <p className="text-xs text-zinc-500">Vos Vibe préférées, gardées en un seul endroit</p>
          </div>
        </div>
        <button
          onClick={openCreate}
          disabled={books.length >= maxBooks}
          style={{ backgroundColor: 'var(--vibe-accent, #ffffff)' }}
          className="flex items-center gap-1.5 py-2 px-4 rounded-full bg-white text-black text-xs font-bold transition-all disabled:opacity-40"
          title={books.length >= maxBooks ? `Limite de ${maxBooks} Livres par compte atteinte` : 'Créer un Livre'}
        >
          <Plus className="w-3.5 h-3.5" />
          Nouveau Livre
        </button>
      </header>

      {(error || (!isLoading && books.length >= maxBooks && books.length > 0)) && (
        <div className="px-4 pt-3">
          {error && (
            <div className="flex items-center gap-2 text-xs text-red-400 bg-red-950/30 border border-red-900/50 rounded-xl px-3 py-2">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center py-20 text-zinc-500">
          <Loader2 className="w-6 h-6 animate-spin" />
        </div>
      ) : books.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 px-6 text-center space-y-3">
          <span className="p-4 rounded-full bg-zinc-900 text-zinc-500">
            <Sparkles className="w-8 h-8" />
          </span>
          <p className="text-sm text-zinc-400">Créez votre premier Livre</p>
          <p className="text-xs text-zinc-600 max-w-xs">
            Un Livre regroupe vos « Vibe préférées » : un autre moyen d'aimer, pour retrouver rapidement ce qui compte.
          </p>
          <button
            onClick={openCreate}
            style={{ backgroundColor: 'var(--vibe-accent, #ffffff)' }}
            className="mt-2 py-2 px-5 rounded-full bg-white text-black text-xs font-bold"
          >
            Créer un Livre
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-4">
          {books.map((b) => {
            const IconComponent = getBookIcon(b.icon);
            return (
              <div
                key={b.id}
                onClick={() => navigate(`/books/${b.id}`)}
                className="group relative border border-zinc-800 rounded-3xl p-5 bg-zinc-950/60 hover:bg-zinc-900/70 hover:border-zinc-700 transition-all cursor-pointer"
              >
                <div className="flex items-start justify-between">
                  <span className="p-2.5 rounded-2xl text-sky-300 bg-sky-500/10 border border-sky-500/20">
                    <IconComponent className="w-5 h-5" />
                  </span>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        openEdit(b);
                      }}
                      className="p-1.5 rounded-full text-zinc-500 hover:text-white hover:bg-zinc-800"
                      title="Modifier le Livre"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteBook(b);
                      }}
                      className="p-1.5 rounded-full text-zinc-500 hover:text-red-400 hover:bg-red-950/40"
                      title="Supprimer le Livre"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
                <h3 className="mt-3 text-sm font-bold text-white truncate">{b.title}</h3>
                <p className="text-xs text-zinc-500 mt-0.5">
                  {b.items_count || 0} Vibe enregistrée{(b.items_count || 0) > 1 ? 's' : ''}
                </p>
              </div>
            );
          })}
        </div>
      )}

      {/* Modale de création / édition de Livre */}
      {showCreate && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fadeIn"
          onClick={() => setShowCreate(false)}
        >
          <div
            className="w-full max-w-md bg-zinc-950 border border-zinc-800 rounded-3xl p-5 space-y-3 animate-scaleUp"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-white">{editingBook ? 'Modifier le Livre' : 'Nouveau Livre'}</h3>
              <button onClick={() => setShowCreate(false)} className="text-zinc-500 hover:text-white" title="Fermer">
                <X className="w-4 h-4" />
              </button>
            </div>
            {error && (
              <div className="flex items-center gap-2 text-xs text-red-400 bg-red-950/30 border border-red-900/50 rounded-xl px-3 py-2">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}
            <input
              type="text"
              value={formTitle}
              onChange={(e) => setFormTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSave();
              }}
              autoFocus
              maxLength={60}
              placeholder="Titre du Livre (ex. Inspirations)"
              className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2.5 text-xs text-white placeholder-zinc-600 focus:outline-none focus:border-zinc-500"
            />
            <div>
              <p className="text-[10px] uppercase tracking-wide text-zinc-500 font-semibold mb-1.5">Icône du Livre</p>
              <div className="grid grid-cols-8 gap-1.5">
                {BOOK_ICON_OPTIONS.map((opt) => (
                  <button
                    key={opt.name}
                    type="button"
                    onClick={() => setFormIcon(opt.name)}
                    title={opt.name}
                    className={`p-1.5 rounded-lg flex items-center justify-center transition-colors ${
                      formIcon === opt.name
                        ? 'bg-sky-500/20 text-sky-300 border border-sky-500/50'
                        : 'text-zinc-400 hover:text-white hover:bg-zinc-800 border border-transparent'
                    }`}
                  >
                    <opt.Component className="w-4 h-4" />
                  </button>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-2 pt-1">
              <button
                onClick={handleSave}
                disabled={!formTitle.trim() || isSaving}
                style={{ backgroundColor: 'var(--vibe-accent, #ffffff)' }}
                className="flex-1 py-2.5 rounded-xl bg-white text-black text-xs font-bold disabled:opacity-40 flex items-center justify-center gap-2"
              >
                {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                {editingBook ? 'Enregistrer' : 'Créer le Livre'}
              </button>
              <button
                onClick={() => setShowCreate(false)}
                className="px-4 py-2.5 rounded-xl border border-zinc-800 text-xs text-zinc-400 hover:text-white"
              >
                Annuler
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
