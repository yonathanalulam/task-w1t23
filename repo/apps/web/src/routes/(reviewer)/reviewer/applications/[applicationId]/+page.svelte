<script lang="ts">
  import type { ActionData } from './$types';
  import { reviewerDecisionAllowed } from '$lib/workflow-ui';

  let { data, form }: { data: any; form: ActionData } = $props();
</script>

{#if data.notFound}
  <p>Application not available in reviewer workflow scope.</p>
{:else}
  <section class="detail">
    <header>
      <h2>{data.application.title}</h2>
      <p>Status: <strong>{data.application.status}</strong></p>
      <p>Applicant: {data.application.applicantUsername}</p>
      <p>Policy: {data.application.policyTitle}</p>
      <p>Requested: ${data.application.requestedAmount}</p>
      <p>Approval levels required: {data.application.approvalLevelsRequired}</p>
    </header>

    <article class="panel">
      <h3>Eligibility checks (latest reviewer evaluation)</h3>
      {#if !data.latestEligibility}
        <p class="muted">No reviewer eligibility evaluation recorded yet.</p>
      {:else}
        <p>
          Overall:
          <strong class={data.latestEligibility.eligible ? 'ok' : 'bad'}>{data.latestEligibility.eligible ? 'Eligible' : 'Not eligible'}</strong>
          · Evaluated at {new Date(data.latestEligibility.evaluatedAt).toLocaleString()}
        </p>
        <ul>
          {#each data.latestEligibility.checks as check}
            <li>
              <strong class={check.passed ? 'ok' : 'bad'}>{check.key}</strong>
              <span>{check.reason}</span>
            </li>
          {/each}
        </ul>
      {/if}
    </article>

    <article class="panel">
      <h3>Submitted materials</h3>
      {#if data.documents.length === 0}
        <p class="muted">No submitted materials available.</p>
      {:else}
        <ul>
          {#each data.documents as document}
            <li>
              <strong>{document.label}</strong>
              <span> · key: {document.documentKey}</span>
              {#if document.latestStorageType === 'FILE'}
                <span> · scan: {document.latestSecurityScanStatus ?? 'n/a'}</span>
                {#if document.latestAdminReviewRequired || document.latestSecurityScanStatus === 'HELD'}
                  <p class="bad">Held for administrator release. Review/approval actions should wait until hold is released.</p>
                {:else}
                  <p>
                    {#if document.latestIsPreviewable}
                      <a href={`/workflow-assets/reviewer/${data.application.id}/${document.id}/preview`} target="_blank">Preview</a>
                      ·
                    {/if}
                    <a href={`/workflow-assets/reviewer/${data.application.id}/${document.id}/download?watermark=true`} target="_blank">
                      Download (watermarked)
                    </a>
                  </p>
                {/if}
              {:else if document.latestStorageType === 'LINK'}
                <a href={`/workflow-assets/reviewer/${data.application.id}/${document.id}/download`} target="_blank">Open link metadata</a>
              {:else}
                <span> · no active version</span>
              {/if}
            </li>
          {/each}
        </ul>
      {/if}
    </article>

    <article class="panel">
      <h3>Reviewer decision</h3>
      {#if reviewerDecisionAllowed(data.application.status)}
        <form method="POST" action="?/decide" class="stacked">
          <label>
            <span>Decision</span>
            <select name="decision" required>
              <option value="forward_to_approval">Forward to approval</option>
              <option value="return_for_revision">Return for revision</option>
              <option value="reject">Reject</option>
            </select>
          </label>
          <label>
            <span>Required comment</span>
            <textarea name="comment" rows="4" minlength="3" maxlength="4000" required></textarea>
          </label>
          <button type="submit">Record reviewer decision</button>
        </form>
      {:else}
        <p class="muted">Reviewer decision is only available while the application is in a submitted state.</p>
      {/if}

      {#if form?.action === 'decide' && form?.message}
        <p class="bad">{form.message}</p>
      {/if}
      {#if form?.action === 'decide' && form?.ok}
        <p class="ok">Reviewer decision saved.</p>
      {/if}
    </article>

    <article class="panel">
      <h3>Review and approval audit trail</h3>
      {#if data.reviewActions.length === 0}
        <p class="muted">No actions recorded yet.</p>
      {:else}
        <ol>
          {#each data.reviewActions as action}
            <li>
              <strong>{action.decision}</strong>
              <span> · role: {action.actorRole}</span>
              {#if action.approvalLevel > 0}
                <span> · level: {action.approvalLevel}</span>
              {/if}
              <span> · by {action.actorUsername ?? action.actorUserId}</span>
              <span> · {new Date(action.createdAt).toLocaleString()}</span>
              <p>{action.comment}</p>
            </li>
          {/each}
        </ol>
      {/if}
    </article>
  </section>
{/if}

<style>
  .detail { display: grid; gap: 0.9rem; }
  .panel { border: 1px solid #d1d5db; border-radius: 0.75rem; padding: 0.85rem; }
  .stacked { display: grid; gap: 0.65rem; }
  label { display: grid; gap: 0.35rem; }
  select, textarea, button { border-radius: 0.5rem; padding: 0.5rem; }
  select, textarea { border: 1px solid #9ca3af; }
  button { border: 0; background: #0f4c81; color: #fff; }
  .ok { color: #166534; }
  .bad { color: #991b1b; }
  .muted { color: #6b7280; }
  ol { margin: 0; padding-left: 1.1rem; display: grid; gap: 0.7rem; }
</style>
