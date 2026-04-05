<script lang="ts">
  import type { ActionData } from './$types';
  import { feedbackButtonDisabled, feedbackTone, recommendationTypeLabel } from '$lib/recommendations-ui';

  let { data, form }: { data: any; form: ActionData } = $props();

  const selectedResourceTypes = $derived(new Set<string>(data.preferences?.preferredResourceTypes ?? []));
</script>

<section class="recommendations-shell">
  <article class="panel">
    <h2>Recommendation preferences</h2>
    <p>Use explicit preference controls to tune recommendations. Scoring is deterministic and reasons are shown per item.</p>

    <form method="POST" action="?/updatePreferences" class="stacked">
      <label>
        <span>Preferred disciplines (one per line)</span>
        <textarea name="preferredDisciplines" rows="3">{data.preferenceText?.preferredDisciplines ?? ''}</textarea>
      </label>

      <label>
        <span>Preferred keywords (one per line)</span>
        <textarea name="preferredKeywords" rows="3">{data.preferenceText?.preferredKeywords ?? ''}</textarea>
      </label>

      <label>
        <span>Preferred publishers (one per line)</span>
        <textarea name="preferredPublishers" rows="3">{data.preferenceText?.preferredPublishers ?? ''}</textarea>
      </label>

      <fieldset>
        <legend>Preferred resource types</legend>
        <label class="checkbox"><input type="checkbox" name="preferredResourceTypes" value="ROOM" checked={selectedResourceTypes.has('ROOM')} /> ROOM</label>
        <label class="checkbox"><input type="checkbox" name="preferredResourceTypes" value="EQUIPMENT" checked={selectedResourceTypes.has('EQUIPMENT')} /> EQUIPMENT</label>
        <label class="checkbox"><input type="checkbox" name="preferredResourceTypes" value="CONSULTATION" checked={selectedResourceTypes.has('CONSULTATION')} /> CONSULTATION</label>
      </fieldset>

      <label>
        <span>Preferred locations (one per line)</span>
        <textarea name="preferredLocations" rows="3">{data.preferenceText?.preferredLocations ?? ''}</textarea>
      </label>

      <button type="submit">Save preferences</button>
    </form>

    {#if form?.action === 'updatePreferences' && form?.message}
      <p class="error">{form.message}</p>
    {/if}
    {#if form?.action === 'updatePreferences' && form?.ok}
      <p class="ok">Preferences saved.</p>
    {/if}
  </article>

  <article class="panel">
    <h2>Recommended now</h2>

    {#if data.recommendations.length === 0}
      <p class="muted">No recommendations yet. Add preferences or ensure source catalog data exists.</p>
    {:else}
      <ul class="recommendation-list">
        {#each data.recommendations as recommendation}
          <li data-target-type={recommendation.targetType} data-target-id={recommendation.targetId}>
            <div class="headline">
              <strong>{recommendation.title}</strong>
              <span class="score">Score {recommendation.score}</span>
            </div>
            <p class="meta">{recommendationTypeLabel(recommendation.targetType)} · {recommendation.subtitle}</p>

            <ul class="reasons">
              {#each recommendation.reasons as reason}
                <li>{reason}</li>
              {/each}
            </ul>

            <div class={`feedback-state ${feedbackTone(recommendation.feedbackAction)}`}>
              Current feedback: {recommendation.feedbackAction ?? 'none'}
            </div>

            <div class="actions">
              <form method="POST" action="?/setFeedback">
                <input type="hidden" name="targetType" value={recommendation.targetType} />
                <input type="hidden" name="targetId" value={recommendation.targetId} />
                <input type="hidden" name="action" value="LIKE" />
                <button type="submit" disabled={feedbackButtonDisabled(recommendation.feedbackAction, 'LIKE')}>Like</button>
              </form>

              <form method="POST" action="?/setFeedback">
                <input type="hidden" name="targetType" value={recommendation.targetType} />
                <input type="hidden" name="targetId" value={recommendation.targetId} />
                <input type="hidden" name="action" value="NOT_INTERESTED" />
                <button type="submit" disabled={feedbackButtonDisabled(recommendation.feedbackAction, 'NOT_INTERESTED')}>Not interested</button>
              </form>

              <form method="POST" action="?/setFeedback">
                <input type="hidden" name="targetType" value={recommendation.targetType} />
                <input type="hidden" name="targetId" value={recommendation.targetId} />
                <input type="hidden" name="action" value="BLOCK" />
                <button type="submit" class="danger" disabled={feedbackButtonDisabled(recommendation.feedbackAction, 'BLOCK')}>Block</button>
              </form>
            </div>

            {#if form?.action === 'setFeedback' && form?.targetType === recommendation.targetType && form?.targetId === recommendation.targetId && form?.message}
              <p class="error">{form.message}</p>
            {/if}
          </li>
        {/each}
      </ul>
    {/if}
  </article>
</section>

<style>
  .recommendations-shell { display: grid; gap: 1rem; }
  .panel { border: 1px solid #d1d5db; border-radius: 0.75rem; padding: 0.95rem; }
  .stacked { display: grid; gap: 0.6rem; }
  label { display: grid; gap: 0.35rem; }
  textarea { border: 1px solid #9ca3af; border-radius: 0.45rem; padding: 0.5rem; }
  fieldset { border: 1px solid #d1d5db; border-radius: 0.55rem; padding: 0.5rem 0.65rem; display: grid; gap: 0.35rem; }
  .checkbox { display: flex; gap: 0.45rem; align-items: center; }
  button { border: 0; background: #0f4c81; color: #fff; border-radius: 0.45rem; padding: 0.45rem 0.65rem; }
  .danger { background: #b91c1c; }
  .recommendation-list { list-style: none; padding: 0; display: grid; gap: 0.7rem; }
  .recommendation-list li { border: 1px solid #e5e7eb; border-radius: 0.6rem; padding: 0.7rem; }
  .headline { display: flex; justify-content: space-between; align-items: center; gap: 0.6rem; }
  .meta { color: #374151; }
  .score { font-size: 0.84rem; color: #1d4ed8; font-weight: 600; }
  .reasons { margin: 0.35rem 0; padding-left: 1.15rem; display: grid; gap: 0.2rem; }
  .feedback-state { font-size: 0.86rem; margin-bottom: 0.45rem; }
  .feedback-state.liked { color: #166534; }
  .feedback-state.muted { color: #92400e; }
  .feedback-state.blocked { color: #991b1b; }
  .actions { display: flex; gap: 0.45rem; flex-wrap: wrap; }
  .error { color: #991b1b; }
  .ok { color: #166534; }
  .muted { color: #6b7280; }
</style>
