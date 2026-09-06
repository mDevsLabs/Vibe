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
const ALLOWED_ATTR = ['href', 'target', 'rel'];

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
    // Sanitization stricte : seul un sous-ensemble de balises passe. Le texte
    // brut historique (sans balise) est échappé par DOMPurify, sans perte des \n.
    let clean = DOMPurify.sanitize(content, {
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
