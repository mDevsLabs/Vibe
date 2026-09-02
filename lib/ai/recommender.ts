/**
 * ============================================================================
 * VIBE SOCIAL PLATFORM — HYBRID AI RECOMMENDER (lib/ai/recommender.ts)
 * Dual-Timeline Scoring Engine & Algorithmic Explainability Inspector
 * ============================================================================
 */

export interface FeedTunerWeights {
  freshness: number;
  novelty: number;
  popularity: number;
  serendipity: number;
  proximity: number;
}

export interface PostCandidate {
  postId: string;
  publishedAt: Date;
  likes: number;
  reposts: number;
  replies: number;
  semanticSimilarity?: number;
  isFollowedAuthor?: boolean;
  isSecondDegree?: boolean;
  candidateTopic?: string;
  recentTopics?: string[];
  candidateSentiment?: number;
  dominantSentiment?: number;
  toxicityScore?: number;
  authorReputation?: number;
  tuner?: FeedTunerWeights;
}

export interface RecommendationSignal {
  totalScore: number;
  explanationText: string;
  matchedInterests: string[];
  breakdown: {
    freshnessScore: number;
    engagementScore: number;
    velocityScore: number;
    semanticScore: number;
    graphProximityScore: number;
    diversityPenalty: number;
    safetyFactor: number;
  };
}

export class HybridRecommender {
  private static readonly DEFAULT_TUNER: FeedTunerWeights = {
    freshness: 0.35,
    novelty: 0.25,
    popularity: 0.20,
    serendipity: 0.10,
    proximity: 0.10,
  };

  /**
   * Calcule le score de recommandation d'une publication avec explicabilité
   */
  public static scorePost(candidate: PostCandidate): RecommendationSignal {
    const tuner = candidate.tuner || this.DEFAULT_TUNER;
    const now = Date.now();
    const publishedTime = candidate.publishedAt.getTime();
    const ageInHours = Math.max(0, (now - publishedTime) / (1000 * 60 * 60));

    // 1. Décroissance temporelle (Half-life = 12h)
    const freshnessScore = Math.exp(-ageInHours / 12);

    // 2. Engagement brut et vélocité
    const rawEngagements = candidate.likes * 1.0 + candidate.reposts * 2.0 + candidate.replies * 1.5;
    const engagementScore = Math.min(1.0, Math.log10(rawEngagements + 1) / 3.0);
    const velocityScore = Math.min(1.0, (rawEngagements / Math.max(1, ageInHours)) / 10.0);

    // 3. Affinité sémantique
    const semanticScore = candidate.semanticSimilarity ?? 0.5;

    // 4. Proximité dans le graphe social
    let graphProximityScore = 0.2;
    if (candidate.isFollowedAuthor) graphProximityScore = 1.0;
    else if (candidate.isSecondDegree) graphProximityScore = 0.6;

    // 5. Facteur de sécurité / modération
    const toxicity = candidate.toxicityScore || 0;
    const safetyFactor = Math.max(0, 1 - toxicity * 2);

    // Score pondéré final
    const rawScore =
      tuner.freshness * freshnessScore +
      tuner.popularity * engagementScore +
      tuner.proximity * graphProximityScore +
      tuner.novelty * velocityScore +
      tuner.serendipity * (1 - semanticScore * 0.5);

    const totalScore = Math.max(0, Math.min(100, Math.round(rawScore * safetyFactor * 100)));

    // Génération de l'explication transparente
    const matchedInterests: string[] = [];
    if (candidate.candidateTopic) matchedInterests.push(candidate.candidateTopic);

    let explanationText = "Recommandé pour vous selon vos interactions récentes";
    if (candidate.isFollowedAuthor) {
      explanationText = "Publication d'un auteur que vous suivez.";
    } else if (velocityScore > 0.6) {
      explanationText = "Tendance émergente avec un fort engagement communautaire.";
    } else if (freshnessScore > 0.8) {
      explanationText = "Publication très récente dans un sujet qui vous intéresse.";
    } else if (candidate.candidateTopic) {
      explanationText = `Populaire dans la thématique « ${candidate.candidateTopic} ».`;
    }

    return {
      totalScore,
      explanationText,
      matchedInterests,
      breakdown: {
        freshnessScore: Math.round(freshnessScore * 100),
        engagementScore: Math.round(engagementScore * 100),
        velocityScore: Math.round(velocityScore * 100),
        semanticScore: Math.round(semanticScore * 100),
        graphProximityScore: Math.round(graphProximityScore * 100),
        diversityPenalty: 0,
        safetyFactor: Number(safetyFactor.toFixed(2)),
      },
    };
  }
}
