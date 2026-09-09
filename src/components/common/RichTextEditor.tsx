/**
 * ============================================================================
 * VIBE SOCIAL PLATFORM — RICH TEXT EDITOR (src/components/common/RichTextEditor.tsx)
 * Éditeur WYSIWYG contenteditable : gras, italique, souligné, barré, listes à
 * barre d'outils WYSIWYG & collage d'URL avec nom de lien.
 * ============================================================================
 */

import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  Strikethrough,
  List,
  ListOrdered,
  Quote,
  Code,
  Link2,
  X,
  Check,
  CornerDownLeft,
} from 'lucide-react';
import { ApiService } from '../../services/api';
import { MentionAutocomplete, type MentionUser } from '../feed/MentionAutocomplete';

export interface RichTextEditorHandle {
  getHTML: () => string;
  getText: () => string;
  isEmpty: () => boolean;
  setHTML: (html: string) => void;
  /** Insertion de texte (dictée vocale) à la position du curseur ou en fin. */
  insertText: (text: string) => void;
  focus: () => void;
  clear: () => void;
}

interface RichTextEditorProps {
  /** HTML initial (lu au montage uniquement). */
  initialHTML?: string;
  onChange?: (html: string, text: string) => void;
  placeholder?: string;
  /** Mode compact (commentaires) : barre d'outils resserrée, hauteur réduite. */
  compact?: boolean;
  disabled?: boolean;
  className?: string;
  /** Mode étendu (modal) : remplit toute la hauteur disponible */
  fillHeight?: boolean;
}

interface LinkDraft {
  /** URL verrouillée (collée) ou saisie manuellement. */
  url: string;
  text: string;
  lockedUrl: boolean;
}

const URL_RE = /^https?:\/\/[^\s<>"']+$/i;

const escapeAttr = (v: string) =>
  v.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export const RichTextEditor = forwardRef<RichTextEditorHandle, RichTextEditorProps>(
  (
    {
      initialHTML,
      onChange,
      placeholder = 'Écrivez votre vibe…',
      compact = false,
      disabled = false,
      className = '',
      fillHeight = false,
    },
    ref
  ) => {
    const editorRef = useRef<HTMLDivElement>(null);
    const wrapperRef = useRef<HTMLDivElement>(null);
    const savedRangeRef = useRef<Range | null>(null);
    const [_isEmpty, setIsEmpty] = useState(true);
    const [activeStates, setActiveStates] = useState({
      bold: false,
      italic: false,
      underline: false,
      strikeThrough: false,
    });
    const [linkDraft, setLinkDraft] = useState<LinkDraft | null>(null);
    const linkTextInputRef = useRef<HTMLInputElement>(null);

    // ── Autocomplete de mentions « @ » (posts & commentaires) ────────────
    // Même mécanique que ToolAutocomplete pour les outils mAI : détection du
    // dernier mot tapé, popover de comptes (avatar + nom + @username),
    // navigation clavier, insertion « @username » remplaçant le token.
    const [mention, setMention] = useState<{ query: string } | null>(null);
    const [mentionUsers, setMentionUsers] = useState<MentionUser[]>([]);
    const [mentionIndex, setMentionIndex] = useState(0);
    const mentionRangeRef = useRef<Range | null>(null);

    const closeMention = useCallback(() => {
      setMention(null);
      setMentionUsers([]);
      setMentionIndex(0);
    }, []);

    const detectMention = useCallback(() => {
      const sel = window.getSelection();
      const el = editorRef.current;
      if (
        !sel ||
        !sel.isCollapsed ||
        !el ||
        !el.contains(sel.anchorNode) ||
        sel.anchorNode?.nodeType !== Node.TEXT_NODE
      ) {
        closeMention();
        return;
      }
      const before = (sel.anchorNode as Text).textContent?.slice(0, sel.anchorOffset) || '';
      const lastWord = before.split(/\s+/).pop() || '';
      if (/^@[a-zA-Z0-9_]{0,30}$/.test(lastWord)) {
        mentionRangeRef.current = sel.getRangeAt(0).cloneRange();
        setMention((prev) => (prev?.query === lastWord ? prev : { query: lastWord }));
        setMentionIndex(0);
      } else {
        closeMention();
      }
    }, [closeMention]);

    const mentionQuery = mention ? mention.query.slice(1) : '';

    useEffect(() => {
      if (!mention || mentionQuery.length < 1) {
        setMentionUsers([]);
        return;
      }
      let cancelled = false;
      const timer = setTimeout(async () => {
        try {
          const res = await ApiService.searchUsers(mentionQuery);
          if (!cancelled) setMentionUsers((res?.users || []).slice(0, 6));
        } catch {
          if (!cancelled) setMentionUsers([]);
        }
      }, 250);
      return () => {
        cancelled = true;
        clearTimeout(timer);
      };
    }, [mentionQuery, mention]);

    // ── Utilitaires internes ────────────────────────────────────────────

    const syncEmptyState = useCallback(() => {
      const el = editorRef.current;
      if (!el) return;
      const html = el.innerHTML.replace(/<br\s*\/?>/gi, '').trim();
      const empty = el.textContent!.trim().length === 0 && !el.querySelector('img,li');
      el.dataset.empty = String(empty);
      setIsEmpty(empty || html === '');
    }, []);

    const emitChange = useCallback(() => {
      const el = editorRef.current;
      if (!el) return;
      syncEmptyState();
      onChange?.(el.innerHTML, el.textContent || '');
    }, [onChange, syncEmptyState]);

    const selectMention = useCallback(
      (user: MentionUser) => {
        const el = editorRef.current;
        const range = mentionRangeRef.current;
        if (!el || !range) {
          closeMention();
          return;
        }
        const sel = window.getSelection();
        sel?.removeAllRanges();
        sel?.addRange(range);
        el.focus();
        document.execCommand('insertText', false, `@${user.username} `);
        emitChange();
        closeMention();
      },
      [closeMention, emitChange]
    );

    const handleMentionKeyDown = useCallback(
      (e: React.KeyboardEvent) => {
        if (!mention || mentionUsers.length === 0) return;
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          setMentionIndex((i) => (i + 1) % mentionUsers.length);
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          setMentionIndex((i) => (i - 1 + mentionUsers.length) % mentionUsers.length);
        } else if (e.key === 'Enter' || e.key === 'Tab') {
          e.preventDefault();
          const user = mentionUsers[mentionIndex];
          if (user) selectMention(user);
        } else if (e.key === 'Escape') {
          e.preventDefault();
          closeMention();
        }
      },
      [mention, mentionUsers, mentionIndex, selectMention, closeMention]
    );

    const focusEditor = useCallback(() => {
      editorRef.current?.focus();
    }, []);

    const exec = useCallback(
      (cmd: string, value?: string) => {
        focusEditor();
        document.execCommand(cmd, false, value);
        emitChange();
      },
      [emitChange, focusEditor]
    );

    const readActiveStates = useCallback(() => {
      try {
        setActiveStates({
          bold: document.queryCommandState('bold'),
          italic: document.queryCommandState('italic'),
          underline: document.queryCommandState('underline'),
          strikeThrough: document.queryCommandState('strikeThrough'),
        });
      } catch {
        /* navigateur sans queryCommandState */
      }
    }, []);

    const saveSelection = useCallback(() => {
      const sel = window.getSelection();
      if (sel && sel.rangeCount > 0 && editorRef.current?.contains(sel.anchorNode)) {
        savedRangeRef.current = sel.getRangeAt(0).cloneRange();
      }
    }, []);

    const restoreSelection = useCallback(() => {
      const sel = window.getSelection();
      const range = savedRangeRef.current;
      if (sel && range) {
        sel.removeAllRanges();
        sel.addRange(range);
      }
      focusEditor();
    }, [focusEditor]);

    // ── Règles Markdown à la frappe ─────────────────────────────────────

    const applyInlineMarkdown = useCallback(() => {
      const sel = window.getSelection();
      const el = editorRef.current;
      if (!sel || !sel.isCollapsed || !el || !el.contains(sel.anchorNode)) return;
      const node = sel.anchorNode;
      if (!node || node.nodeType !== Node.TEXT_NODE) return;
      const text = node.textContent || '';
      const offset = sel.anchorOffset;
      const before = text.slice(0, offset);

      const inlineRules: Array<{ re: RegExp; html: (inner: string, url?: string) => string }> = [
        { re: /\*\*([^*\s][^*]*)\*\*$/, html: (t) => `<b>${t}</b>&nbsp;` },
        { re: /(?<![*\w])\*([^*\s][^*]*)\*$/, html: (t) => `<i>${t}</i>&nbsp;` },
        { re: /__([^_\s][^_]*)__$/, html: (t) => `<u>${t}</u>&nbsp;` },
        { re: /~~([^~\s][^~]*)~~$/, html: (t) => `<s>${t}</s>&nbsp;` },
        { re: /`([^`\s][^`]*)`$/, html: (t) => `<code>${t}</code>&nbsp;` },
        { re: /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)$/, html: (t, url?) => `<a href="${escapeAttr(url || '')}">${t}</a>&nbsp;` },
      ];

      for (const rule of inlineRules) {
        const m = before.match(rule.re);
        if (!m) continue;
        const start = offset - m[0].length;
        const range = document.createRange();
        range.setStart(node, start);
        range.setEnd(node, offset);
        sel.removeAllRanges();
        sel.addRange(range);
        const inner = m[1];
        const url = m[2];
        document.execCommand('insertHTML', false, rule.html(inner, url));
        emitChange();
        return;
      }
    }, [emitChange]);

    const applyBlockMarkdown = useCallback(() => {
      const sel = window.getSelection();
      const el = editorRef.current;
      if (!sel || !sel.isCollapsed || !el || !el.contains(sel.anchorNode)) return;
      // Bloc courant = enfant direct de l'éditeur contenant le curseur
      let node: Node | null = sel.anchorNode;
      let block: HTMLElement | null = null;
      while (node && node !== el) {
        if (node.nodeType === Node.ELEMENT_NODE && (node as HTMLElement).parentElement === el) {
          block = node as HTMLElement;
          break;
        }
        node = node.parentNode;
      }
      if (!block) {
        // Première ligne : texte direct dans l'éditeur
        if (sel.anchorNode?.parentElement === el || sel.anchorNode === el) {
          const text = (el.textContent || '').trim();
          if (/^(-|\*|1\.|>) $/.test(`${text} `)) {
            el.textContent = '';
            if (text.trim() === '>') document.execCommand('formatBlock', false, 'blockquote');
            else document.execCommand(text.trim() === '1.' ? 'insertOrderedList' : 'insertUnorderedList');
            emitChange();
          }
        }
        return;
      }
      const blockText = (block.textContent || '').trim();
      if (blockText === '-' || blockText === '*') {
        block.innerHTML = '';
        document.execCommand('insertUnorderedList');
        emitChange();
      } else if (blockText === '1.') {
        block.innerHTML = '';
        document.execCommand('insertOrderedList');
        emitChange();
      } else if (blockText === '>') {
        block.innerHTML = '';
        document.execCommand('formatBlock', false, 'blockquote');
        emitChange();
      }
    }, [emitChange]);

    // ── Synchronisation de la sélection avec la barre d'outils ─────────
    const handleSelectionUpdate = useCallback(() => {
      readActiveStates();
      saveSelection();
    }, [readActiveStates, saveSelection]);

    // ── Colle le lien : popover de nommage ──────────────────────────────

    const handlePaste = useCallback(
      (e: React.ClipboardEvent) => {
        if (disabled) return;
        const pasted = (e.clipboardData.getData('text/plain') || '').trim();
        if (pasted && URL_RE.test(pasted)) {
          e.preventDefault();
          const sel = window.getSelection();
          const selectedText =
            sel && !sel.isCollapsed && editorRef.current?.contains(sel.anchorNode)
              ? sel.toString()
              : '';
          saveSelection();
          setLinkDraft({ url: pasted, text: selectedText, lockedUrl: true });
          setTimeout(() => linkTextInputRef.current?.focus(), 30);
          return;
        }
        // Collage en texte brut : évite tout HTML parasite copié ailleurs
        if (pasted) {
          e.preventDefault();
          document.execCommand('insertText', false, pasted);
        }
      },
      [disabled, saveSelection]
    );

    const insertLinkHTML = useCallback(
      (url: string, text: string) => {
        restoreSelection();
        const sel = window.getSelection();
        const hasSelection = sel && !sel.isCollapsed && editorRef.current?.contains(sel.anchorNode);
        const html = `<a href="${escapeAttr(url)}" target="_blank" rel="noopener noreferrer">${escapeAttr(text || url)}</a>&nbsp;`;
        if (hasSelection) {
          document.execCommand('insertHTML', false, html);
        } else {
          document.execCommand('insertHTML', false, html);
        }
        savedRangeRef.current = null;
        emitChange();
      },
      [emitChange, restoreSelection]
    );

    const openLinkPopover = useCallback(() => {
      const sel = window.getSelection();
      const selectedText =
        sel && !sel.isCollapsed && editorRef.current?.contains(sel.anchorNode) ? sel.toString() : '';
      saveSelection();
      setLinkDraft({ url: '', text: selectedText, lockedUrl: false });
      setTimeout(() => linkTextInputRef.current?.focus(), 30);
    }, [saveSelection]);

    const confirmLink = useCallback(() => {
      if (!linkDraft) return;
      const url = linkDraft.url.trim();
      if (!url || !URL_RE.test(url)) {
        // URL invalide : insertion en texte simple
        if (linkDraft.text.trim()) {
          restoreSelection();
          document.execCommand('insertText', false, `${linkDraft.text} ${url}`);
        }
      } else {
        insertLinkHTML(url, linkDraft.text.trim());
      }
      setLinkDraft(null);
    }, [insertLinkHTML, linkDraft, restoreSelection]);

    const toggleBlockquote = useCallback(() => {
      const sel = window.getSelection();
      const el = editorRef.current;
      if (!sel || !el || !el.contains(sel.anchorNode)) return;
      let node: Node | null = sel.anchorNode;
      let inQuote = false;
      while (node) {
        if (node === el) break;
        if ((node as HTMLElement).tagName === 'BLOCKQUOTE') {
          inQuote = true;
          break;
        }
        node = node.parentNode;
      }
      exec('formatBlock', inQuote ? 'div' : 'blockquote');
    }, [exec]);

    // ── API impérative (dictée, préremplissage, soumission) ─────────────

    useImperativeHandle(ref, () => ({
      getHTML: () => {
        const el = editorRef.current;
        if (!el) return '';
        const html = el.innerHTML;
        if (html.replace(/<br\s*\/?>/gi, '').trim() === '' && !el.querySelector('img,li,blockquote,ul,ol,a')) {
          return '';
        }
        return html;
      },
      getText: () => editorRef.current?.textContent || '',
      isEmpty: () => {
        const el = editorRef.current;
        if (!el) return true;
        return el.textContent!.trim().length === 0 && !el.querySelector('img,li,blockquote,ul,ol,a');
      },
      setHTML: (html: string) => {
        const el = editorRef.current;
        if (!el) return;
        el.innerHTML = html || '';
        syncEmptyState();
      },
      insertText: (text: string) => {
        const el = editorRef.current;
        if (!el) return;
        el.focus();
        const sel = window.getSelection();
        if (!sel || !el.contains(sel.anchorNode)) {
          // Curseur en fin d'éditeur
          const range = document.createRange();
          range.selectNodeContents(el);
          range.collapse(false);
          sel?.removeAllRanges();
          sel?.addRange(range);
        }
        document.execCommand('insertText', false, text);
        emitChange();
      },
      focus: () => editorRef.current?.focus(),
      clear: () => {
        const el = editorRef.current;
        if (!el) return;
        el.innerHTML = '';
        syncEmptyState();
      },
    }));

    // Contenu initial (montage uniquement)
    useEffect(() => {
      const el = editorRef.current;
      if (el && initialHTML) {
        el.innerHTML = initialHTML;
      }
      syncEmptyState();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const handleInput = useCallback(() => {
      applyBlockMarkdown();
      applyInlineMarkdown();
      emitChange();
      detectMention();
    }, [applyBlockMarkdown, applyInlineMarkdown, emitChange, detectMention]);

    const toolbarBtn = (
      icon: React.ReactNode,
      title: string,
      onClick: () => void,
      active?: boolean
    ) => (
      <button
        key={title}
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={onClick}
        disabled={disabled}
        className={`p-1.5 rounded-lg transition-colors ${
          active
            ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-black shadow-sm'
            : 'text-zinc-600 hover:text-zinc-950 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:text-white dark:hover:bg-zinc-800'
        }`}
        title={title}
      >
        {icon}
      </button>
    );

    return (
      <div
        ref={wrapperRef}
        className={`relative ${fillHeight ? 'flex-1 flex flex-col min-h-0' : ''} ${className}`}
        onClick={(e) => {
          // Cliquer dans la zone libre de l'éditeur place le focus
          if (
            e.target === wrapperRef.current &&
            editorRef.current &&
            document.activeElement !== editorRef.current
          ) {
            editorRef.current.focus();
          }
        }}
      >
        {/* Barre d'outils principale */}
        <div className="flex items-center gap-0.5 flex-wrap pb-1.5 border-b border-zinc-200 dark:border-zinc-800 mb-1 shrink-0">
          {toolbarBtn(<Bold className="w-3.5 h-3.5" />, 'Gras (**texte**)', () => exec('bold'), activeStates.bold)}
          {toolbarBtn(<Italic className="w-3.5 h-3.5" />, 'Italique (*texte*)', () => exec('italic'), activeStates.italic)}
          {toolbarBtn(<UnderlineIcon className="w-3.5 h-3.5" />, 'Souligné (__texte__)', () => exec('underline'), activeStates.underline)}
          {toolbarBtn(<Strikethrough className="w-3.5 h-3.5" />, 'Barré (~~texte~~)', () => exec('strikeThrough'), activeStates.strikeThrough)}
          {!compact && (
            <>
              <span className="w-px h-4 bg-zinc-300 dark:bg-zinc-800 mx-1" />
              {toolbarBtn(<List className="w-3.5 h-3.5" />, 'Liste à puces (- + espace)', () => exec('insertUnorderedList'))}
              {toolbarBtn(<ListOrdered className="w-3.5 h-3.5" />, 'Liste numérotée (1. + espace)', () => exec('insertOrderedList'))}
              {toolbarBtn(<Quote className="w-3.5 h-3.5" />, 'Citation (> + espace)', toggleBlockquote)}
              {toolbarBtn(<Code className="w-3.5 h-3.5" />, 'Code (`texte`)', () => {
                const sel = window.getSelection();
                if (sel && !sel.isCollapsed) exec('insertHTML', `<code>${escapeAttr(sel.toString())}</code>&nbsp;`);
              })}
            </>
          )}
          <span className="w-px h-4 bg-zinc-300 dark:bg-zinc-800 mx-1" />
          {toolbarBtn(<Link2 className="w-3.5 h-3.5" />, 'Insérer un lien', openLinkPopover)}
        </div>

        {/* Zone éditable */}
        <div
          ref={editorRef}
          contentEditable={!disabled}
          suppressContentEditableWarning
          role="textbox"
          aria-multiline="true"
          data-placeholder={placeholder}
          onInput={handleInput}
          onKeyDown={handleMentionKeyDown}
          onPaste={handlePaste}
          onKeyUp={handleSelectionUpdate}
          onMouseUp={handleSelectionUpdate}
          onBlur={() => {
            saveSelection();
            closeMention();
          }}
          className={`rte-content w-full bg-transparent text-black dark:text-white text-sm sm:text-base leading-relaxed focus:outline-none overflow-y-auto ${
            fillHeight
              ? 'flex-1 min-h-[10rem] sm:min-h-[14rem]'
              : compact
              ? 'min-h-[2.75rem] max-h-32'
              : 'min-h-[7rem] max-h-[45vh]'
          }`}
        />

        {/* Popover d'autocomplete de mentions « @ » */}
        {mention && mentionUsers.length > 0 && (
          <MentionAutocomplete
            users={mentionUsers}
            highlightedIndex={mentionIndex}
            onSelect={selectMention}
          />
        )}

        {/* Popover de nommage des liens (collage d'URL ou bouton lien) */}
        {linkDraft && (
          <div className="absolute z-30 top-0 left-0 right-0 p-3 rounded-2xl bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-700 shadow-2xl animate-fadeIn space-y-2 text-black dark:text-white">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-mono uppercase tracking-wider text-zinc-500 dark:text-zinc-400 flex items-center gap-1.5">
                <Link2 className="w-3 h-3" />
                {linkDraft.lockedUrl ? 'Coller un lien' : 'Insérer un lien'}
              </span>
              <button
                type="button"
                onClick={() => setLinkDraft(null)}
                className="p-0.5 rounded-full text-zinc-400 hover:text-black dark:hover:text-white"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="flex gap-2">
              <input
                ref={linkTextInputRef}
                type="text"
                value={linkDraft.text}
                onChange={(e) => setLinkDraft((d) => (d ? { ...d, text: e.target.value } : d))}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    confirmLink();
                  }
                }}
                placeholder="Nom du lien (ex : ICI)"
                className="flex-1 min-w-0 px-3 py-2 rounded-xl bg-zinc-50 dark:bg-black border border-zinc-200 dark:border-zinc-800 text-sm text-black dark:text-white placeholder-zinc-400 dark:placeholder-zinc-500 focus:outline-none focus:border-zinc-400 dark:focus:border-zinc-500"
              />
              {!linkDraft.lockedUrl && (
                <input
                  type="url"
                  value={linkDraft.url}
                  onChange={(e) => setLinkDraft((d) => (d ? { ...d, url: e.target.value } : d))}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      confirmLink();
                    }
                  }}
                  placeholder="https://…"
                  className="flex-1 min-w-0 px-3 py-2 rounded-xl bg-zinc-50 dark:bg-black border border-zinc-200 dark:border-zinc-800 text-sm text-black dark:text-white placeholder-zinc-400 dark:placeholder-zinc-500 focus:outline-none focus:border-zinc-400 dark:focus:border-zinc-500 font-mono text-xs"
                />
              )}
              <button
                type="button"
                onClick={confirmLink}
                className="px-3 py-2 rounded-xl bg-zinc-900 text-white dark:bg-white dark:text-black text-xs font-bold hover:bg-zinc-800 dark:hover:bg-zinc-200 transition-colors flex items-center gap-1 shrink-0"
              >
                <Check className="w-3.5 h-3.5" />
                Insérer
              </button>
            </div>
            {linkDraft.lockedUrl && (
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] text-zinc-500 font-mono truncate">{linkDraft.url}</span>
                <button
                  type="button"
                  onClick={() => {
                    restoreSelection();
                    document.execCommand('insertText', false, linkDraft.url);
                    setLinkDraft(null);
                    emitChange();
                  }}
                  className="text-[11px] text-zinc-500 hover:text-black dark:text-zinc-400 dark:hover:text-white flex items-center gap-1 shrink-0"
                >
                  <CornerDownLeft className="w-3 h-3" />
                  Coller l'URL telle quelle
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    );
  }
);

RichTextEditor.displayName = 'RichTextEditor';
