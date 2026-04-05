<script lang="ts">
  import type { ActionData } from './$types';
  import { fieldTypeRequiresOptions, journalStateLabel, journalStateTone } from '$lib/journal-ui';

  let { data, form }: { data: any; form: ActionData } = $props();

  const activeFields = $derived((data.fields ?? []).filter((field: any) => field.isActive));
</script>

<section class="journal-governance">
  <header>
    <h2>Journal governance administration</h2>
    <p>Define custom metadata fields, create journal records, and review governance history from admin-only surfaces.</p>
  </header>

  <div class="grid">
    <article class="panel">
      <h3>Create custom field definition</h3>
      <form method="POST" action="?/createCustomField" class="stacked">
        <label><span>Field key</span><input name="fieldKey" required placeholder="discipline" /></label>
        <label><span>Label</span><input name="label" required placeholder="Discipline" /></label>
        <label>
          <span>Field type</span>
          <select name="fieldType" required>
            <option value="TEXT">TEXT</option>
            <option value="NUMBER">NUMBER</option>
            <option value="DATE">DATE</option>
            <option value="URL">URL</option>
            <option value="BOOLEAN">BOOLEAN</option>
            <option value="SELECT">SELECT</option>
          </select>
        </label>
        <label><span>Options (one per line for SELECT)</span><textarea name="options" rows="4"></textarea></label>
        <label><span>Help text</span><textarea name="helpText" rows="3"></textarea></label>
        <label class="checkbox"><input type="checkbox" name="isRequired" /> Required field</label>
        <button type="submit">Create custom field</button>
      </form>

      {#if form?.action === 'createCustomField' && form?.message}
        <p class="error">{form.message}</p>
      {/if}
    </article>

    <article class="panel">
      <h3>Create journal record</h3>
      <form method="POST" action="?/createJournal" class="stacked">
        <label><span>Title</span><input name="title" required /></label>
        <label><span>ISSN</span><input name="issn" placeholder="1234-5678" /></label>
        <label><span>Publisher</span><input name="publisher" /></label>

        {#if activeFields.length > 0}
          <h4>Custom field values</h4>
          {#each activeFields as field}
            {@const key = `cf_${field.fieldKey}`}
            <label>
              <span>{field.label} ({field.fieldKey}) {field.isRequired ? '*' : ''}</span>
              {#if field.fieldType === 'BOOLEAN'}
                <input type="checkbox" name={key} value="true" />
              {:else if field.fieldType === 'SELECT'}
                <select name={key}>
                  <option value="">Select option</option>
                  {#each field.options ?? [] as option}
                    <option value={option}>{option}</option>
                  {/each}
                </select>
              {:else if field.fieldType === 'DATE'}
                <input type="date" name={key} />
              {:else if field.fieldType === 'NUMBER'}
                <input type="number" step="0.01" name={key} />
              {:else if field.fieldType === 'URL'}
                <input type="url" name={key} placeholder="https://example.org" />
              {:else}
                <input name={key} />
              {/if}
              {#if field.helpText}<small>{field.helpText}</small>{/if}
            </label>
          {/each}
        {/if}

        <label><span>Change comment (optional)</span><textarea name="changeComment" rows="3"></textarea></label>
        <button type="submit">Create journal</button>
      </form>

      {#if form?.action === 'createJournal' && form?.message}
        <p class="error">{form.message}</p>
      {/if}
    </article>
  </div>

  <article class="panel">
    <h3>Custom field definitions</h3>
    {#if data.fields.length === 0}
      <p class="muted">No custom fields defined yet.</p>
    {:else}
      <ul class="field-list">
        {#each data.fields as field}
          <li>
            <form method="POST" action="?/updateCustomField" class="stacked">
              <input type="hidden" name="fieldId" value={field.id} />
              <label><span>Label</span><input name="label" value={field.label} required /></label>
              <label>
                <span>Type</span>
                <select name="fieldType" value={field.fieldType}>
                  <option value="TEXT">TEXT</option>
                  <option value="NUMBER">NUMBER</option>
                  <option value="DATE">DATE</option>
                  <option value="URL">URL</option>
                  <option value="BOOLEAN">BOOLEAN</option>
                  <option value="SELECT">SELECT</option>
                </select>
              </label>
              <label>
                <span>Options (one per line)</span>
                <textarea name="options" rows="3">{(field.options ?? []).join('\n')}</textarea>
                {#if fieldTypeRequiresOptions(field.fieldType)}
                  <small>SELECT fields require at least one option.</small>
                {/if}
              </label>
              <label><span>Help text</span><textarea name="helpText" rows="2">{field.helpText ?? ''}</textarea></label>
              <div class="checks">
                <label class="checkbox"><input type="checkbox" name="isRequired" checked={field.isRequired} /> Required</label>
                <label class="checkbox"><input type="checkbox" name="isActive" checked={field.isActive} /> Active</label>
              </div>
              <button type="submit">Update field</button>
            </form>
            {#if form?.action === 'updateCustomField' && form?.fieldId === field.id && form?.message}
              <p class="error">{form.message}</p>
            {/if}
          </li>
        {/each}
      </ul>
    {/if}
  </article>

  <article class="panel">
    <h3>Journal master records</h3>
    {#if data.journals.length === 0}
      <p class="muted">No journals created yet.</p>
    {:else}
      <ul class="journal-list">
        {#each data.journals as journal}
          <li>
            <div class="headline">
              <strong>{journal.title}</strong>
              <span class={`status ${journalStateTone(journal.isDeleted)}`}>{journalStateLabel(journal.isDeleted)}</span>
            </div>
            <p>ISSN: {journal.issn ?? 'n/a'} · Publisher: {journal.publisher ?? 'n/a'}</p>
            <p>Version: {journal.currentVersionNumber}</p>
            <a href={`/admin/journals/${journal.id}`}>Open journal detail</a>
          </li>
        {/each}
      </ul>
    {/if}
  </article>
</section>

<style>
  .journal-governance { display: grid; gap: 1rem; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }
  .panel { border: 1px solid #d1d5db; border-radius: 0.75rem; padding: 1rem; }
  .stacked { display: grid; gap: 0.55rem; }
  label { display: grid; gap: 0.3rem; }
  input, select, textarea { border: 1px solid #9ca3af; border-radius: 0.45rem; padding: 0.45rem; }
  .checkbox { display: flex; gap: 0.45rem; align-items: center; }
  button { border: 0; background: #0f4c81; color: #fff; border-radius: 0.45rem; padding: 0.45rem 0.65rem; }
  .muted { color: #6b7280; }
  .error { color: #991b1b; }
  .field-list, .journal-list { list-style: none; padding: 0; display: grid; gap: 0.7rem; }
  .field-list li, .journal-list li { border: 1px solid #e5e7eb; border-radius: 0.6rem; padding: 0.7rem; }
  .headline { display: flex; justify-content: space-between; align-items: center; gap: 0.6rem; }
  .status { border-radius: 0.45rem; padding: 0.15rem 0.45rem; font-size: 0.78rem; }
  .status.active { background: #dcfce7; color: #166534; }
  .status.deleted { background: #fee2e2; color: #991b1b; }
  .checks { display: flex; gap: 1rem; flex-wrap: wrap; }
</style>
