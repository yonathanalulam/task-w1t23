<script lang="ts">
  import type { ActionData } from './$types';
  import { invoiceStatusTone, refundMethodNeedsBank } from '$lib/finance-ui';

  let { data, form }: { data: any; form: ActionData } = $props();
  let refundMethod = $state('WECHAT_OFFLINE');
</script>

{#if data.notFound}
  <p>Invoice not found.</p>
{:else}
  <section class="invoice-detail">
    <header class="panel">
      <h2>{data.invoice.invoiceNumber}</h2>
      <p>{data.invoice.description}</p>
      <p>Status: <span class={`status ${invoiceStatusTone(data.invoice.status)}`}>{data.invoice.status}</span></p>
      <p>Total ¥{data.invoice.totalAmount} · Paid ¥{data.invoice.paidAmount} · Refunded ¥{data.invoice.refundedAmount}</p>
      <p>Open exception: {data.invoice.hasOpenException ? 'YES' : 'NO'}</p>
    </header>

    <div class="grid">
      <article class="panel">
        <h3>Record offline WeChat payment</h3>
        <form method="POST" action="?/recordPayment" class="stacked">
          <label><span>Amount (CNY)</span><input name="amount" type="number" min="0.01" step="0.01" required /></label>
          <label><span>WeChat transaction reference</span><input name="wechatTransactionRef" required /></label>
          <label><span>Received at</span><input name="receivedAt" type="datetime-local" value={data.nowLocal} required /></label>
          <label><span>Note (optional)</span><textarea name="note" rows="2"></textarea></label>
          <button type="submit">Record payment</button>
        </form>

        {#if form?.action === 'recordPayment' && form?.message}
          <p class="error">{form.message}</p>
        {/if}
      </article>

      <article class="panel">
        <h3>Record refund</h3>
        <form method="POST" action="?/recordRefund" class="stacked">
          <label><span>Amount (CNY)</span><input name="amount" type="number" min="0.01" step="0.01" required /></label>
          <label>
            <span>Refund method</span>
            <select name="refundMethod" bind:value={refundMethod}>
              <option value="WECHAT_OFFLINE">WECHAT_OFFLINE</option>
              <option value="BANK_TRANSFER">BANK_TRANSFER</option>
            </select>
          </label>
          <label><span>Reason</span><textarea name="reason" rows="2" required></textarea></label>
          <label><span>Refunded at</span><input name="refundedAt" type="datetime-local" value={data.nowLocal} required /></label>

          {#if !refundMethodNeedsBank(refundMethod)}
            <label><span>WeChat refund reference</span><input name="wechatRefundReference" /></label>
          {:else}
            <label><span>Bank account name</span><input name="bankAccountName" /></label>
            <label><span>Bank routing number</span><input name="bankRoutingNumber" /></label>
            <label><span>Bank account number</span><input name="bankAccountNumber" /></label>
          {/if}

          <button type="submit">Record refund</button>
        </form>

        {#if form?.action === 'recordRefund' && form?.message}
          <p class="error">{form.message}</p>
        {/if}
      </article>
    </div>

    <article class="panel">
      <h3>Payments</h3>
      {#if data.payments.length === 0}
        <p class="muted">No payments recorded.</p>
      {:else}
        <ul>
          {#each data.payments as payment}
            <li>{payment.wechatTransactionRef} · ¥{payment.amount} · {payment.settlementStatus} · {new Date(payment.receivedAt).toLocaleString()}</li>
          {/each}
        </ul>
      {/if}
    </article>

    <article class="panel">
      <h3>Refunds</h3>
      {#if data.refunds.length === 0}
        <p class="muted">No refunds recorded.</p>
      {:else}
        <ul>
          {#each data.refunds as refund}
            <li>
              {refund.refundMethod} · ¥{refund.amount} · {new Date(refund.refundedAt).toLocaleString()} · {refund.reason}
              {#if refund.bankAccountLast4}<span> · Bank ****{refund.bankAccountLast4}</span>{/if}
            </li>
          {/each}
        </ul>
      {/if}
    </article>

    <article class="panel">
      <h3>Ledger trail (who/what/when)</h3>
      {#if data.ledger.length === 0}
        <p class="muted">No ledger entries yet.</p>
      {:else}
        <ol>
          {#each data.ledger as entry}
            <li>
              <strong>{entry.entryType}</strong>
              <span> · {entry.amount ? `¥${entry.amount}` : 'n/a'}</span>
              <span> · actor {entry.actorUsername ?? entry.actorUserId}</span>
              <span> · {new Date(entry.createdAt).toLocaleString()}</span>
            </li>
          {/each}
        </ol>
      {/if}
    </article>
  </section>
{/if}

<style>
  .invoice-detail { display: grid; gap: 1rem; }
  .panel { border: 1px solid #d1d5db; border-radius: 0.75rem; padding: 0.9rem; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }
  .stacked { display: grid; gap: 0.55rem; }
  label { display: grid; gap: 0.3rem; }
  input, textarea, select { border: 1px solid #9ca3af; border-radius: 0.45rem; padding: 0.45rem; }
  button { border: 0; background: #0f4c81; color: #fff; border-radius: 0.45rem; padding: 0.45rem 0.65rem; }
  ul, ol { list-style: none; padding: 0; display: grid; gap: 0.5rem; }
  li { border: 1px solid #e5e7eb; border-radius: 0.55rem; padding: 0.55rem; }
  .muted { color: #6b7280; }
  .error { color: #991b1b; }
  .status.ok { color: #166534; }
  .status.warn { color: #92400e; }
  .status.bad { color: #991b1b; }
  .status.neutral { color: #374151; }
</style>
