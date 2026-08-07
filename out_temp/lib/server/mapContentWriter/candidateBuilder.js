"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.mapStoryCandidateBuilder = void 0;
exports.validateMapStoryCandidateSchema = validateMapStoryCandidateSchema;
exports.detectOpenerMonoculture = detectOpenerMonoculture;
var schemaLayer_ts_1 = require("../ai/schemaLayer.ts");
/**
 * Candidate Builder for Map Content Writer.
 * Serializes raw generated output into canonical 3-key Candidate objects (map_type, target_id, content)
 * matching the exact Admin UI & Admin API bulk importer input contract.
 */
exports.mapStoryCandidateBuilder = new schemaLayer_ts_1.CandidateBuilder(schemaLayer_ts_1.DB_TABLE_SCHEMAS.map_stories, function (raw) { return ({
    map_type: raw.map_type,
    target_id: raw.target_id,
    content: raw.content,
}); });
/**
 * Validates any candidate against canonical map_stories Importer schema (map_type, target_id, content).
 * Triggers STOP-SCHEMA-01 on schema mismatch.
 */
function validateMapStoryCandidateSchema(candidate) {
    return (0, schemaLayer_ts_1.validateCandidateSchema)(candidate, schemaLayer_ts_1.DB_TABLE_SCHEMAS.map_stories);
}
/**
 * Batch-level detection of repetitive story opening phrases (STOP-OPENER-MONOCULTURE).
 * Analyzes the first 2 words of each story across a batch.
 * Flags if more than maxAllowedRepetitions (default 2) share the exact same opening phrase.
 */
function detectOpenerMonoculture(contents, maxAllowedRepetitions) {
    if (maxAllowedRepetitions === void 0) { maxAllowedRepetitions = 2; }
    var openerCounts = new Map();
    for (var _i = 0, contents_1 = contents; _i < contents_1.length; _i++) {
        var text = contents_1[_i];
        var cleanText = text
            .replace(/^[\p{Emoji}\p{Symbol}\uFE0F\u200D\s\p{P}]+/gu, "")
            .trim();
        var words = cleanText.split(/\s+/).slice(0, 2).map(function (w) { return w.toLowerCase(); });
        if (words.length < 2)
            continue;
        var openerKey = words.join(" ");
        openerCounts.set(openerKey, (openerCounts.get(openerKey) || 0) + 1);
    }
    var maxCount = 0;
    var dominantOpener = "";
    for (var _a = 0, _b = openerCounts.entries(); _a < _b.length; _a++) {
        var _c = _b[_a], opener_1 = _c[0], count = _c[1];
        if (count > maxCount) {
            maxCount = count;
            dominantOpener = opener_1;
        }
    }
    if (maxCount > maxAllowedRepetitions) {
        return {
            isDiverse: false,
            duplicateOpenerCount: maxCount,
            dominantOpener: dominantOpener,
            message: "[STOP-OPENER-MONOCULTURE] ".concat(maxCount, " stories in batch start with the exact same phrase \"").concat(dominantOpener, "\". Opener diversity rule violated."),
        };
    }
    return {
        isDiverse: true,
        duplicateOpenerCount: maxCount,
        dominantOpener: dominantOpener,
    };
}
