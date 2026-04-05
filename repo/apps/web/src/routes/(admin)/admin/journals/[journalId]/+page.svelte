<script lang="ts">
  import type { ActionData } from './$types';

  let { data, form }: { data: any; form: ActionData } = $props();

  const activeFields = $derived((data.customFields ?? []).filter((field: any) => field.isActive));
</script>

{#if data.notFound}
  <p>Journal record was not found.</p>
{:else}
  <section class="journal-detail">
    <header>
      <h2>{data.journal.title}</h2>
      <p>Status: <strong class={data.journal.isDeleted ? 'deleted' : 'active'}>{data.journal.isDeleted ? 'DELETED' : 'ACTIVE'}</strong></p>
      <p>Current version: {data.journal.currentVersionNumber}</p>
    </header>

    <article class="panel">
      <h3>Update journal master data</h3>
      <form method="POST" action="?/updateJournal" class="stacked">
        <label><span>Title</span><input name="title" required value={data.journal.title} /></label>
        <label><span>ISSN</span><input name="issn" value={data.journal.issn ?? ''} /></label>
        <label><span>Publisher</span><input name="publisher" value={data.journal.publisher ?? ''} /></label>

        {#if activeFields.length > 0}
          <h4>Custom field values</h4>
          {#each activeFields as field}
            {@const key = `cf_${field.fieldKey}`}
            {@const currentValue = data.journal.customFieldValues?.[field.fieldKey]}
            <label>
              <span>{field.label} ({field.fieldKey}) {field.isRequired ? '*' : ''}</span>
              {#if field.fieldType === 'BOOLEAN'}
                <input type="checkbox" name={key} value="true" checked={currentValue === true} />
              {:else if field.fieldType === 'SELECT'}
                <select name={key} value={String(currentValue ?? '')}>
                  <option value="">Select option</option>
                  {#each field.options ?? [] as option}
                    <option value={option}>{option}</option>
                  {/each}
                </select>
              {:else if field.fieldType === 'DATE'}
                <input type="date" name={key} value={String(currentValue ?? '')} />
              {:else if field.fieldType === 'NUMBER'}
                <input type="number" step="0.01" name={key} value={String(currentValue ?? '')} />
              {:else if field.fieldType === 'URL'}
                <input type="url" name={key} value={String(currentValue ?? '')} />
              {:else}
                <input name={key} value={String(currentValue ?? '')} />
              {/if}
              {#if field.helpText}<small>{field.helpText}</small>{/if}
            </label>
          {/each}
        {/if}

        <label><span>Change comment</span><textarea name="changeComment" rows="3"></textarea></label>
        <button type="submit" disabled={data.journal.isDeleted}>Update journal</button>
      </form>

      {#if form?.action === 'updateJournal' && form?.message}
        <p class="error">{form.message}</p>
      {/if}
      {#if form?.action === 'updateJournal' && form?.ok}
        <p class="ok">Journal updated.</p>
      {/if}
    </article>

    <article class="panel">
      <h3>Delete journal (soft delete)</h3>
      <form method="POST" action="?/deleteJournal" class="stacked">
        <label><span>Deletion comment</span><textarea name="changeComment" rows="3"></textarea></label>
        <button type="submit" class="danger" disabled={data.journal.isDeleted}>Mark as deleted</button>
      </form>
      {#if form?.action === 'deleteJournal' && form?.message}
        <p class="error">{form.message}</p>
      {/if}
      {#if form?.action === 'deleteJournal' && form?.ok}
        <p class="ok">Journal marked deleted.</p>
      {/if}
    </article>

    <div class="attachment-grid">
      <article class="panel">
        <h3>Add link attachment</h3>
        <form method="POST" action="?/addLinkAttachment" class="stacked">
          <label><span>Attachment key</span><input name="attachmentKey" required placeholder="contract_2026" /></label>
          <label><span>Label</span><input name="label" required /></label>
          <label>
            <span>Category</span>
            <select name="category" required>
              <option value="CONTRACT">CONTRACT</option>
              <option value="QUOTE">QUOTE</option>
              <option value="SAMPLE_ISSUE">SAMPLE_ISSUE</option>
              <option value="OTHER">OTHER</option>
            </select>
          </label>
          <label><span>External URL</span><input name="externalUrl" type="url" required /></label>
          <label><span>Notes</span><textarea name="notes" rows="3"></textarea></label>
          <button type="submit" disabled={data.journal.isDeleted}>Add link version</button>
        </form>

        {#if form?.action === 'addLinkAttachment' && form?.message}
          <p class="error">{form.message}</p>
        {/if}
      </article>

      <article class="panel">
        <h3>Upload file attachment</h3>
        <p class="muted">File uploads are scanned server-side. Sensitive pattern matches and suspicious archives are marked for admin follow-up.</p>
        <form method="POST" action="?/uploadFileAttachment" enctype="multipart/form-data" class="stacked">
          <label><span>Attachment key</span><input name="attachmentKey" required placeholder="sample_issue" /></label>
          <label><span>Label</span><input name="label" required /></label>
          <label>
            <span>Category</span>
            <select name="category" required>
              <option value="CONTRACT">CONTRACT</option>
              <option value="QUOTE">QUOTE</option>
              <option value="SAMPLE_ISSUE">SAMPLE_ISSUE</option>
              <option value="OTHER">OTHER</option>
            </select>
          </label>
          <label><span>File</span><input type="file" name="file" required /></label>
          <label><span>Notes</span><textarea name="notes" rows="3"></textarea></label>
          <button type="submit" disabled={data.journal.isDeleted}>Upload file version</button>
        </form>

        {#if form?.action === 'uploadFileAttachment' && form?.message}
          <p class="error">{form.message}</p>
        {/if}
      </article>
    </div>

    <article class="panel">
      <h3>Attachment history</h3>
      {#if data.attachments.length === 0}
        <p class="muted">No attachments yet.</p>
      {:else}
        {#each data.attachments as attachment}
          <div class="attachment-block">
            <h4>{attachment.label} ({attachment.attachmentKey})</h4>
            <p>Category: {attachment.category}</p>
            <p>
              Active version: {attachment.currentVersionNumber ?? 'none'}
              {#if attachment.currentSecurityScanStatus}
                · scan={attachment.currentSecurityScanStatus}
              {/if}
              {#if attachment.currentAdminReviewRequired}
                · <span class="hold">held for review</span>
              {/if}
              {#if attachment.currentVersionId}
                · <a href={`/journal-assets/${data.journal.id}/${attachment.id}/download?watermark=true`} target="_blank">Download / Open</a>
              {/if}
            </p>

            <ul>
              {#each data.versionsByAttachment[attachment.id] ?? [] as version}
                <li>
                  <span>v{version.versionNumber} · {version.storageType} · {new Date(version.createdAt).toLocaleString()}</span>
                  {#if version.storageType === 'LINK'}
                    <span> · <a href={version.externalUrl} target="_blank" rel="noreferrer">{version.externalUrl}</a></span>
                  {:else}
                    <span> · {version.fileName}</span>
                    <span> · scan={version.securityScanStatus}</span>
                    {#if version.isAdminReviewRequired}
                      <span class="hold"> · held</span>
                    {/if}
                  {/if}
                </li>
              {/each}
            </ul>
          </div>
        {/each}
      {/if}
    </article>

    <article class="panel">
      <h3>Journal version history</h3>
      {#if data.history.length === 0}
        <p class="muted">No history entries found.</p>
      {:else}
        <ol>
          {#each data.history as row}
            <li>
              <strong>v{row.versionNumber}</strong>
              <span> · {row.changeType}</span>
              <span> · {new Date(row.createdAt).toLocaleString()}</span>
              {#if row.changeComment}
                <p>{row.changeComment}</p>
              {/if}
            </li>
          {/each}
        </ol>
      {/if}
    </article>
  </section>
{/if}

<style>
  .journal-detail { display: grid; gap: 1rem; }
  .panel { border: 1px solid #d1d5db; border-radius: 0.75rem; padding: 0.9rem; }
  .stacked { display: grid; gap: 0.55rem; }
  label { display: grid; gap: 0.3rem; }
  input, select, textarea { border: 1px solid #9ca3af; border-radius: 0.45rem; padding: 0.45rem; }
  button { border: 0; background: #0f4c81; color: #fff; border-radius: 0.45rem; padding: 0.45rem 0.65rem; }
  .danger { background: #b91c1c; }
  .error { color: #991b1b; }
  .ok { color: #166534; }
  .muted { color: #6b7280; }
  .hold { color: #92400e; }
  .active { color: #166534; }
  .deleted { color: #991b1b; }
  .attachment-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }
  .attachment-block { border-top: 1px solid #e5e7eb; padding-top: 0.6rem; margin-top: 0.6rem; }
  ul, ol { display: grid; gap: 0.45rem; }
</style>
