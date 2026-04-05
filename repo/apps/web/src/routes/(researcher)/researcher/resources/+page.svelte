<script lang="ts">
  import type { ActionData } from './$types';
  import { availabilityState, availabilityTone, bookingErrorMessage } from '$lib/resource-booking-ui';

  let { data, form }: { data: any; form: ActionData } = $props();

  const activeStartsAt = $derived(form?.startsAtLocal ?? data.startsAtLocal);
  const activeEndsAt = $derived(form?.endsAtLocal ?? data.endsAtLocal);
</script>

<section class="booking-shell">
  <article class="panel">
    <h2>Resource availability</h2>
    <p>Search a booking window and submit a reservation request against currently active resources.</p>

    <form method="POST" action="?/queryAvailability" class="window-form">
      <label><span>Starts at</span><input type="datetime-local" name="startsAt" value={activeStartsAt} required /></label>
      <label><span>Ends at</span><input type="datetime-local" name="endsAt" value={activeEndsAt} required /></label>
      <button type="submit">Refresh availability</button>
    </form>

    {#if form?.action === 'queryAvailability' && form?.message}
      <p class="error">{form.message}</p>
    {/if}
  </article>

  <article class="panel">
    <h3>Availability results</h3>
    {#if data.resources.length === 0}
      <p class="muted">No active resources returned for this window.</p>
    {:else}
      <ul class="resource-list">
        {#each data.resources as resource}
          {@const state = availabilityState(resource)}
          <li>
            <div class="headline">
              <strong>{resource.name}</strong>
              <span class={`status ${availabilityTone(state)}`}>{state.toUpperCase()}</span>
            </div>
            <p>{resource.resourceType} · Capacity {resource.capacity} · Available seats {resource.availableSeats}</p>
            <p>{resource.location ?? 'No location specified'}</p>
            {#if resource.isBlackedOut}
              <p class="error">Blackout: {resource.blackoutReason}</p>
            {/if}

            <form method="POST" action="?/createBooking" class="booking-form">
              <input type="hidden" name="resourceId" value={resource.id} />
              <input type="hidden" name="startsAt" value={activeStartsAt} />
              <input type="hidden" name="endsAt" value={activeEndsAt} />
              <label>
                <span>Seats requested</span>
                <input type="number" name="seatsRequested" min="1" max={resource.capacity} value="1" required />
              </label>
              <button type="submit" disabled={state !== 'available'}>Book this slot</button>
            </form>

            {#if form?.action === 'createBooking' && form?.resourceId === resource.id && form?.message}
              <p class="error">{bookingErrorMessage(form.message, form.errorCode)}</p>
            {/if}
          </li>
        {/each}
      </ul>
    {/if}
  </article>

  <article class="panel">
    <h3>Your bookings</h3>
    {#if data.bookings.length === 0}
      <p class="muted">No bookings yet.</p>
    {:else}
      <ul class="booking-list">
        {#each data.bookings as booking}
          <li>
            <strong>{booking.resourceName ?? booking.resourceId}</strong>
            <p>{booking.resourceType ?? 'RESOURCE'} · Seats {booking.seatsRequested} · {booking.status}</p>
            <p>{new Date(booking.startsAt).toLocaleString()} → {new Date(booking.endsAt).toLocaleString()}</p>
          </li>
        {/each}
      </ul>
    {/if}
  </article>
</section>

<style>
  .booking-shell { display: grid; gap: 1rem; }
  .panel { border: 1px solid #d1d5db; border-radius: 0.75rem; padding: 0.95rem; }
  .window-form { display: grid; grid-template-columns: 1fr 1fr auto; gap: 0.7rem; align-items: end; }
  label { display: grid; gap: 0.3rem; }
  input { border: 1px solid #9ca3af; border-radius: 0.45rem; padding: 0.45rem; }
  button { border: 0; background: #0f4c81; color: white; border-radius: 0.45rem; padding: 0.45rem 0.65rem; }
  .resource-list, .booking-list { list-style: none; padding: 0; display: grid; gap: 0.7rem; }
  .resource-list li, .booking-list li { border: 1px solid #e5e7eb; border-radius: 0.6rem; padding: 0.7rem; }
  .headline { display: flex; justify-content: space-between; align-items: center; gap: 0.5rem; }
  .status { border-radius: 0.4rem; font-size: 0.78rem; padding: 0.15rem 0.45rem; }
  .status.ok { background: #dcfce7; color: #166534; }
  .status.warn { background: #fef3c7; color: #92400e; }
  .status.bad { background: #fee2e2; color: #991b1b; }
  .booking-form { margin-top: 0.5rem; display: flex; gap: 0.6rem; align-items: end; }
  .muted { color: #6b7280; }
  .error { color: #991b1b; }
</style>
