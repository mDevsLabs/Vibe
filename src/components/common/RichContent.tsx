/**
 * ============================================================================
 * VIBE SOCIAL PLATFORM — RICH CONTENT (src/components/common/RichContent.tsx)
 * Rendu sécurisé du contenu riche (HTML WYSIWYG ou texte brut historique) :
 * sanitization DOMPurify, liens cliquables (@mentions, #hashtags, URLs).
 * ============================================================================
 */

import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import DOMPurify from 'dompurify';

const MENTION_RE = /^@[a-zA-Z0-9_]{1,30}$/;
const HASHTAG_RE = /^#[\w\u00C0-\u017F]{1,50}$/;
const URL_RE = /^https?:\/\/[^\s]+$/i;

const ALLOWED_TAGS = [
  'p', 'br', 'div', 'span',
  'b', 'strong', 'i', 'em', 'u', 's', 'strike', 'del', 'mark',
  'ul', 'ol', 'li',
  'blockquote', 'code', 'pre',
  'a',
];
const ALLOWED_ATTR = ['href', 'target', 'rel', 'class'];

/**
 * Convertit le markdown textuel standard (gras, italique, barré, code, listes, titres, citations)
 * en balises HTML autorisées avant assainissement par DOMPurify.
 */
function parseMarkdownToHtml(raw: string): string {
  if (!raw) return '';

  // 1. Sauvegarder les blocs de code multi-lignes ```lang ... ```
  const codeBlocks: string[] = [];
  let text = raw.replace(/```([a-zA-Z0-9_-]*)\n?([\s\S]*?)```/g, (_m, lang, code) => {
    const idx = codeBlocks.length;
    const escaped = code
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    codeBlocks.push(`<pre><code class="language-${lang || 'plaintext'}">${escaped}</code></pre>`);
    return `<!--VIBE_CODE_BLOCK_${idx}-->`;
  });

  // 2. Sauvegarder le code en ligne `code`
  const inlineCodes: string[] = [];
  text = text.replace(/`([^`\n]+)`/g, (_m, code) => {
    const idx = inlineCodes.length;
    const escaped = code
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    inlineCodes.push(`<code>${escaped}</code>`);
    return `<!--VIBE_INLINE_CODE_${idx}-->`;
  });

  // 3. Liens markdown [Label](url)
  text = text.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer" class="rich-link">$1</a>');

  // 4. Titres markdown : ###, ##, #
  text = text.replace(/^###[ \t]+([^\n]+)$/gm, '<strong>$1</strong>');
  text = text.replace(/^##[ \t]+([^\n]+)$/gm, '<strong>$1</strong>');
  text = text.replace(/^#[ \t]+([^\n]+)$/gm, '<strong>$1</strong>');

  // 5. Citations : > texte
  text = text.replace(/^>[ \t]+([^\n]+)$/gm, '<blockquote>$1</blockquote>');

  // 6. Gras et italique combinés ***texte*** ou ___texte___
  text = text.replace(/(\*\*\*|___)(.+?)\1/g, '<strong><em>$2</em></strong>');

  // 7. Gras **texte** ou __texte__
  text = text.replace(/(\*\*|__)(.+?)\1/g, '<strong>$2</strong>');

  // 8. Italique *texte* ou _texte_
  text = text.replace(/(?<![\w*])\*([^*\n]+?)\*(?![\w*])/g, '<em>$1</em>');
  text = text.replace(/(?<![\w_])_([^_\n]+?)_(?![\w_])/g, '<em>$1</em>');

  // 9. Barré ~~texte~~
  text = text.replace(/~~(.+?)~~/g, '<del>$1</del>');

  // 10. Puces de listes standard (- item ou * item)
  text = text.replace(/^[-*][ \t]+([^\n]+)$/gm, '• $1');

  // 11. Restaurer le code en ligne et les blocs de code
  text = text.replace(/<!--VIBE_INLINE_CODE_(\d+)-->/g, (_m, idx) => inlineCodes[Number(idx)] || '');
  text = text.replace(/<!--VIBE_CODE_BLOCK_(\d+)-->/g, (_m, idx) => codeBlocks[Number(idx)] || '');

  return text;
}

/**
 * Transforme les @mentions / #hashtags / URLs présents dans les nœuds texte
 * en ancres cliquables (sur un élément DOM détaché, hors React).
 */
function linkifyTextNodes(root: HTMLElement) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const textNodes: Text[] = [];
  while (walker.nextNode()) textNodes.push(walker.currentNode as Text);

  for (const node of textNodes) {
    const raw = node.textContent || '';
    if (!raw || !raw.trim()) continue;
    const parts = raw.split(/(\s+)/);
    const hasToken = parts.some(
      (p) => MENTION_RE.test(p) || HASHTAG_RE.test(p) || URL_RE.test(p)
    );
    if (!hasToken) continue;

    const frag = document.createDocumentFragment();
    let changed = false;
    for (const part of parts) {
      if (MENTION_RE.test(part)) {
        const a = document.createElement('a');
        a.setAttribute('href', `/@${part.slice(1)}`);
        a.setAttribute('data-mention', part.slice(1));
        a.className = 'rich-link';
        a.textContent = part;
        frag.appendChild(a);
        changed = true;
      } else if (HASHTAG_RE.test(part)) {
        const a = document.createElement('a');
        a.setAttribute('href', `/explore?q=${encodeURIComponent(part)}&tab=hashtags`);
        a.setAttribute('data-hashtag', part);
        a.className = 'rich-link';
        a.textContent = part;
        frag.appendChild(a);
        changed = true;
      } else if (URL_RE.test(part)) {
        const a = document.createElement('a');
        a.setAttribute('href', part);
        a.setAttribute('data-external', '1');
        a.className = 'rich-link';
        a.textContent = part;
        frag.appendChild(a);
        changed = true;
      } else {
        frag.appendChild(document.createTextNode(part));
      }
    }
    if (changed && node.parentNode) {
      node.parentNode.replaceChild(frag, node);
    }
  }
}

function buildSafeHtml(content: string): string {
  if (!content) return '';
  try {
    const parsed = parseMarkdownToHtml(content);
    // Sanitization stricte : seul un sous-ensemble de balises passe. Le texte
    // brut historique (sans balise) est échappé par DOMPurify, sans perte des \n.
    let clean = DOMPurify.sanitize(parsed, {
      ALLOWED_TAGS,
      ALLOWED_ATTR,
      ALLOW_DATA_ATTR: false,
    });
    const tpl = document.createElement('div');
    tpl.innerHTML = clean;
    linkifyTextNodes(tpl);
    // Les liens externes s'ouvrent dans un nouvel onglet
    tpl.querySelectorAll('a[href^="http"]').forEach((a) => {
      a.setAttribute('target', '_blank');
      a.setAttribute('rel', 'noopener noreferrer');
    });
    clean = tpl.innerHTML;
    return clean;
  } catch {
    return DOMPurify.sanitize(content);
  }
}

interface RichContentProps {
  content: string;
  className?: string;
  onOpenProfile?: (username: string) => void;
  onSelectHashtag?: (tag: string) => void;
}

export const RichContent: React.FC<RichContentProps> = ({
  content,
  className = '',
  onOpenProfile,
  onSelectHashtag,
}) => {
  const navigate = useNavigate();
  const html = useMemo(() => buildSafeHtml(content || ''), [content]);

  if (!content) return null;

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const anchor = (e.target as HTMLElement).closest('a');
    if (!anchor) return;
    e.preventDefault();
    e.stopPropagation();
    const mention = anchor.getAttribute('data-mention');
    const hashtag = anchor.getAttribute('data-hashtag');
    if (mention) {
      if (onOpenProfile) onOpenProfile(mention);
      else navigate(`/@${mention}`);
    } else if (hashtag) {
      if (onSelectHashtag) onSelectHashtag(hashtag);
      else navigate(`/explore?q=${encodeURIComponent(hashtag)}&tab=hashtags`);
    } else {
      const href = anchor.getAttribute('href') || '';
      if (href.startsWith('http')) {
        window.open(href, '_blank', 'noopener,noreferrer');
      } else if (href) {
        navigate(href);
      }
    }
  };

  return (
    <div
      className={`rich-content whitespace-pre-wrap break-words ${className}`}
      onClick={handleClick}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
};

/** Indique si un contenu est au format HTML riche (nouveau) ou texte brut. */
export const isRichHtml = (content: string | undefined | null): boolean =>
  Boolean(content && /<[a-z][\s\S]*>/i.test(content));

/** Version texte brut d'un contenu riche (aperçus, snippets, dictée…). */
export const htmlToPlainText = (content: string | undefined | null): string => {
  if (!content) return '';
  if (!isRichHtml(content)) return content;
  try {
    const tpl = document.createElement('div');
    tpl.innerHTML = content;
    return tpl.textContent || '';
  } catch {
    return content.replace(/<[^>]*>/g, ' ');
  }
};
