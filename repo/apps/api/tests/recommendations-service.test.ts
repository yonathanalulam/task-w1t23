import { describe, expect, it, vi } from 'vitest';
import { createRecommendationsService } from '../src/modules/recommendations/service.js';

const makeRepository = () => {
  const preferences = new Map<string, any>();
  const feedback = new Map<string, any>();

  const toKey = (userId: string, targetType: string, targetId: string) => `${userId}:${targetType}:${targetId}`;

  const repository = {
    getPreferences: vi.fn(async (userId: string) =>
      preferences.get(userId) ?? {
        userId,
        preferredDisciplines: [],
        preferredKeywords: [],
        preferredPublishers: [],
        preferredResourceTypes: [],
        preferredLocations: [],
        updatedAt: new Date(0)
      }
    ),
    upsertPreferences: vi.fn(async (input: any) => {
      const saved = {
        ...input,
        updatedAt: new Date()
      };
      preferences.set(input.userId, saved);
      return saved;
    }),
    listFeedbackByUser: vi.fn(async (userId: string) =>
      [...feedback.values()].filter((entry) => entry.userId === userId)
    ),
    upsertFeedback: vi.fn(async (input: any) => {
      const id = `fb-${input.targetType}-${input.targetId}`;
      const key = toKey(input.userId, input.targetType, input.targetId);
      const existing = feedback.get(key);
      const now = new Date();
      const saved = {
        id,
        userId: input.userId,
        targetType: input.targetType,
        targetId: input.targetId,
        action: input.action,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now
      };
      feedback.set(key, saved);
      return saved;
    }),
    listJournalCandidates: vi.fn(async () => [
      {
        id: '11111111-1111-4111-8111-111111111111',
        title: 'Astrophysics Letters',
        publisher: 'Universe Press',
        customFieldValues: { discipline: 'Astrophysics' },
        updatedAt: new Date()
      }
    ]),
    listFundingProgramCandidates: vi.fn(async () => [
      {
        id: '22222222-2222-4222-8222-222222222222',
        title: 'Astronomy Field Grant',
        description: 'Funding for observational astronomy.',
        periodStart: '2026-01-01',
        periodEnd: '2026-12-31',
        submissionDeadlineAt: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000),
        isActive: true,
        updatedAt: new Date()
      }
    ]),
    listResourceCandidates: vi.fn(async () => [
      {
        id: '33333333-3333-4333-8333-333333333333',
        name: 'Observation Room',
        description: 'Room with telescope feed',
        location: 'North Wing',
        resourceType: 'ROOM',
        capacity: 8,
        timezone: 'UTC',
        isActive: true,
        updatedAt: new Date()
      }
    ]),
    recommendationTargetExists: vi.fn(async () => true)
  };

  return { repository };
};

describe('recommendations service', () => {
  it('persists and returns normalized user preferences', async () => {
    const { repository } = makeRepository();
    const service = createRecommendationsService({ repository: repository as never, audit: { write: vi.fn(async () => undefined) } });

    await service.updateResearcherPreferences({
      userId: 'researcher-1',
      preferredDisciplines: [' Astrophysics ', 'astrophysics'],
      preferredKeywords: [' Space ', 'space'],
      preferredPublishers: [' Universe Press '],
      preferredResourceTypes: ['room', 'ROOM'],
      preferredLocations: [' North Wing '],
      meta: {}
    });

    const saved = await service.getResearcherPreferences('researcher-1');
    expect(saved.preferredDisciplines).toEqual(['astrophysics']);
    expect(saved.preferredKeywords).toEqual(['space']);
    expect(saved.preferredResourceTypes).toEqual(['ROOM']);
  });

  it('persists feedback state and returns it in feedback list', async () => {
    const { repository } = makeRepository();
    const service = createRecommendationsService({ repository: repository as never, audit: { write: vi.fn(async () => undefined) } });

    await service.setResearcherFeedback({
      userId: 'researcher-1',
      targetType: 'RESOURCE',
      targetId: '33333333-3333-4333-8333-333333333333',
      action: 'LIKE',
      meta: {}
    });

    const feedback = await service.listResearcherFeedback('researcher-1');
    expect(feedback).toHaveLength(1);
    expect(feedback[0]?.action).toBe('LIKE');
  });

  it('excludes blocked items from recommendation output', async () => {
    const { repository } = makeRepository();
    const service = createRecommendationsService({ repository: repository as never, audit: { write: vi.fn(async () => undefined) } });

    await service.setResearcherFeedback({
      userId: 'researcher-1',
      targetType: 'RESOURCE',
      targetId: '33333333-3333-4333-8333-333333333333',
      action: 'BLOCK',
      meta: {}
    });

    const output = await service.listResearcherRecommendations('researcher-1');
    const hasBlockedResource = output.recommendations.some(
      (entry) => entry.targetType === 'RESOURCE' && entry.targetId === '33333333-3333-4333-8333-333333333333'
    );

    expect(hasBlockedResource).toBe(false);
  });

  it('generates plain-language explanation reasons from preferences', async () => {
    const { repository } = makeRepository();
    const service = createRecommendationsService({ repository: repository as never, audit: { write: vi.fn(async () => undefined) } });

    await service.updateResearcherPreferences({
      userId: 'researcher-1',
      preferredDisciplines: ['astrophysics'],
      preferredKeywords: ['astro'],
      preferredPublishers: ['universe'],
      preferredResourceTypes: ['ROOM'],
      preferredLocations: ['north'],
      meta: {}
    });

    const output = await service.listResearcherRecommendations('researcher-1');
    const journal = output.recommendations.find((entry) => entry.targetType === 'JOURNAL');

    expect(journal?.reasons.some((reason) => reason.includes('Contains your keyword'))).toBe(true);
    expect(journal?.reasons.some((reason) => reason.includes('Matches preferred publisher'))).toBe(true);
  });
});
