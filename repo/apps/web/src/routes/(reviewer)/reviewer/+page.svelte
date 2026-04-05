<script lang="ts">
  let { data }: { data: { queue: any[] } } = $props();
</script>

<section class="workflow">
  <h2>Reviewer queue</h2>
  <p>Evaluate submitted applications, record eligibility results, and route each item to approval, return, or rejection.</p>

  {#if data.queue.length === 0}
    <p class="muted">No submitted applications are waiting for reviewer intake.</p>
  {:else}
    <ul class="queue">
      {#each data.queue as item}
        <li>
          <div class="headline">
            <strong>{item.title}</strong>
            <span class="status">{item.status}</span>
          </div>
          <p>Applicant: {item.applicantUsername}</p>
          <p>Policy: {item.policyTitle}</p>
          <p>Requested: ${item.requestedAmount}</p>
          <p>Submitted: {item.submittedAt ? new Date(item.submittedAt).toLocaleString() : 'not recorded'}</p>
          <p>Approval levels required: {item.approvalLevelsRequired}</p>
          <a href={`/reviewer/applications/${item.id}`}>Open reviewer detail</a>
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
  .status { border-radius: 0.45rem; background: #e0f2fe; color: #0c4a6e; padding: 0.2rem 0.45rem; font-size: 0.82rem; }
  .muted { color: #6b7280; }
</style>
