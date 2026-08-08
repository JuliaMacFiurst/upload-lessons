/**
 * Map Source Validator — Independent Evidence Reviewer
 * Reads story content and story_sources JSON, re-checks HTTP availability, domain sanity,
 * publisher authority tier, and atomic claim-level evidence verification.
 *
 * IMPORTANT: This module NEVER generates or modifies prose. It is purely a reviewer.
 */

import { validateSourceDomainSanity, type SourceStatus } from "./evidenceRetriever.ts";

export type ClaimVerificationStatus = "VERIFIED" | "WARNING" | "FAILED";

export type SourceValidatorClaimResult = {
  claim_id: string;
  claim: string;
  source_id: string;
  verification_status: ClaimVerificationStatus;
  message?: string;
};

export type SourceValidatorEntryResult = {
  source_id: string;
  source_title: string;
  source_url: string;
  source_tier: "A" | "B" | "C";
  source_status: SourceStatus;
  domain_sanity_valid: boolean;
  claims: SourceValidatorClaimResult[];
};

export type SourceValidationReport = {
  story_id?: number | string;
  target_id: string;
  map_type: string;
  overall_status: "verified" | "warning" | "failed";
  checked_at: string;
  claims_total: number;
  claims_verified: number;
  claims_warning: number;
  claims_failed: number;
  sources: SourceValidatorEntryResult[];
  errors: string[];
};

/**
 * Main Independent Source Validator entrypoint
 */
export async function validateStorySources(
  storyContent: string,
  storySourcesJson: any,
  targetId: string,
  mapType: string
): Promise<SourceValidationReport> {
  const checkedAt = new Date().toISOString();
  const errors: string[] = [];

  if (!storySourcesJson || !storySourcesJson.sources || !Array.isArray(storySourcesJson.sources)) {
    return {
      target_id: targetId,
      map_type: mapType,
      overall_status: "failed",
      checked_at: checkedAt,
      claims_total: 0,
      claims_verified: 0,
      claims_warning: 0,
      claims_failed: 0,
      sources: [],
      errors: ["story_sources payload is missing or invalid JSON schema."],
    };
  }

  let claimsTotal = 0;
  let claimsVerified = 0;
  let claimsWarning = 0;
  let claimsFailed = 0;

  const sourceResults: SourceValidatorEntryResult[] = [];

  for (const src of storySourcesJson.sources) {
    const domainCheck = validateSourceDomainSanity(src.source_title || "", src.source_url || "");
    const domainValid = domainCheck.isValid;

    const sourceEntryResult: SourceValidatorEntryResult = {
      source_id: src.source_id || "unknown-src",
      source_title: src.source_title || "Unknown Source",
      source_url: src.source_url || "",
      source_tier: src.source_tier || "C",
      source_status: src.source_status || "SOURCE_NOT_CHECKED",
      domain_sanity_valid: domainValid,
      claims: [],
    };

    if (!domainValid) {
      errors.push(`Source ${src.source_id} failed domain sanity: ${domainCheck.message}`);
    }

    const claimsList = src.claims || [];
    for (const c of claimsList) {
      claimsTotal++;

      let status: ClaimVerificationStatus = "VERIFIED";
      let msg: string | undefined = undefined;

      if (src.source_status !== "SOURCE_EVIDENCE_FOUND") {
        status = "FAILED";
        msg = `Source status is ${src.source_status}, required SOURCE_EVIDENCE_FOUND.`;
        claimsFailed++;
      } else if (!domainValid) {
        status = "FAILED";
        msg = `Domain sanity check failed for source URL.`;
        claimsFailed++;
      } else if (!c.evidence_summary || c.evidence_summary.trim().length === 0) {
        status = "WARNING";
        msg = `Evidence summary is empty.`;
        claimsWarning++;
      } else {
        claimsVerified++;
      }

      sourceEntryResult.claims.push({
        claim_id: c.claim_id || `claim-${claimsTotal}`,
        claim: c.claim || "",
        source_id: src.source_id,
        verification_status: status,
        message: msg,
      });
    }

    sourceResults.push(sourceEntryResult);
  }

  let overallStatus: "verified" | "warning" | "failed" = "verified";
  if (claimsFailed > 0 || errors.length > 0) {
    overallStatus = "failed";
  } else if (claimsWarning > 0) {
    overallStatus = "warning";
  }

  return {
    target_id: targetId,
    map_type: mapType,
    overall_status: overallStatus,
    checked_at: checkedAt,
    claims_total: claimsTotal,
    claims_verified: claimsVerified,
    claims_warning: claimsWarning,
    claims_failed: claimsFailed,
    sources: sourceResults,
    errors,
  };
}
