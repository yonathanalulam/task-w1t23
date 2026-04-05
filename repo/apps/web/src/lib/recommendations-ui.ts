export type RecommendationFeedbackAction = 'LIKE' | 'NOT_INTERESTED' | 'BLOCK' | null;

export const recommendationTypeLabel = (targetType: string): string => {
  if (targetType === 'JOURNAL') return 'Journal';
  if (targetType === 'FUNDING_PROGRAM') return 'Funding program';
  return 'Resource';
};

export const feedbackButtonDisabled = (currentAction: RecommendationFeedbackAction, desiredAction: Exclude<RecommendationFeedbackAction, null>): boolean => {
  return currentAction === desiredAction;
};

export const feedbackTone = (action: RecommendationFeedbackAction): 'liked' | 'muted' | 'blocked' | 'none' => {
  if (action === 'LIKE') return 'liked';
  if (action === 'NOT_INTERESTED') return 'muted';
  if (action === 'BLOCK') return 'blocked';
  return 'none';
};

export const parsePreferenceText = (value: string): string[] => {
  return value
    .split(/\n|,/)
    .map((entry) => entry.trim())
    .filter(Boolean);
};
