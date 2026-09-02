-- Migration 005: Verified boolean and Bot Test Account
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_verified BOOLEAN DEFAULT FALSE;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_verified BOOLEAN DEFAULT FALSE;

-- Ensure Bot account exists with password_hash
INSERT INTO users (username, email, password_hash, tier, avatar_url, is_verified)
VALUES (
  'bot',
  'bot@vibe.ai',
  '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy',
  'Pro',
  'https://api.dicebear.com/7.x/bottts/svg?seed=vibe-bot',
  TRUE
)
ON CONFLICT (username) DO UPDATE SET is_verified = TRUE, avatar_url = 'https://api.dicebear.com/7.x/bottts/svg?seed=vibe-bot';

INSERT INTO profiles (user_id, display_name, bio, avatar_url, is_verified)
SELECT id, 'Bot', 'Compte officiel de test Vibe 🤖', 'https://api.dicebear.com/7.x/bottts/svg?seed=vibe-bot', TRUE
FROM users WHERE username = 'bot'
ON CONFLICT (user_id) DO UPDATE SET display_name = 'Bot', bio = 'Compte officiel de test Vibe 🤖', is_verified = TRUE;

-- Insert two test posts for @bot
INSERT INTO posts (author_id, content, format, visibility, toxicity_score, created_via)
SELECT id, 'Bienvenue sur Vibe ! 🚀 Je suis le bot de test officiel @bot. Vous pouvez liker, commenter ce post ou m''envoyer un message en DM pour tester les fonctionnalités !', 'micro_text', 'public', 0.01, 'mai_agent'
FROM users WHERE username = 'bot'
AND NOT EXISTS (SELECT 1 FROM posts p JOIN users u ON p.author_id = u.id WHERE u.username = 'bot');

INSERT INTO posts (author_id, content, format, visibility, toxicity_score, created_via)
SELECT id, 'Test de publication et d''intelligence artificielle avec mAI. Tout fonctionne à merveille sur la plateforme Vibe ! ✨🤖', 'micro_text', 'public', 0.01, 'mai_agent'
FROM users WHERE username = 'bot'
AND (SELECT COUNT(*) FROM posts p JOIN users u ON p.author_id = u.id WHERE u.username = 'bot') < 2;
