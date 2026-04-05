<script lang="ts">
  let { data }: { data: { queue: any[] } } = $props();
</script>

<section class="workflow">
  <h2>Approver queue</h2>
  <p>Sign off or reject in-order approval levels. Comments are required for every sign-off action.</p>

  {#if data.queue.length === 0}
    <p class="muted">No applications are waiting on approver sign-off.</p>
  {:else}
    <ul class="queue">
      {#each data.queue as item}
        <li>
          <div class="headline">
            <strong>{item.title}</strong>
            <span class="status">Level {item.nextApprovalLevel} of {item.approvalLevelsRequired}</span>
          </div>
          <p>Applicant: {item.applicantUsername}</p>
          <p>Policy: {item.policyTitle}</p>
          <p>Requested: ${item.requestedAmount}</p>
          <p>Submitted: {item.submittedAt ? new Date(item.submittedAt).toLocaleString() : 'not recorded'}</p>
          <a href={`/approver/applications/${item.id}`}>Open approver detail</a>
        </li>
      {/each}
    </ul>
  {/if}
</section>

<style>
  .workflow { display: grid; gap: 0.8rem; }
  .queue { list-style: none; padding: 0; display: grid; gap: 0.7rem; }
  .queue li { border: 1px solid #d1d5db; border-radius: 0.7rem; padding: 0.75rem; }
  .headline { display: flex; justify-content: space-between; align-items: center; gap: 0.7rem; }
  .status { border-radius: 0.45rem; background: #fef3c7; color: #92400e; padding: 0.2rem 0.45rem; font-size: 0.82rem; }
  .muted { color: #6b7280; }
</style>
