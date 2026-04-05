import { HttpError } from '../../lib/http-error.js';
import type { AuditWriteInput } from '../audit/types.js';
import { createRecommendationsRepository } from './repository.js';
import type {
  RecommendationFeedbackAction,
  RecommendationItem,
  RecommendationPreferencesRecord,
  RecommendationTargetType,
  ResourceRecommendationCandidate
} from './types.js';

type RecommendationsRepository = ReturnType<typeof createRecommendationsRepository>;

interface AuditWriter {
  write(input: AuditWriteInput): Promise<void>;
}

const FEEDBACK_ACTIONS: RecommendationFeedbackAction[] = ['LIKE', 'NOT_INTERESTED', 'BLOCK'];
const TARGET_TYPES: RecommendationTargetType[] = ['JOURNAL', 'FUNDING_PROGRAM', 'RESOURCE'];
const RESOURCE_TYPES: ResourceRecommendationCandidate['resourceType'][] = ['ROOM', 'EQUIPMENT', 'CONSULTATION'];

const withMeta = (meta: { requestId?: string; ip?: string; userAgent?: string }) => ({
  ...(meta.requestId ? { requestId: meta.requestId } : {}),
  ...(meta.ip ? { ip: meta.ip } : {}),
  ...(meta.userAgent ? { userAgent: meta.userAgent } : {})
});

const normalizeTokenList = (values: string[], options?: { uppercase?: boolean; maxItems?: number }): string[] => {
  const result: string[] = [];
  const seen = new Set<string>();

  for (const raw of values) {
    const trimmed = raw.trim();
    if (!trimmed) continue;

    const normalized = options?.uppercase ? trimmed.toUpperCase() : trimmed.toLowerCase();
    if (seen.has(normalized)) continue;

    seen.add(normalized);
    result.push(normalized);

    if (options?.maxItems && result.length >= options.maxItems) {
      break;
    }
  }

  return result;
};

const flattenCustomFieldText = (value: unknown): string[] => {
  if (value === null || value === undefined) {
    return [];
  }

  if (Array.isArray(value)) {
    return value.flatMap(flattenCustomFieldText);
  }

  if (typeof value === 'object') {
    return Object.values(value as Record<string, unknown>).flatMap(flattenCustomFieldText);
  }

  return [String(value)];
};

const includesToken = (texts: Array<string | null | undefined>, token: string): boolean => {
  const lowered = token.toLowerCase();
  return texts.some((text) => (text ?? '').toLowerCase().includes(lowered));
};

const feedbackKey = (targetType: RecommendationTargetType, targetId: string): string => `${targetType}:${targetId}`;

const scoredSort = (left: RecommendationItem, right: RecommendationItem): number => {
  if (right.score !== left.score) {
    return right.score - left.score;
  }

  if (left.targetType !== right.targetType) {
    return left.targetType.localeCompare(right.targetType);
  }

  return left.title.localeCompare(right.title);
};

export const createRecommendationsService = (deps: { repository: RecommendationsRepository; audit: AuditWriter }) => {
  const { repository, audit } = deps;

  return {
    async getResearcherPreferences(userId: string): Promise<RecommendationPreferencesRecord> {
      return repository.getPreferences(userId);
    },

    async updateResearcherPreferences(input: {
      userId: string;
      preferredDisciplines: string[];
      preferredKeywords: string[];
      preferredPublishers: string[];
      preferredResourceTypes: string[];
      preferredLocations: string[];
      meta: { requestId?: string; ip?: string; userAgent?: string };
    }): Promise<RecommendationPreferencesRecord> {
      const preferredDisciplines = normalizeTokenList(input.preferredDisciplines, { maxItems: 20 });
      const preferredKeywords = normalizeTokenList(input.preferredKeywords, { maxItems: 25 });
      const preferredPublishers = normalizeTokenList(input.preferredPublishers, { maxItems: 20 });
      const preferredLocations = normalizeTokenList(input.preferredLocations, { maxItems: 20 });
      const preferredResourceTypes = normalizeTokenList(input.preferredResourceTypes, { uppercase: true, maxItems: 3 });

      for (const resourceType of preferredResourceTypes) {
        if (!RESOURCE_TYPES.includes(resourceType as ResourceRecommendationCandidate['resourceType'])) {
          throw new HttpError(400, 'INVALID_RESOURCE_TYPE_PREFERENCE', `Unsupported resource type preference: ${resourceType}`);
        }
      }

      const saved = await repository.upsertPreferences({
        userId: input.userId,
        preferredDisciplines,
        preferredKeywords,
        preferredPublishers,
        preferredResourceTypes,
        preferredLocations
      });

      await audit.write({
        actorUserId: input.userId,
        eventType: 'RECOMMENDATION_PREFERENCES_UPDATED',
        entityType: 'recommendation_preferences',
        entityId: input.userId,
        outcome: 'success',
        details: {
          preferredDisciplines: saved.preferredDisciplines.length,
          preferredKeywords: saved.preferredKeywords.length,
          preferredPublishers: saved.preferredPublishers.length,
          preferredResourceTypes: saved.preferredResourceTypes.length,
          preferredLocations: saved.preferredLocations.length
        },
        ...withMeta(input.meta)
      });

      return saved;
    },

    async listResearcherFeedback(userId: string) {
      return repository.listFeedbackByUser(userId);
    },

    async setResearcherFeedback(input: {
      userId: string;
      targetType: string;
      targetId: string;
      action: string;
      meta: { requestId?: string; ip?: string; userAgent?: string };
    }) {
      const targetType = input.targetType as RecommendationTargetType;
      const action = input.action as RecommendationFeedbackAction;

      if (!TARGET_TYPES.includes(targetType)) {
        throw new HttpError(400, 'INVALID_RECOMMENDATION_TARGET_TYPE', 'Unsupported recommendation target type.');
      }

      if (!FEEDBACK_ACTIONS.includes(action)) {
        throw new HttpError(400, 'INVALID_RECOMMENDATION_FEEDBACK_ACTION', 'Unsupported recommendation feedback action.');
      }

      const exists = await repository.recommendationTargetExists(targetType, input.targetId);
      if (!exists) {
        throw new HttpError(404, 'RECOMMENDATION_TARGET_NOT_FOUND', 'Recommendation target was not found.');
      }

      const feedback = await repository.upsertFeedback({
        userId: input.userId,
        targetType,
        targetId: input.targetId,
        action
      });

      await audit.write({
        actorUserId: input.userId,
        eventType: 'RECOMMENDATION_FEEDBACK_SET',
        entityType: 'recommendation_feedback',
        entityId: feedback.id,
        outcome: 'success',
        details: {
          targetType,
          targetId: input.targetId,
          action
        },
        ...withMeta(input.meta)
      });

      return feedback;
    },

    async listResearcherRecommendations(userId: string): Promise<{
      preferences: RecommendationPreferencesRecord;
      feedback: Awaited<ReturnType<RecommendationsRepository['listFeedbackByUser']>>;
      recommendations: RecommendationItem[];
    }> {
      const [preferences, feedbackRows, journals, fundingPrograms, resources, recentBookingSignals] = await Promise.all([
        repository.getPreferences(userId),
        repository.listFeedbackByUser(userId),
        repository.listJournalCandidates(),
        repository.listFundingProgramCandidates(),
        repository.listResourceCandidates(),
        repository.listRecentBookingSignals(userId)
      ]);

      const feedbackByTarget = new Map(feedbackRows.map((entry) => [feedbackKey(entry.targetType, entry.targetId), entry.action] as const));
      const recentBookingByResourceId = new Map(recentBookingSignals.map((entry) => [entry.resourceId, entry] as const));
      const recentBookingTypeCounts = new Map<string, number>();
      const recentBookingLocationCounts = new Map<string, number>();

      for (const signal of recentBookingSignals) {
        recentBookingTypeCounts.set(signal.resourceType, (recentBookingTypeCounts.get(signal.resourceType) ?? 0) + signal.bookingCount);
        if (signal.location) {
          const normalizedLocation = signal.location.toLowerCase();
          recentBookingLocationCounts.set(normalizedLocation, (recentBookingLocationCounts.get(normalizedLocation) ?? 0) + signal.bookingCount);
        }
      }

      const recommendations: RecommendationItem[] = [];

      for (const journal of journals) {
        const feedbackAction = feedbackByTarget.get(feedbackKey('JOURNAL', journal.id)) ?? null;
        if (feedbackAction === 'BLOCK') continue;

        let score = 28;
        const reasons: string[] = ['Indexed journal record in the current governance catalog.'];

        if (journal.publisher && preferences.preferredPublishers.some((publisher) => journal.publisher?.toLowerCase().includes(publisher))) {
          score += 18;
          reasons.push(`Matches preferred publisher "${journal.publisher}".`);
        }

        const customFieldTexts = flattenCustomFieldText(journal.customFieldValues).map((entry) => entry.toLowerCase());
        const matchedDiscipline = preferences.preferredDisciplines.find((discipline) => customFieldTexts.some((text) => text.includes(discipline)));
        if (matchedDiscipline) {
          score += 16;
          reasons.push(`Matches preferred discipline keyword "${matchedDiscipline}" in journal metadata.`);
        }

        for (const keyword of preferences.preferredKeywords.slice(0, 3)) {
          if (includesToken([journal.title, journal.publisher, ...customFieldTexts], keyword)) {
            score += 10;
            reasons.push(`Contains your keyword "${keyword}".`);
          }
        }

        if (feedbackAction === 'LIKE') {
          score += 20;
          reasons.push('You previously liked this item.');
        } else if (feedbackAction === 'NOT_INTERESTED') {
          score -= 14;
          reasons.push('You marked this item as not interested before.');
        }

        recommendations.push({
          targetType: 'JOURNAL',
          targetId: journal.id,
          title: journal.title,
          subtitle: journal.publisher ? `Publisher: ${journal.publisher}` : 'Publisher not specified',
          score: Math.max(1, score),
          reasons: reasons.slice(0, 4),
          feedbackAction
        });
      }

      for (const program of fundingPrograms) {
        const feedbackAction = feedbackByTarget.get(feedbackKey('FUNDING_PROGRAM', program.id)) ?? null;
        if (feedbackAction === 'BLOCK') continue;

        let score = 30;
        const reasons: string[] = ['Funding program is currently active.'];

        const now = Date.now();
        const daysUntilDeadline = Math.floor((program.submissionDeadlineAt.getTime() - now) / (1000 * 60 * 60 * 24));
        if (daysUntilDeadline >= 0 && daysUntilDeadline <= 45) {
          score += 8;
          reasons.push(`Submission deadline is within ${daysUntilDeadline} day(s).`);
        }

        for (const keyword of preferences.preferredKeywords.slice(0, 3)) {
          if (includesToken([program.title, program.description], keyword)) {
            score += 12;
            reasons.push(`Contains your keyword "${keyword}".`);
          }
        }

        if (feedbackAction === 'LIKE') {
          score += 20;
          reasons.push('You previously liked this item.');
        } else if (feedbackAction === 'NOT_INTERESTED') {
          score -= 14;
          reasons.push('You marked this item as not interested before.');
        }

        recommendations.push({
          targetType: 'FUNDING_PROGRAM',
          targetId: program.id,
          title: program.title,
          subtitle: `Policy period ${program.periodStart} to ${program.periodEnd}`,
          score: Math.max(1, score),
          reasons: reasons.slice(0, 4),
          feedbackAction
        });
      }

      for (const resource of resources) {
        const feedbackAction = feedbackByTarget.get(feedbackKey('RESOURCE', resource.id)) ?? null;
        if (feedbackAction === 'BLOCK') continue;

        let score = 24;
        const reasons: string[] = ['Resource is active in the current booking catalog.'];

        const exactRecentBooking = recentBookingByResourceId.get(resource.id);
        if (exactRecentBooking) {
          score += 22;
          reasons.push(`You booked this resource ${exactRecentBooking.bookingCount} time(s) recently.`);
        } else {
          const recentTypeBookings = recentBookingTypeCounts.get(resource.resourceType) ?? 0;
          if (recentTypeBookings > 0) {
            score += 12;
            reasons.push(`Matches your recent booking activity for ${resource.resourceType.toLowerCase()} resources.`);
          }

          const normalizedLocation = resource.location?.toLowerCase() ?? null;
          const recentLocationBookings = normalizedLocation ? (recentBookingLocationCounts.get(normalizedLocation) ?? 0) : 0;
          if (recentLocationBookings > 0) {
            score += 6;
            reasons.push(`Aligns with your recent booking activity in ${resource.location}.`);
          }
        }

        if (preferences.preferredResourceTypes.includes(resource.resourceType)) {
          score += 18;
          reasons.push(`Matches preferred resource type ${resource.resourceType}.`);
        }

        if (resource.location && preferences.preferredLocations.some((location) => resource.location?.toLowerCase().includes(location))) {
          score += 10;
          reasons.push(`Matches preferred location "${resource.location}".`);
        }

        for (const keyword of preferences.preferredKeywords.slice(0, 3)) {
          if (includesToken([resource.name, resource.description, resource.location], keyword)) {
            score += 10;
            reasons.push(`Contains your keyword "${keyword}".`);
          }
        }

        if (feedbackAction === 'LIKE') {
          score += 20;
          reasons.push('You previously liked this item.');
        } else if (feedbackAction === 'NOT_INTERESTED') {
          score -= 14;
          reasons.push('You marked this item as not interested before.');
        }

        recommendations.push({
          targetType: 'RESOURCE',
          targetId: resource.id,
          title: resource.name,
          subtitle: `${resource.resourceType} · Capacity ${resource.capacity}${resource.location ? ` · ${resource.location}` : ''}`,
          score: Math.max(1, score),
          reasons: reasons.slice(0, 4),
          feedbackAction
        });
      }

      recommendations.sort(scoredSort);

      return {
        preferences,
        feedback: feedbackRows,
        recommendations
      };
    }
  };
};
