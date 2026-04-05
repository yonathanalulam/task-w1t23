<script lang="ts">
  import type { ActionData } from './$types';

  let { data, form }: { data: any; form: ActionData } = $props();
</script>

<section class="manager-grid">
  <article class="panel">
    <h2>Create managed resource</h2>
    <p>New resources start with default business hours (Mon–Fri, 08:00–18:00) and can be refined on detail pages.</p>

    <form method="POST" action="?/createResource" class="stacked">
      <label>
        <span>Resource type</span>
        <select name="resourceType" required>
          <option value="ROOM">ROOM</option>
          <option value="EQUIPMENT">EQUIPMENT</option>
          <option value="CONSULTATION">CONSULTATION</option>
        </select>
      </label>

      <label><span>Name</span><input name="name" required minlength="2" maxlength="180" /></label>
      <label><span>Description</span><textarea name="description" rows="3" maxlength="2000"></textarea></label>
      <label><span>Location</span><input name="location" maxlength="300" /></label>
      <label><span>Capacity</span><input name="capacity" type="number" min="1" required value="1" /></label>
      <label><span>Timezone</span><input name="timezone" required value="UTC" /></label>
      <label class="checkbox"><input type="checkbox" name="isActive" checked /> Active</label>
      <button type="submit">Create resource</button>
    </form>

    {#if form?.action === 'createResource' && form?.message}
      <p class="error">{form.message}</p>
    {/if}
  </article>

  <article class="panel">
    <h2>Managed resource catalog</h2>

    {#if data.resources.length === 0}
      <p class="muted">No resources configured yet.</p>
    {:else}
      <ul class="resource-list">
        {#each data.resources as resource}
          <li>
            <div class="headline">
              <strong>{resource.name}</strong>
              <span class={`status ${resource.isActive ? 'active' : 'inactive'}`}>{resource.isActive ? 'ACTIVE' : 'INACTIVE'}</span>
            </div>
            <p>{resource.resourceType} · Capacity {resource.capacity} · TZ {resource.timezone}</p>
            <p>{resource.location ?? 'No location specified'}</p>
            <a href={`/manager/resources/${resource.id}`}>Open settings</a>
          </li>
        {/each}
      </ul>
    {/if}
  </article>
</section>

<style>
  .manager-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }
  .panel { border: 1px solid #d1d5db; border-radius: 0.75rem; padding: 1rem; }
  .stacked { display: grid; gap: 0.55rem; }
  label { display: grid; gap: 0.3rem; }
  input, select, textarea { border: 1px solid #9ca3af; border-radius: 0.45rem; padding: 0.45rem; }
  .checkbox { display: flex; gap: 0.45rem; align-items: center; }
  button { border: 0; background: #0f4c81; color: #fff; border-radius: 0.45rem; padding: 0.45rem 0.65rem; }
  .resource-list { list-style: none; padding: 0; display: grid; gap: 0.6rem; }
  .resource-list li { border: 1px solid #e5e7eb; border-radius: 0.6rem; padding: 0.6rem; }
  .headline { display: flex; justify-content: space-between; align-items: center; gap: 0.4rem; }
  .status { border-radius: 0.4rem; font-size: 0.78rem; padding: 0.15rem 0.45rem; }
  .status.active { background: #dcfce7; color: #166534; }
  .status.inactive { background: #fee2e2; color: #991b1b; }
  .muted { color: #6b7280; }
  .error { color: #991b1b; }
</style>
