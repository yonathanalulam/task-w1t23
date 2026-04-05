<script lang="ts">
  import type { ActionData } from './$types';
  import { actionAvailability, deadlineWindowLabel } from '$lib/researcher-ui';

  let { data, form }: { data: any; form: ActionData } = $props();
</script>

{#if data.notFound}
  <p>Application not found.</p>
{:else}
  {@const availability = actionAvailability(data.application.status, data.deadline)}
  <section class="application-detail">
    <header>
      <h2>{data.application.title}</h2>
      <p>Status: <strong>{data.application.status}</strong></p>
      <p>{deadlineWindowLabel(data.deadline)}</p>
      <p class="deadline-message">{data.deadline?.message}</p>
      <p>Requested amount: ${data.application.requestedAmount}</p>

      <div class="submission-actions">
        {#if data.application.status === 'DRAFT' || data.application.status === 'BLOCKED_LATE'}
          <form method="POST" action="?/submit"><button type="submit" disabled={!availability.canSubmit}>Submit</button></form>
        {/if}
        {#if data.application.status === 'RETURNED_FOR_REVISION'}
          <form method="POST" action="?/resubmit"><button type="submit" disabled={!availability.canResubmit}>Resubmit</button></form>
        {/if}
      </div>

      {#if availability.reason && (data.application.status === 'DRAFT' || data.application.status === 'BLOCKED_LATE' || data.application.status === 'RETURNED_FOR_REVISION')}
        <p class="deadline-message blocked">{availability.reason}</p>
      {/if}

      {#if form?.message && (form?.action === 'submit' || form?.action === 'resubmit')}
        <p class="error">{form.message}</p>
      {/if}
    </header>

    <article class="panel">
      <h3>Upload file version</h3>
      <p class="hint">Uploads are scanned server-side. Files with sensitive patterns or suspicious archives may be held for administrator review.</p>
      <form method="POST" action="?/uploadFile" enctype="multipart/form-data" class="stacked">
        <label>
          <span>Document key</span>
          <input name="documentKey" required />
        </label>
        <label>
          <span>Label</span>
          <input name="label" required />
        </label>
        <label>
          <span>File</span>
          <input type="file" name="file" required />
        </label>
        <button type="submit">Upload new version</button>
      </form>
    </article>

    <article class="panel">
      <h3>Add link version</h3>
      <form method="POST" action="?/addLink" class="stacked">
        <label><span>Document key</span><input name="documentKey" required /></label>
        <label><span>Label</span><input name="label" required /></label>
        <label><span>External URL</span><input name="externalUrl" type="url" required /></label>
        <button type="submit">Add link version</button>
      </form>
      {#if form?.message && (form?.action === 'uploadFile' || form?.action === 'addLink')}
        <p class="error">{form.message}</p>
      {/if}
    </article>

    <article class="panel">
      <h3>Documents and versions</h3>
      {#if data.documents.length === 0}
        <p>No attachments yet.</p>
      {:else}
        {#each data.documents as document}
          <div class="document-block">
            <h4>{document.label}</h4>
            <p>Key: {document.documentKey}</p>

            {#if document.latestStorageType === 'FILE'}
              <p>
                Security: <strong>{document.latestSecurityScanStatus ?? 'n/a'}</strong>
                {#if document.latestAdminReviewRequired}
                  · <span class="warn">Held for admin review</span>
                {/if}
              </p>
              <p>
                {#if document.latestIsPreviewable}
                  <a href={`/researcher-assets/${data.application.id}/${document.id}/preview`} target="_blank">Preview active version</a>
                {:else}
                  Preview unavailable (only PDF/images)
                {/if}
                ·
                <a href={`/researcher-assets/${data.application.id}/${document.id}/download?watermark=true`} target="_blank">
                  Download (watermarked)
                </a>
              </p>
            {:else if document.latestStorageType === 'LINK'}
              <p>
                External link:
                <a href={document.latestExternalUrl} target="_blank" rel="noreferrer">{document.latestExternalUrl}</a>
              </p>
            {/if}

            <ul>
              {#each data.versionsByDocument[document.id] ?? [] as version}
                <li>
                  <span>v{version.versionNumber} · {version.storageType} · {new Date(version.createdAt).toLocaleString()}</span>
                  {#if version.storageType === 'FILE'}
                    <span> · scan={version.securityScanStatus}</span>
                    {#if version.isAdminReviewRequired}
                      <span class="warn"> · held</span>
                    {/if}
                  {/if}
                  {#if document.latestVersionId !== version.id}
                    <form method="POST" action="?/rollback" class="inline-form">
                      <input type="hidden" name="documentId" value={document.id} />
                      <input type="hidden" name="versionId" value={version.id} />
                      <button type="submit">Rollback to this version</button>
                    </form>
                  {:else}
                    <strong>(active)</strong>
                  {/if}
                </li>
              {/each}
            </ul>
          </div>
        {/each}
      {/if}

      {#if form?.action === 'rollback' && form?.message}
        <p class="error">{form.message}</p>
      {/if}
    </article>
  </section>
{/if}

<style>
  .application-detail { display: grid; gap: 1rem; }
  .panel { border: 1px solid #d1d5db; border-radius: 0.75rem; padding: 0.9rem; }
  .stacked { display: grid; gap: 0.6rem; }
  input { border: 1px solid #9ca3af; border-radius: 0.45rem; padding: 0.45rem; }
  button { border: 0; border-radius: 0.45rem; background: #0f4c81; color: #fff; padding: 0.45rem 0.6rem; }
  .submission-actions { display: flex; gap: 0.45rem; }
  .document-block { border-top: 1px solid #e5e7eb; padding-top: 0.7rem; margin-top: 0.7rem; }
  .inline-form { display: inline; margin-left: 0.4rem; }
  .error { color: #991b1b; }
  .deadline-message { color: #374151; margin: 0.2rem 0; }
  .deadline-message.blocked { color: #92400e; }
  .hint { color: #4b5563; }
  .warn { color: #92400e; }
</style>
