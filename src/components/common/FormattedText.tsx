/**
 * ============================================================================
 * VIBE SOCIAL PLATFORM — FORMATTED TEXT (src/components/common/FormattedText.tsx)
 * Interactive Hashtags (#tag) & Mentions (@username) with Navigation
 * ============================================================================
 */

import React from 'react';
import { useNavigate } from 'react-router-dom';

interface FormattedTextProps {
  text: string;
  className?: string;
  onOpenProfile?: (username: string) => void;
  onSelectHashtag?: (tag: string) => void;
}

export const FormattedText: React.FC<FormattedTextProps> = ({
  text,
  className = '',
  onOpenProfile,
  onSelectHashtag,
}) => {
  const navigate = useNavigate();

  if (!text) return null;

  // Regex pour capturer les mentions (@username) et hashtags (#tag)
  // Supporte les caractères accentués pour les hashtags français
  const tokenRegex = /(@[a-zA-Z0-9_]{1,30})|(#[\w\u00C0-\u017F]+)/g;

  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = tokenRegex.exec(text)) !== null) {
    const matchIndex = match.index;
    if (matchIndex > lastIndex) {
      parts.push(text.substring(lastIndex, matchIndex));
    }

    const token = match[0];
    const isMention = token.startsWith('@');
    const isHashtag = token.startsWith('#');

    if (isMention) {
      const username = token.slice(1);
      parts.push(
        <button
          key={`mention-${matchIndex}`}
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            if (onOpenProfile) {
              onOpenProfile(username);
            } else {
              navigate(`/@${username}`);
            }
          }}
          className="inline font-semibold text-sky-400 hover:text-sky-300 hover:underline cursor-pointer transition-colors"
        >
          {token}
        </button>
      );
    } else if (isHashtag) {
      const tag = token;
      parts.push(
        <button
          key={`hashtag-${matchIndex}`}
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            if (onSelectHashtag) {
              onSelectHashtag(tag);
            } else {
              navigate(`/explore?q=${encodeURIComponent(tag)}&tab=hashtags`);
            }
          }}
          className="inline font-semibold text-sky-400 hover:text-sky-300 hover:underline cursor-pointer transition-colors"
        >
          {token}
        </button>
      );
    }

    lastIndex = matchIndex + token.length;
  }

  if (lastIndex < text.length) {
    parts.push(text.substring(lastIndex));
  }

  return (
    <span className={`whitespace-pre-wrap break-words ${className}`}>
      {parts}
    </span>
  );
};
