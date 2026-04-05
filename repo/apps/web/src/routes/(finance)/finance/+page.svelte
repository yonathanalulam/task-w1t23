<script lang="ts">
  import type { ActionData } from './$types';
  import { invoiceStatusTone, settlementRowLabel } from '$lib/finance-ui';

  let { data, form }: { data: any; form: ActionData } = $props();
</script>

<section class="finance-grid">
  <article class="panel">
    <h2>Create invoice</h2>
    <p>Finance-clerk offline invoice issuance for paid services (no live payment gateway integration).</p>

    <form method="POST" action="?/createInvoice" class="stacked">
      <label><span>Service type</span>
        <select name="serviceType" required>
          <option value="RESOURCE_BOOKING">RESOURCE_BOOKING</option>
          <option value="JOURNAL_SERVICE">JOURNAL_SERVICE</option>
          <option value="OTHER">OTHER</option>
        </select>
      </label>
      <label><span>Description</span><textarea name="description" rows="3" required></textarea></label>
      <label><span>Total amount (CNY)</span><input name="totalAmount" type="number" min="0.01" step="0.01" required /></label>
      <label><span>Customer user ID (optional)</span><input name="customerUserId" /></label>
      <label><span>Service reference ID (optional)</span><input name="serviceReferenceId" /></label>
      <label><span>Due at (optional)</span><input name="dueAt" type="datetime-local" /></label>
      <button type="submit">Issue invoice</button>
    </form>

    {#if form?.action === 'createInvoice' && form?.message}
      <p class="error">{form.message}</p>
    {/if}
    {#if form?.action === 'createInvoice' && form?.ok}
      <p class="ok">Invoice issued.</p>
    {/if}
  </article>

  <article class="panel">
    <h2>Settlement CSV import</h2>
    <p>Header format: <code>wechatTransactionRef,amount,settledAt</code>. Import is offline and reconciliation-only.</p>
    <form method="POST" action="?/importSettlementCsv" class="stacked">
      <label><span>Source label</span><input name="sourceLabel" placeholder="daily_settlement_2026-04-05.csv" /></label>
      <label><span>CSV content</span><textarea name="csvText" rows="8" required></textarea></label>
      <button type="submit">Import settlement CSV</button>
    </form>

    {#if form?.action === 'importSettlementCsv' && form?.message}
      <p class="error">{form.message}</p>
    {/if}
    {#if form?.action === 'importSettlementCsv' && form?.ok && form?.importSummary}
      <div class="ok-box">
        <p><strong>Settlement import complete.</strong></p>
        <p>Rows: {form.importSummary.rowCount}</p>
        <p>Matched: {form.importSummary.matchedCount}</p>
        <p>Exceptions: {form.importSummary.exceptionCount}</p>
      </div>
    {/if}
  </article>

  <article class="panel panel-wide">
    <h2>Invoices</h2>
    {#if data.invoices.length === 0}
      <p class="muted">No invoices yet.</p>
    {:else}
      <ul class="invoice-list">
        {#each data.invoices as invoice}
          <li>
            <div class="headline">
              <strong>{invoice.invoiceNumber}</strong>
              <span class={`status ${invoiceStatusTone(invoice.status)}`}>{invoice.status}</span>
            </div>
            <p>{invoice.serviceType} · {invoice.description}</p>
            <p>Total ¥{invoice.totalAmount} · Paid ¥{invoice.paidAmount} · Refunded ¥{invoice.refundedAmount}</p>
            <p>Exception flag: {invoice.hasOpenException ? 'OPEN' : 'none'}</p>
            <a href={`/finance/invoices/${invoice.id}`}>Open invoice detail</a>
          </li>
        {/each}
      </ul>
    {/if}
  </article>

  <article class="panel panel-wide">
    <h2>Reconciliation follow-up queue</h2>
    <div class="queue-grid">
      <div>
        <h3>Unsettled payments</h3>
        {#if data.unsettledPayments.length === 0}
          <p class="muted">No unsettled payments.</p>
        {:else}
          <ul>
            {#each data.unsettledPayments as payment}
              <li>{payment.wechatTransactionRef} · ¥{payment.amount} · {payment.settlementStatus}</li>
            {/each}
          </ul>
        {/if}
      </div>

      <div>
        <h3>Settlement exceptions</h3>
        {#if data.exceptionRows.length === 0}
          <p class="muted">No reconciliation exceptions.</p>
        {:else}
          <ul>
            {#each data.exceptionRows as row}
              <li>
                <strong>{settlementRowLabel(row.status)}</strong>
                <p>Ref: {row.wechatTransactionRef ?? 'n/a'} · Amount: {row.amount ?? 'n/a'}</p>
                {#if row.matchedInvoiceNumber}
                  <p>Invoice: {row.matchedInvoiceNumber}</p>
                {/if}
                <p>{row.exceptionReason ?? 'No details'}</p>
                <form method="POST" action="?/resolveException" class="stacked">
                  <input type="hidden" name="rowId" value={row.id} />
                  <label><span>Resolution note</span><textarea name="resolutionNote" rows="2" required></textarea></label>
                  <div class="action-row">
                    <button type="submit">Resolve</button>
                    <button type="submit" formaction="?/closeException" class="neutral">Close (no remediation)</button>
                  </div>
                </form>
                {#if (form?.action === 'resolveException' || form?.action === 'closeException') && form?.rowId === String(row.id) && form?.message}
                  <p class="error">{form.message}</p>
                {/if}
              </li>
            {/each}
          </ul>
        {/if}
      </div>

      <div>
        <h3>Recently resolved/closed exceptions</h3>
        {#if data.resolvedExceptionRows.length === 0}
          <p class="muted">No resolved or closed exceptions yet.</p>
        {:else}
          <ul>
            {#each data.resolvedExceptionRows as row}
              <li>
                <strong>{settlementRowLabel(row.status)} · {row.resolutionStatus}</strong>
                <p>Ref: {row.wechatTransactionRef ?? 'n/a'} · Amount: {row.amount ?? 'n/a'}</p>
                <p>{row.resolutionNote ?? 'No resolution note recorded.'}</p>
              </li>
            {/each}
          </ul>
        {/if}
      </div>
    </div>
  </article>
</section>

<style>
  .finance-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }
  .panel { border: 1px solid #d1d5db; border-radius: 0.75rem; padding: 0.95rem; }
  .panel-wide { grid-column: 1 / -1; }
  .stacked { display: grid; gap: 0.55rem; }
  label { display: grid; gap: 0.3rem; }
  input, textarea, select { border: 1px solid #9ca3af; border-radius: 0.45rem; padding: 0.45rem; }
  button { border: 0; background: #0f4c81; color: #fff; border-radius: 0.45rem; padding: 0.45rem 0.65rem; }
  .invoice-list { list-style: none; padding: 0; display: grid; gap: 0.65rem; }
  .invoice-list li { border: 1px solid #e5e7eb; border-radius: 0.6rem; padding: 0.65rem; }
  .headline { display: flex; justify-content: space-between; gap: 0.5rem; align-items: center; }
  .status { border-radius: 0.4rem; font-size: 0.78rem; padding: 0.15rem 0.45rem; }
  .status.ok { background: #dcfce7; color: #166534; }
  .status.warn { background: #fef3c7; color: #92400e; }
  .status.bad { background: #fee2e2; color: #991b1b; }
  .status.neutral { background: #e5e7eb; color: #374151; }
  .queue-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }
  .action-row { display: flex; gap: 0.5rem; }
  .neutral { background: #4b5563; }
  ul { list-style: none; padding: 0; display: grid; gap: 0.55rem; }
  ul li { border: 1px solid #e5e7eb; border-radius: 0.55rem; padding: 0.55rem; }
  .muted { color: #6b7280; }
  .ok { color: #166534; }
  .ok-box { border: 1px solid #86efac; background: #f0fdf4; border-radius: 0.5rem; padding: 0.55rem; color: #14532d; }
  .error { color: #991b1b; }
</style>
