import { useCallback, useEffect, useRef, useState } from "react";
import type { CommerceOrderDetail } from "../../lib/commerce-admin";

type Operation = {
  status: string; provider_refund_id: string | null; accounting_status: string;
  error_code: string | null;
};
type Preview = { environment: "sandbox" | "live"; amountMinor: number; currency: string; accessStatus: string; enabled: boolean; operation: Operation | null };
const money = (minor: number, currency: string) => new Intl.NumberFormat("he-IL", { style: "currency", currency }).format(minor / 100);
const refundErrorMessage = (code: string) => {
  if (code === "refund_claim_failed") return "The refund could not be reserved. No PayPal refund request was sent. Check the operation before confirming again.";
  if (["provider_outcome_unknown", "provider_result_needs_reconciliation"].includes(code)) return "The PayPal outcome needs verification. Do not submit another refund; use Verify and complete after checking PayPal.";
  return code.replaceAll("_", " ");
};

export function CommerceRefundPanel({ order, onChange }: { order: CommerceOrderDetail; onChange: () => void }) {
  const [preview, setPreview] = useState<Preview | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [refundId, setRefundId] = useState("");
  const [result, setResult] = useState<Operation | null>(null);
  const [loaded, setLoaded] = useState(false);
  const submitting = useRef(false);
  const url = `/api/admin/commerce/orders/${encodeURIComponent(order.id)}/refund`;

  const loadPreview = useCallback(async () => {
    setBusy(true);
    try {
      const response = await fetch(url, { credentials: "include", cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Refund review unavailable");
      setPreview(body as Preview);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Refund review unavailable"); }
    finally { setBusy(false); setLoaded(true); }
  }, [url]);

  useEffect(() => { void loadPreview(); /* The API performs read-only provider verification. */ }, [loadPreview]);

  async function submit(body: { action: "refund"; confirm: true } | { action: "reconcile"; refundId: string }) {
    if (submitting.current) return;
    submitting.current = true;
    setBusy(true); setError("");
    try {
      const response = await fetch(url, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await response.json();
      if (!response.ok) {
        if (typeof data.refundId === "string") setRefundId(data.refundId);
        throw new Error(data.error ?? "Refund requires review");
      }
      setResult(data as Operation); await loadPreview(); onChange();
    } catch (cause) { await loadPreview(); setError(refundErrorMessage(cause instanceof Error ? cause.message : "Refund requires review")); }
    finally { submitting.current = false; setBusy(false); }
  }

  const canConfirm = preview && (!preview.operation || preview.operation.status === "prepared");

  return <section className="commerce-refund" aria-labelledby="refund-heading">
    <h2 id="refund-heading">Refund payment</h2>
    <p>Full PayPal refund and product access revocation are linked. A refund is never retried automatically.</p>
    {loaded && preview && canConfirm && !open ? <button type="button" onClick={() => setOpen(true)} disabled={busy || !preview.enabled || order.status !== "paid"}>Refund payment</button> : null}
    {loaded && preview && canConfirm && !preview.enabled ? <p>Refund operation is disabled in this environment.</p> : null}
    {open && preview && canConfirm ? <div className="commerce-refund-modal" role="dialog" aria-modal="true" aria-labelledby="refund-confirm-heading" aria-describedby="refund-confirm-description">
      <div className="commerce-refund-review">
      <h3 id="refund-confirm-heading">Confirm payment refund</h3>
      <p id="refund-confirm-description">Are you sure you want to issue a full refund for this payment?</p>
      <dl>
        <div><dt>Customer email</dt><dd>{order.customer.email ?? "Unavailable"}</dd></div>
        <div><dt>Product</dt><dd>{order.item.productName}</dd></div>
        <div><dt>Order ID</dt><dd>{order.id}</dd></div>
        <div><dt>Full refund amount</dt><dd>{money(preview.amountMinor, preview.currency)}</dd></div>
        <div><dt>Currency</dt><dd>{preview.currency}</dd></div>
        <div><dt>PayPal environment</dt><dd>{preview.environment === "sandbox" ? "Sandbox" : "Live"}</dd></div>
        <div><dt>Current access</dt><dd>{preview.accessStatus}</dd></div>
      </dl>
      <p><strong>This action will refund the payment through PayPal and revoke the customer&apos;s access to this product.</strong></p>
      {preview.environment === "live" ? <p className="commerce-warning">This is a real financial transaction. Live refund requires manual accounting correction. The original receipt stays unchanged.</p> : <p>Sandbox transaction. No real money will be transferred.</p>}
      <div className="commerce-refund-actions">
        <button type="button" disabled={busy} onClick={() => setOpen(false)}>Cancel</button>
        <button type="button" disabled={busy || !preview.enabled} onClick={() => void submit({ action: "refund", confirm: true })}>{busy ? "Processing refund..." : "Confirm full refund"}</button>
      </div>
      </div>
    </div> : null}
    {preview?.operation && preview.operation.status !== "prepared" ? <div className="commerce-refund-review" role="status">
      <h3>{preview.operation.status === "completed" ? "Refund completed" : "Refund status"}</h3>
      <p>Status: <strong>{preview.operation.status}</strong></p><p>PayPal refund ID: <code>{preview.operation.provider_refund_id ?? "Pending verification"}</code></p>
      <p>Access: {result?.status === "completed" || preview.operation.status === "completed" ? "Access revoked" : preview.accessStatus}</p>
      <p>Accounting: {preview.operation.accounting_status}</p>{preview.operation.error_code ? <p>Error: {preview.operation.error_code}</p> : null}
      {preview.operation && ["uncertain", "dispatching", "provider_pending", "provider_confirmed"].includes(preview.operation.status) ? <div>
        <p>Check PayPal first. Enter the verified refund ID to finish access revocation without another refund request.</p>
        <label>PayPal refund ID <input value={refundId} onChange={(event) => setRefundId(event.target.value)} autoComplete="off" /></label>
        <button type="button" disabled={busy || !refundId} onClick={() => submit({ action: "reconcile", refundId })}>Verify and complete</button>
      </div> : null}
    </div> : null}
    {error ? <p role="alert" className="commerce-notice--error">{error}</p> : null}
  </section>;
}
