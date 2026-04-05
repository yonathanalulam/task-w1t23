import type { Pool } from 'pg';
import type {
  FundingProgramRecommendationCandidate,
  JournalRecommendationCandidate,
  RecentBookingSignalRecord,
  RecommendationFeedbackAction,
  RecommendationFeedbackRecord,
  RecommendationPreferencesRecord,
  RecommendationTargetType,
  ResourceRecommendationCandidate
} from './types.js';

const toDate = (value: unknown): Date => (value instanceof Date ? value : new Date(String(value)));

const emptyPreferences = (userId: string): RecommendationPreferencesRecord => ({
  userId,
  preferredDisciplines: [],
  preferredKeywords: [],
  preferredPublishers: [],
  preferredResourceTypes: [],
  preferredLocations: [],
  updatedAt: new Date(0)
});

const mapPreferences = (row: Record<string, unknown>): RecommendationPreferencesRecord => ({
  userId: String(row.user_id),
  preferredDisciplines: Array.isArray(row.preferred_disciplines) ? row.preferred_disciplines.map(String) : [],
  preferredKeywords: Array.isArray(row.preferred_keywords) ? row.preferred_keywords.map(String) : [],
  preferredPublishers: Array.isArray(row.preferred_publishers) ? row.preferred_publishers.map(String) : [],
  preferredResourceTypes: Array.isArray(row.preferred_resource_types) ? row.preferred_resource_types.map(String) : [],
  preferredLocations: Array.isArray(row.preferred_locations) ? row.preferred_locations.map(String) : [],
  updatedAt: toDate(row.updated_at)
});

const mapFeedback = (row: Record<string, unknown>): RecommendationFeedbackRecord => ({
  id: String(row.id),
  userId: String(row.user_id),
  targetType: String(row.target_type) as RecommendationTargetType,
  targetId: String(row.target_id),
  action: String(row.action) as RecommendationFeedbackAction,
  createdAt: toDate(row.created_at),
  updatedAt: toDate(row.updated_at)
});

const mapJournalCandidate = (row: Record<string, unknown>): JournalRecommendationCandidate => ({
  id: String(row.id),
  title: String(row.title),
  publisher: row.publisher ? String(row.publisher) : null,
  customFieldValues: typeof row.custom_field_values === 'object' && row.custom_field_values !== null ? (row.custom_field_values as Record<string, unknown>) : {},
  updatedAt: toDate(row.updated_at)
});

const mapFundingProgramCandidate = (row: Record<string, unknown>): FundingProgramRecommendationCandidate => ({
  id: String(row.id),
  title: String(row.title),
  description: row.description ? String(row.description) : null,
  periodStart: String(row.period_start),
  periodEnd: String(row.period_end),
  submissionDeadlineAt: toDate(row.submission_deadline_at),
  isActive: Boolean(row.is_active),
  updatedAt: toDate(row.updated_at)
});

const mapResourceCandidate = (row: Record<string, unknown>): ResourceRecommendationCandidate => ({
  id: String(row.id),
  name: String(row.name),
  description: row.description ? String(row.description) : null,
  location: row.location ? String(row.location) : null,
  resourceType: String(row.resource_type) as ResourceRecommendationCandidate['resourceType'],
  capacity: Number(row.capacity),
  timezone: String(row.timezone),
  isActive: Boolean(row.is_active),
  updatedAt: toDate(row.updated_at)
});

const mapRecentBookingSignal = (row: Record<string, unknown>): RecentBookingSignalRecord => ({
  resourceId: String(row.resource_id),
  resourceName: String(row.resource_name),
  resourceType: String(row.resource_type) as RecentBookingSignalRecord['resourceType'],
  location: row.location ? String(row.location) : null,
  bookingCount: Number(row.booking_count),
  lastBookedAt: toDate(row.last_booked_at)
});

export const createRecommendationsRepository = (pool: Pool) => {
  return {
    async getPreferences(userId: string): Promise<RecommendationPreferencesRecord> {
      const result = await pool.query<Record<string, unknown>>(
        'SELECT * FROM recommendation_user_preferences WHERE user_id = $1',
        [userId]
      );

      const row = result.rows[0];
      return row ? mapPreferences(row) : emptyPreferences(userId);
    },

    async upsertPreferences(input: {
      userId: string;
      preferredDisciplines: string[];
      preferredKeywords: string[];
      preferredPublishers: string[];
      preferredResourceTypes: string[];
      preferredLocations: string[];
    }): Promise<RecommendationPreferencesRecord> {
      const result = await pool.query<Record<string, unknown>>(
        `
        INSERT INTO recommendation_user_preferences (
          user_id,
          preferred_disciplines,
          preferred_keywords,
          preferred_publishers,
          preferred_resource_types,
          preferred_locations,
          updated_at
        ) VALUES ($1,$2,$3,$4,$5,$6,NOW())
        ON CONFLICT (user_id)
        DO UPDATE
        SET preferred_disciplines = EXCLUDED.preferred_disciplines,
            preferred_keywords = EXCLUDED.preferred_keywords,
            preferred_publishers = EXCLUDED.preferred_publishers,
            preferred_resource_types = EXCLUDED.preferred_resource_types,
            preferred_locations = EXCLUDED.preferred_locations,
            updated_at = NOW()
        RETURNING *
        `,
        [
          input.userId,
          input.preferredDisciplines,
          input.preferredKeywords,
          input.preferredPublishers,
          input.preferredResourceTypes,
          input.preferredLocations
        ]
      );

      const row = result.rows[0];
      if (!row) {
        throw new Error('Failed to save recommendation preferences.');
      }

      return mapPreferences(row);
    },

    async listFeedbackByUser(userId: string): Promise<RecommendationFeedbackRecord[]> {
      const result = await pool.query<Record<string, unknown>>(
        `
        SELECT *
        FROM recommendation_feedback
        WHERE user_id = $1
        ORDER BY updated_at DESC
        `,
        [userId]
      );

      return result.rows.map(mapFeedback);
    },

    async upsertFeedback(input: {
      userId: string;
      targetType: RecommendationTargetType;
      targetId: string;
      action: RecommendationFeedbackAction;
    }): Promise<RecommendationFeedbackRecord> {
      const result = await pool.query<Record<string, unknown>>(
        `
        INSERT INTO recommendation_feedback (
          user_id,
          target_type,
          target_id,
          action,
          created_at,
          updated_at
        ) VALUES ($1,$2,$3,$4,NOW(),NOW())
        ON CONFLICT (user_id, target_type, target_id)
        DO UPDATE
        SET action = EXCLUDED.action,
            updated_at = NOW()
        RETURNING *
        `,
        [input.userId, input.targetType, input.targetId, input.action]
      );

      const row = result.rows[0];
      if (!row) {
        throw new Error('Failed to save recommendation feedback.');
      }

      return mapFeedback(row);
    },

    async listJournalCandidates(limit = 50): Promise<JournalRecommendationCandidate[]> {
      const result = await pool.query<Record<string, unknown>>(
        `
        SELECT id, title, publisher, custom_field_values, updated_at
        FROM journal_records
        WHERE is_deleted = FALSE
        ORDER BY updated_at DESC, title ASC
        LIMIT $1
        `,
        [limit]
      );

      return result.rows.map(mapJournalCandidate);
    },

    async listFundingProgramCandidates(limit = 50): Promise<FundingProgramRecommendationCandidate[]> {
      const result = await pool.query<Record<string, unknown>>(
        `
        SELECT id, title, description, period_start, period_end, submission_deadline_at, is_active, updated_at
        FROM funding_policies
        WHERE is_active = TRUE
        ORDER BY submission_deadline_at ASC, title ASC
        LIMIT $1
        `,
        [limit]
      );

      return result.rows.map(mapFundingProgramCandidate);
    },

    async listResourceCandidates(limit = 50): Promise<ResourceRecommendationCandidate[]> {
      const result = await pool.query<Record<string, unknown>>(
        `
        SELECT id, name, description, location, resource_type, capacity, timezone, is_active, updated_at
        FROM resources
        WHERE is_active = TRUE
        ORDER BY updated_at DESC, name ASC
        LIMIT $1
        `,
        [limit]
      );

      return result.rows.map(mapResourceCandidate);
    },

    async listRecentBookingSignals(userId: string, limit = 5): Promise<RecentBookingSignalRecord[]> {
      const result = await pool.query<Record<string, unknown>>(
        `
        SELECT
          b.resource_id,
          r.name AS resource_name,
          r.resource_type,
          r.location,
          COUNT(*)::int AS booking_count,
          MAX(b.ends_at) AS last_booked_at
        FROM resource_bookings b
        JOIN resources r ON r.id = b.resource_id
        WHERE b.researcher_user_id = $1
          AND b.status = 'CONFIRMED'
        GROUP BY b.resource_id, r.name, r.resource_type, r.location
        ORDER BY MAX(b.ends_at) DESC, COUNT(*) DESC, r.name ASC
        LIMIT $2
        `,
        [userId, limit]
      );

      return result.rows.map(mapRecentBookingSignal);
    },

    async recommendationTargetExists(targetType: RecommendationTargetType, targetId: string): Promise<boolean> {
      if (targetType === 'JOURNAL') {
        const result = await pool.query<{ exists: boolean }>(
          'SELECT EXISTS(SELECT 1 FROM journal_records WHERE id = $1 AND is_deleted = FALSE) AS exists',
          [targetId]
        );
        return Boolean(result.rows[0]?.exists);
      }

      if (targetType === 'FUNDING_PROGRAM') {
        const result = await pool.query<{ exists: boolean }>(
          'SELECT EXISTS(SELECT 1 FROM funding_policies WHERE id = $1 AND is_active = TRUE) AS exists',
          [targetId]
        );
        return Boolean(result.rows[0]?.exists);
      }

      const result = await pool.query<{ exists: boolean }>(
        'SELECT EXISTS(SELECT 1 FROM resources WHERE id = $1 AND is_active = TRUE) AS exists',
        [targetId]
      );
      return Boolean(result.rows[0]?.exists);
    }
  };
};
