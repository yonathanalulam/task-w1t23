export const recommendationTargetTypes = ['JOURNAL', 'FUNDING_PROGRAM', 'RESOURCE'] as const;
export type RecommendationTargetType = (typeof recommendationTargetTypes)[number];

export const recommendationFeedbackActions = ['LIKE', 'NOT_INTERESTED', 'BLOCK'] as const;
export type RecommendationFeedbackAction = (typeof recommendationFeedbackActions)[number];

export interface RecommendationPreferencesRecord {
  userId: string;
  preferredDisciplines: string[];
  preferredKeywords: string[];
  preferredPublishers: string[];
  preferredResourceTypes: string[];
  preferredLocations: string[];
  updatedAt: Date;
}

export interface RecommendationFeedbackRecord {
  id: string;
  userId: string;
  targetType: RecommendationTargetType;
  targetId: string;
  action: RecommendationFeedbackAction;
  createdAt: Date;
  updatedAt: Date;
}

export interface JournalRecommendationCandidate {
  id: string;
  title: string;
  publisher: string | null;
  customFieldValues: Record<string, unknown>;
  updatedAt: Date;
}

export interface FundingProgramRecommendationCandidate {
  id: string;
  title: string;
  description: string | null;
  periodStart: string;
  periodEnd: string;
  submissionDeadlineAt: Date;
  isActive: boolean;
  updatedAt: Date;
}

export interface ResourceRecommendationCandidate {
  id: string;
  name: string;
  description: string | null;
  location: string | null;
  resourceType: 'ROOM' | 'EQUIPMENT' | 'CONSULTATION';
  capacity: number;
  timezone: string;
  isActive: boolean;
  updatedAt: Date;
}

export interface RecentBookingSignalRecord {
  resourceId: string;
  resourceName: string;
  resourceType: 'ROOM' | 'EQUIPMENT' | 'CONSULTATION';
  location: string | null;
  bookingCount: number;
  lastBookedAt: Date;
}

export interface RecommendationItem {
  targetType: RecommendationTargetType;
  targetId: string;
  title: string;
  subtitle: string;
  score: number;
  reasons: string[];
  feedbackAction: RecommendationFeedbackAction | null;
}
