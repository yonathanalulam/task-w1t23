<script lang="ts">
  import type { ActionData } from './$types';
  import { approvalProgressLabel, approverSignOffAllowed } from '$lib/workflow-ui';

  let { data, form }: { data: any; form: ActionData } = $props();
</script>

{#if data.notFound}
  <p>Application not available for approver sign-off.</p>
{:else}
  <section class="detail">
    <header>
      <h2>{data.application.title}</h2>
      <p>Status: <strong>{data.application.status}</strong></p>
      <p>Applicant: {data.application.applicantUsername}</p>
      <p>Policy: {data.application.policyTitle}</p>
      <p>Requested: ${data.application.requestedAmount}</p>
      <p>
        {approvalProgressLabel(data.workflowState?.nextApprovalLevel ?? null, data.workflowState?.requiredApprovalLevels ?? data.application.approvalLevelsRequired)}
      </p>
    </header>

    <article class="panel">
      <h3>Eligibility context</h3>
      {#if !data.latestEligibility}
        <p class="muted">No reviewer eligibility result recorded.</p>
      {:else}
        <p>
          Reviewer eligibility:
          <strong class={data.latestEligibility.eligible ? 'ok' : 'bad'}>{data.latestEligibility.eligible ? 'Eligible' : 'Not eligible'}</strong>
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
                  <p class="bad">Held for administrator release. Sign-off should wait until hold is released.</p>
                {:else}
                  <p>
                    {#if document.latestIsPreviewable}
                      <a href={`/workflow-assets/approver/${data.application.id}/${document.id}/preview`} target="_blank">Preview</a>
                      ·
                    {/if}
                    <a href={`/workflow-assets/approver/${data.application.id}/${document.id}/download?watermark=true`} target="_blank">
                      Download (watermarked)
                    </a>
                  </p>
                {/if}
              {:else if document.latestStorageType === 'LINK'}
                <a href={`/workflow-assets/approver/${data.application.id}/${document.id}/download`} target="_blank">Open link metadata</a>
              {:else}
                <span> · no active version</span>
              {/if}
            </li>
          {/each}
        </ul>
      {/if}
    </article>

    <article class="panel">
      <h3>Approver sign-off</h3>
      {#if approverSignOffAllowed(data.application.status, data.workflowState?.nextApprovalLevel ?? null)}
        <form method="POST" action="?/signOff" class="stacked">
          <label>
            <span>Decision</span>
            <select name="decision" required>
              <option value="approve">Approve current level</option>
              <option value="reject">Reject application</option>
            </select>
          </label>
          <label>
            <span>Required comment</span>
            <textarea name="comment" rows="4" minlength="3" maxlength="4000" required></textarea>
          </label>
          <button type="submit">Record sign-off</button>
        </form>
      {:else}
        <p class="muted">No pending approval level is currently available for sign-off.</p>
      {/if}

      {#if form?.action === 'signOff' && form?.message}
        <p class="bad">{form.message}</p>
      {/if}
      {#if form?.action === 'signOff' && form?.ok}
        <p class="ok">Sign-off recorded.</p>
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
