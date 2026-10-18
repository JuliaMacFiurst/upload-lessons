# Commerce operator: first controlled sale

Use the authorized Commerce order detail page for each case. Record the order ID, receipt ID, provider event IDs and observation time in the incident record. Receipt and delivery evidence on the page is read-only. The separate, explicitly confirmed full-refund action changes payment and access as described below; it does not edit receipt or delivery evidence. `accepted` means Resend accepted an email, not that the buyer received it.

## Healthy paid order

1. Confirm **Payment = paid** and the intended environment and amount. Check the PayPal capture against the provider dashboard.
2. Confirm **Access = active**. For a Live order, confirm one receipt number and both original and copy PDF artifacts **ready**. Sandbox orders must have no accounting receipt.
3. For a Live order, confirm **Original email delivery = accepted**, inspect its provider email ID in Resend, and confirm the buyer can download only the marked copy from the account. Check the purchase notification separately.
4. If any step is missing, pause new sales and follow the matching section below. Do not create a second receipt to repair a missing side effect.

## Paid but entitlement missing

Confirm the capture in PayPal and the paid order/provider event in Commerce. Check the existing reconciliation or recovery status. Escalate to the engineer with the order and event IDs; do not manually grant access or repeat capture without verifying the idempotent recovery path. Keep the customer informed through support.

## Receipt or PDF missing

Check whether the receipt ledger record exists, then inspect the original and copy artifact states and failure codes in Commerce. Check the protected recovery cron logs. Escalate a persistent failure with the order and receipt IDs. Do not issue a new receipt number, overwrite an original, or make the private Storage bucket public.

## Original email delivery failed

Check the delivery attempt count, claimed/updated times, error code and provider email ID in Commerce. Inspect the matching Resend request and mailbox outcome before any decision. Preserve the evidence and escalate to the owner and engineer. The application does not provide an operator resend action; do not create another original or retry the API blindly.

## Original email delivery uncertain or still sending

**Never blindly resend.** Inspect the Supabase delivery record and Resend activity using the receipt ID, provider email ID if present, and timestamps. Establish whether Resend accepted the message and whether the recipient received it. Preserve screenshots or references to the provider outcome in the incident record. If the result remains ambiguous, stop new sales and escalate; do not infer failure from a timeout or absence of an immediate response.

## Webhook replay

Compare the provider event and capture IDs with the existing order. A replay must not create a second paid order, entitlement, receipt number or original email attempt. If counts differ, stop new sales and escalate with the event IDs. Do not call capture again manually.

## Refund request

Record the request through Customer Support and link it to the order. Verify payment and current access. The full-refund migration is applied and registered, and an authorized Sandbox refund has been completed. The Admin release remains local; verify environment-specific PayPal credentials and feature flags before each deployment. Live refunds require separate approval and configuration.

When enabled, the order page checks the capture, full amount, currency and PayPal environment before showing the confirmation. Confirming starts at most one provider refund request per order; after PayPal reports `COMPLETED`, the server marks access `refunded` in a database transaction. A `PENDING` refund does not revoke access yet. If the outcome is uncertain or the database step fails, inspect the PayPal transaction and enter its verified refund ID in **Verify and complete**; this reads PayPal and finishes access revocation without another monetary request. Never click through with an invented ID or submit another refund for the same capture.

Sandbox refunds create no accounting documents. A Live refund remains `pending_manual` for the accountant-approved corrective documents; the original receipt is immutable. Do not describe the accounting work as complete until those documents have been issued through an approved separate process. Partial refunds, reversals and disputes are not covered by this action.

Before a further Sandbox run, verify `20261013214846_commerce_full_refund_operations.sql` remains registered in the shared Supabase project; configure **server-only** `PAYPAL_CLIENT_ID` and `PAYPAL_CLIENT_SECRET` with Sandbox credentials in the Admin environment; enable `COMMERCE_REFUNDS_ENABLED=true` only there after authorized review. Leave `COMMERCE_LIVE_REFUNDS_ENABLED` unset or false. Live requires separate server-only `PAYPAL_LIVE_CLIENT_ID` and `PAYPAL_LIVE_CLIENT_SECRET`, explicit Live flag approval, and an accountant-approved correction procedure. Never put these credentials in browser variables.

## Never do directly in Supabase

Do not edit or delete paid orders, captures, entitlements, consent evidence, receipt ledger rows, PDF artifacts or original-delivery status. Do not expose service-role credentials or private PDFs. Ask an engineer to investigate through the existing trusted workflow.
