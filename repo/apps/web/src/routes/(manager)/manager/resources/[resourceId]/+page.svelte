<script lang="ts">
  import type { ActionData } from './$types';

  let { data, form }: { data: any; form: ActionData } = $props();

  const businessHoursText = $derived(
    (data.businessHours ?? [])
      .map((entry: any) => `${entry.dayOfWeek} ${String(entry.opensAt).slice(0, 5)} ${String(entry.closesAt).slice(0, 5)}`)
      .join('\n')
  );
</script>

{#if data.notFound}
  <p>Resource not found.</p>
{:else}
  <section class="resource-detail">
    <header>
      <h2>{data.resource.name}</h2>
      <p>{data.resource.resourceType} · Capacity {data.resource.capacity} · {data.resource.timezone}</p>
    </header>

    <article class="panel">
      <h3>Resource profile</h3>
      <form method="POST" action="?/updateResource" class="stacked">
        <label><span>Name</span><input name="name" required value={data.resource.name} /></label>
        <label><span>Description</span><textarea name="description" rows="3">{data.resource.description ?? ''}</textarea></label>
        <label><span>Location</span><input name="location" value={data.resource.location ?? ''} /></label>
        <label><span>Capacity</span><input name="capacity" type="number" min="1" value={data.resource.capacity} required /></label>
        <label><span>Timezone</span><input name="timezone" value={data.resource.timezone} required /></label>
        <label class="checkbox"><input type="checkbox" name="isActive" checked={data.resource.isActive} /> Active</label>
        <button type="submit">Save resource</button>
      </form>

      {#if form?.action === 'updateResource' && form?.message}
        <p class="error">{form.message}</p>
      {/if}
    </article>

    <div class="grid">
      <article class="panel">
        <h3>Business hours</h3>
        <p>Enter one line per day: <code>dayOfWeek opensAt closesAt</code> (ISO day 1-7, HH:MM).</p>
        <form method="POST" action="?/setBusinessHours" class="stacked">
          <textarea name="hours" rows="8" required>{businessHoursText}</textarea>
          <button type="submit">Update business hours</button>
        </form>

        {#if form?.action === 'setBusinessHours' && form?.message}
          <p class="error">{form.message}</p>
        {/if}
      </article>

      <article class="panel">
        <h3>Add maintenance blackout</h3>
        <form method="POST" action="?/addBlackout" class="stacked">
          <label><span>Starts at</span><input name="startsAt" type="datetime-local" required /></label>
          <label><span>Ends at</span><input name="endsAt" type="datetime-local" required /></label>
          <label><span>Reason</span><textarea name="reason" rows="3" required></textarea></label>
          <button type="submit">Create blackout</button>
        </form>

        {#if form?.action === 'addBlackout' && form?.message}
          <p class="error">{form.message}</p>
        {/if}
      </article>
    </div>

    <article class="panel">
      <h3>Configured blackout windows</h3>
      {#if data.blackouts.length === 0}
        <p class="muted">No blackout windows configured.</p>
      {:else}
        <ul>
          {#each data.blackouts as blackout}
            <li>
              <strong>{new Date(blackout.startsAt).toLocaleString()} → {new Date(blackout.endsAt).toLocaleString()}</strong>
              <p>{blackout.reason}</p>
            </li>
          {/each}
        </ul>
      {/if}
    </article>
  </section>
{/if}

<style>
  .resource-detail { display: grid; gap: 1rem; }
  .panel { border: 1px solid #d1d5db; border-radius: 0.75rem; padding: 0.9rem; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }
  .stacked { display: grid; gap: 0.55rem; }
  label { display: grid; gap: 0.3rem; }
  input, textarea { border: 1px solid #9ca3af; border-radius: 0.45rem; padding: 0.45rem; }
  .checkbox { display: flex; gap: 0.45rem; align-items: center; }
  button { border: 0; background: #0f4c81; color: #fff; border-radius: 0.45rem; padding: 0.45rem 0.65rem; }
  .error { color: #991b1b; }
  .muted { color: #6b7280; }
  ul { list-style: none; padding: 0; display: grid; gap: 0.55rem; }
  li { border: 1px solid #e5e7eb; border-radius: 0.6rem; padding: 0.55rem; }
</style>
