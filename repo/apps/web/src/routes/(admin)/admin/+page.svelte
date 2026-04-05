<script lang="ts">
  import type { ActionData } from './$types';

  let { data, form }: { data: any; form: ActionData } = $props();
</script>

<section class="admin-grid">
  <article class="panel panel-wide">
    <h2>Admin governance workspaces</h2>
    <p>
      <a href="/admin/journals">Open journal governance workspace</a>
      for master catalog CRUD, custom fields, attachment versions, and journal history.
    </p>
  </article>

  <article class="panel">
    <h2>Create funding policy</h2>
    <form method="POST" action="?/createPolicy" class="stacked">
      <label><span>Title</span><input name="title" required minlength="3" /></label>
      <label><span>Description</span><textarea name="description" rows="3"></textarea></label>
      <label><span>Policy period start</span><input name="periodStart" type="date" required /></label>
      <label><span>Policy period end</span><input name="periodEnd" type="date" required /></label>
      <label><span>Submission deadline (local)</span><input name="submissionDeadlineAt" type="datetime-local" required /></label>
      <label><span>Grace hours</span><input name="graceHours" type="number" min="0" max="168" value="24" required /></label>
      <label><span>Annual cap amount</span><input name="annualCapAmount" type="number" min="0" step="0.01" value="5000" required /></label>
      <label><span>Approval levels required</span><input name="approvalLevelsRequired" type="number" min="1" max="3" value="1" required /></label>
      <label>
        <span>Required templates (one label per line)</span>
        <textarea name="templates" rows="5" placeholder="Budget Sheet\nResearch Plan\nEthics Statement" required></textarea>
      </label>
      <button type="submit">Create policy</button>
    </form>

    {#if form?.action === 'createPolicy' && form?.message}
      <p class="error">{form.message}</p>
    {/if}
  </article>

  <article class="panel">
    <h2>Grant one-time extension</h2>
    <p>Use application UUID and extended-until timestamp for blocked-late or editable applications.</p>
    <form method="POST" action="?/grantExtension" class="stacked">
      <label><span>Application ID</span><input name="applicationId" required /></label>
      <label><span>Extended until</span><input name="extendedUntil" type="datetime-local" required /></label>
      <label><span>Reason</span><textarea name="reason" rows="3" required></textarea></label>
      <button type="submit">Grant extension</button>
    </form>

    {#if form?.action === 'grantExtension' && form?.message}
      <p class="error">{form.message}</p>
    {/if}

    {#if form?.action === 'grantExtension' && form?.ok && form?.extensionResult}
      <div class="success">
        <p><strong>Extension updated.</strong></p>
        <p>Application: {form.extensionResult.application?.id}</p>
        <p>Status: {form.extensionResult.application?.status}</p>
        <p>Deadline state: {form.extensionResult.deadline?.state}</p>
        <p>{form.extensionResult.deadline?.message}</p>
        {#if form.extensionResult.deadline?.extensionUntil}
          <p>Extended until: {new Date(form.extensionResult.deadline.extensionUntil).toLocaleString()}</p>
        {/if}
        {#if form.extensionResult.deadline?.extensionUsedAt}
          <p>Extension consumed: {new Date(form.extensionResult.deadline.extensionUsedAt).toLocaleString()}</p>
        {/if}
      </div>
    {/if}
  </article>

  <article class="panel panel-wide">
    <h2>Current policies</h2>
    {#if data.policies.length === 0}
      <p>No policies yet.</p>
    {:else}
      <ul class="policy-list">
        {#each data.policies as policy}
          <li>
            <strong>{policy.title}</strong>
            <span>{policy.periodStart} to {policy.periodEnd}</span>
            <span>Deadline: {new Date(policy.submissionDeadlineAt).toLocaleString()}</span>
            <span>Grace: {policy.graceHours}h</span>
            <span>Cap: ${policy.annualCapAmount}</span>
            <span>Approval levels: {policy.approvalLevelsRequired}</span>
            <span>Templates: {policy.templates.length}</span>
          </li>
        {/each}
      </ul>
    {/if}
  </article>

  <article class="panel panel-wide">
    <h2>Upload hold release queue</h2>
    <p>Held uploads are blocked from workflow/researcher/journal asset access until an administrator releases them.</p>

    {#if data.adminHoldsError}
      <p class="error">{data.adminHoldsError}</p>
    {/if}

    {#if form?.action === 'releaseResearcherHold' && form?.message}
      <p class="error">{form.message}</p>
    {/if}
    {#if form?.action === 'releaseResearcherHold' && form?.ok}
      <p class="success-inline">Released researcher document hold for version {form.releasedVersionId}.</p>
    {/if}

    {#if form?.action === 'releaseJournalHold' && form?.message}
      <p class="error">{form.message}</p>
    {/if}
    {#if form?.action === 'releaseJournalHold' && form?.ok}
      <p class="success-inline">Released journal attachment hold for version {form.releasedVersionId}.</p>
    {/if}

    <h3>Researcher document holds</h3>
    {#if data.researcherDocumentHolds.length === 0}
      <p>No held researcher documents.</p>
    {:else}
      <ul class="policy-list">
        {#each data.researcherDocumentHolds as hold}
          <li>
            <strong>{hold.documentLabel}</strong>
            <span>Applicant: {hold.applicantUsername}</span>
            <span>Application: {hold.applicationTitle}</span>
            <span>Key: {hold.documentKey}</span>
            <span>Scan: {hold.securityScanStatus}</span>
            {#if hold.securityFindings?.length > 0}
              <span>Findings: {hold.securityFindings.join(', ')}</span>
            {/if}
            <span>Uploaded: {new Date(hold.createdAt).toLocaleString()}</span>
            <form method="POST" action="?/releaseResearcherHold" class="inline-form">
              <input type="hidden" name="versionId" value={hold.versionId} />
              <input name="note" minlength="3" maxlength="2000" required placeholder="Release note" />
              <button type="submit">Release hold</button>
            </form>
          </li>
        {/each}
      </ul>
    {/if}

    <h3>Journal attachment holds</h3>
    {#if data.journalAttachmentHolds.length === 0}
      <p>No held journal attachments.</p>
    {:else}
      <ul class="policy-list">
        {#each data.journalAttachmentHolds as hold}
          <li>
            <strong>{hold.attachmentLabel}</strong>
            <span>Journal: {hold.journalTitle}</span>
            <span>Key: {hold.attachmentKey}</span>
            <span>Category: {hold.category}</span>
            <span>Scan: {hold.securityScanStatus}</span>
            {#if hold.securityFindings?.length > 0}
              <span>Findings: {hold.securityFindings.join(', ')}</span>
            {/if}
            <span>Uploaded: {new Date(hold.createdAt).toLocaleString()}</span>
            <form method="POST" action="?/releaseJournalHold" class="inline-form">
              <input type="hidden" name="versionId" value={hold.versionId} />
              <input name="note" minlength="3" maxlength="2000" required placeholder="Release note" />
              <button type="submit">Release hold</button>
            </form>
          </li>
        {/each}
      </ul>
    {/if}
  </article>
</section>

<style>
  .admin-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }
  .panel { border: 1px solid #d1d5db; border-radius: 0.75rem; padding: 1rem; }
  .panel-wide { grid-column: 1 / -1; }
  .stacked { display: grid; gap: 0.6rem; }
  label { display: grid; gap: 0.35rem; }
  input, textarea { border: 1px solid #9ca3af; border-radius: 0.5rem; padding: 0.45rem; }
  button { border: 0; background: #0f4c81; color: #fff; border-radius: 0.45rem; padding: 0.45rem 0.65rem; }
  .error { color: #991b1b; }
  .success { margin-top: 0.7rem; border: 1px solid #86efac; background: #f0fdf4; border-radius: 0.55rem; padding: 0.6rem; color: #14532d; }
  .success-inline { color: #166534; }
  .policy-list { list-style: none; padding: 0; display: grid; gap: 0.6rem; }
  .policy-list li { border: 1px solid #e5e7eb; border-radius: 0.6rem; padding: 0.6rem; display: grid; gap: 0.2rem; }
  .inline-form { margin-top: 0.4rem; display: flex; gap: 0.4rem; }
  .inline-form input { flex: 1; }
</style>
