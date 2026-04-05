<script lang="ts">
  import type { ActionData } from './$types';
  import { actionAvailability, deadlineWindowLabel, statusTone } from '$lib/researcher-ui';

  let { data, form }: { data: any; form: ActionData } = $props();
</script>

<section class="researcher-grid">
  <article class="panel">
    <h2>Recommendations</h2>
    <p>Open explainable recommendations across journals, funding programs, and resources with preference and feedback controls.</p>
    <a href="/researcher/recommendations">Open recommendations</a>
  </article>

  <article class="panel">
    <h2>Book resources</h2>
    <p>Open the dedicated booking workspace to search availability windows and reserve rooms/equipment/consultation slots.</p>
    <a href="/researcher/resources">Open resource booking</a>
  </article>

  <article class="panel">
    <h2>Create application draft</h2>
    <p>Select an active funding policy, inspect required templates, and create your working draft.</p>

    <form method="POST" action="?/createDraft" class="stacked">
      <label>
        <span>Funding policy</span>
        <select name="policyId" required>
          <option value="">Select policy</option>
          {#each data.policies as policy}
            <option value={policy.id}>{policy.title} ({policy.periodStart} to {policy.periodEnd})</option>
          {/each}
        </select>
      </label>

      <label>
        <span>Application title</span>
        <input name="title" required minlength="3" maxlength="180" />
      </label>

      <label>
        <span>Requested amount</span>
        <input name="requestedAmount" type="number" min="0" step="0.01" required />
      </label>

      <label>
        <span>Summary</span>
        <textarea name="summary" rows="3" maxlength="4000"></textarea>
      </label>

      <button type="submit">Create draft</button>
    </form>

    {#if form?.action === 'createDraft' && form?.message}
      <p class="feedback error">{form.message}</p>
    {/if}

    {#if data.policies.length === 0}
      <p class="feedback muted">No active funding policy is currently available.</p>
    {:else}
      <div class="templates">
        <h3>Required templates by policy</h3>
        {#each data.policies as policy}
          <details>
            <summary>{policy.title}</summary>
            <ul>
              {#each policy.templates as template}
                <li>
                  <strong>{template.label}</strong>
                  {#if template.isRequired}<em>required</em>{/if}
                  {#if template.instructions}
                    <div>{template.instructions}</div>
                  {/if}
                </li>
              {/each}
            </ul>
          </details>
        {/each}
      </div>
    {/if}
  </article>

  <article class="panel">
    <h2>Your applications</h2>
    <p>Track status, deadline window, and jump into versioned attachment management.</p>

    {#if data.applications.length === 0}
      <p class="feedback muted">No applications created yet.</p>
    {:else}
      <ul class="apps">
        {#each data.applications as application}
          {@const availability = actionAvailability(application.status, application.deadline)}
          <li>
            <div class="headline">
              <strong>{application.title}</strong>
              <span class={`status ${statusTone(application.status)}`}>{application.status}</span>
            </div>

            <p>{deadlineWindowLabel(application.deadline)}</p>
            <p>Requested: ${application.requestedAmount}</p>

            <div class="actions">
              <a href={`/researcher/applications/${application.id}`}>Open details</a>

              {#if application.status === 'DRAFT' || application.status === 'BLOCKED_LATE'}
                <form method="POST" action="?/submit">
                  <input type="hidden" name="applicationId" value={application.id} />
                  <button type="submit" disabled={!availability.canSubmit}>Submit</button>
                </form>
              {/if}

              {#if application.status === 'RETURNED_FOR_REVISION'}
                <form method="POST" action="?/resubmit">
                  <input type="hidden" name="applicationId" value={application.id} />
                  <button type="submit" disabled={!availability.canResubmit}>Resubmit</button>
                </form>
              {/if}
            </div>

            {#if availability.reason && ((application.status === 'DRAFT' || application.status === 'BLOCKED_LATE' || application.status === 'RETURNED_FOR_REVISION'))}
              <p class="deadline-note">{availability.reason}</p>
            {/if}

            {#if form?.applicationId === application.id && form?.message}
              <p class="feedback error">{form.message}</p>
            {/if}
          </li>
        {/each}
      </ul>
    {/if}
  </article>
</section>

<style>
  .researcher-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }
  .panel { border: 1px solid #d1d5db; border-radius: 0.8rem; padding: 1rem; background: #fff; }
  .stacked { display: grid; gap: 0.75rem; }
  label { display: grid; gap: 0.35rem; }
  input, select, textarea { border: 1px solid #9ca3af; border-radius: 0.5rem; padding: 0.5rem; }
  button { border: 0; background: #0f4c81; color: white; border-radius: 0.5rem; padding: 0.5rem 0.7rem; }
  .feedback.error { color: #991b1b; }
  .feedback.muted { color: #6b7280; }
  .templates { margin-top: 1rem; }
  .templates details { margin-bottom: 0.5rem; }
  .apps { display: grid; gap: 0.7rem; padding: 0; list-style: none; }
  .apps li { border: 1px solid #e5e7eb; border-radius: 0.7rem; padding: 0.75rem; }
  .headline { display: flex; justify-content: space-between; gap: 0.5rem; align-items: center; }
  .status { border-radius: 0.45rem; padding: 0.2rem 0.45rem; font-size: 0.8rem; }
  .status.ok { background: #dcfce7; color: #166534; }
  .status.warn { background: #fef3c7; color: #92400e; }
  .status.bad { background: #fee2e2; color: #991b1b; }
  .status.neutral { background: #e5e7eb; color: #111827; }
  .actions { display: flex; gap: 0.5rem; flex-wrap: wrap; align-items: center; }
  .deadline-note { color: #92400e; margin-top: 0.35rem; font-size: 0.9rem; }
</style>
