import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { downloadCommerceReceiptArtifact } from "../lib/server/commerce-admin.ts";

type QueryResult = { data: unknown; error: unknown };

function query(result: QueryResult) {
  const chain: Record<string, unknown> = {};
  for (const method of ["select", "eq", "limit"]) chain[method] = () => chain;
  chain.maybeSingle = async () => result;
  return chain;
}

function fakeSupabase(input: { receipt?: unknown; artifact?: unknown; blob?: Blob; storageError?: unknown }) {
  const selected: string[] = [];
  const storageCalls: Array<[string, string]> = [];
  return {
    client: {
      from(table: string) {
        selected.push(table);
        if (table === "receipts") return query({ data: input.receipt ?? null, error: null });
        if (table === "receipt_artifacts") return query({ data: input.artifact ?? null, error: null });
        throw new Error(`Unexpected table ${table}`);
      },
      storage: { from(bucket: string) { return { async download(key: string) { storageCalls.push([bucket, key]); return { data: input.blob ?? null, error: input.storageError ?? null }; } }; } },
    }, selected, storageCalls,
  };
}

const receipt = { id: "receipt-id", receipt_number: 1, receipt_series: { series_code: "WEB" } };
const artifact = { status: "ready", storage_bucket: "receipt-pdfs", storage_key: "receipts/receipt-id/original/artifact.pdf", content_type: "application/pdf" };

test("ready canonical artifact downloads through its server-resolved private identity", async () => {
  const fake = fakeSupabase({ receipt, artifact, blob: new Blob(["pdf"], { type: "application/pdf" }) });
  const result = await downloadCommerceReceiptArtifact(fake.client as never, "order-id", "original");
  assert.equal(result.status, "ready");
  if (result.status === "ready") assert.equal(result.fileName, "receipt-WEB-000001-original.pdf");
  assert.deepEqual(fake.storageCalls, [["receipt-pdfs", "receipts/receipt-id/original/artifact.pdf"]]);
});

test("missing and non-ready artifacts never access Storage", async () => {
  const missingReceipt = fakeSupabase({});
  assert.equal((await downloadCommerceReceiptArtifact(missingReceipt.client as never, "order-id", "copy")).status, "receipt_not_found");
  const missingArtifact = fakeSupabase({ receipt });
  assert.equal((await downloadCommerceReceiptArtifact(missingArtifact.client as never, "order-id", "copy")).status, "artifact_not_found");
  const pending = fakeSupabase({ receipt, artifact: { ...artifact, status: "processing" } });
  assert.equal((await downloadCommerceReceiptArtifact(pending.client as never, "order-id", "copy")).status, "artifact_not_ready");
  assert.deepEqual(pending.storageCalls, []);
});

test("download route enforces existing admin auth and accepts only controlled copy values", async () => {
  const route = await readFile(new URL("../pages/api/admin/commerce/orders/[orderId]/receipt/[documentCopy].ts", import.meta.url), "utf8");
  assert.match(route, /requireAdminSession\(req, res\)/);
  assert.match(route, /documentCopy !== "original" && documentCopy !== "copy"/);
  assert.match(route, /downloadCommerceReceiptArtifact\(supabase, orderId, documentCopy\)/);
  assert.doesNotMatch(route, /req\.query\.(storage|bucket|key)/);
  assert.doesNotMatch(route, /createSignedUrl|getPublicUrl/);
});
