"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.insertStagedAiDrafts = insertStagedAiDrafts;
var preWriteSafetyLayer_1 = require("./preWriteSafetyLayer");
/**
 * Validates and inserts staged AI drafts into map_stories with strict server-side safeguards.
 * generationBatchId is verified against map_story_batch_logs (status='running') before being written.
 */
function insertStagedAiDrafts(items, supabase, options) {
    return __awaiter(this, void 0, void 0, function () {
        var verifiedBatchId, rawBatchId, _a, batchLog, batchErr, itemResults, rejectionBreakdown, rejectedItems, created, skipped, rejected, failed, _i, items_1, item, rawMapType, rawTargetId, valRes, primaryStop, insertPayload, insertError, isUniqueViolation, err_1;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    verifiedBatchId = null;
                    if (!(options === null || options === void 0 ? void 0 : options.generationBatchId)) return [3 /*break*/, 2];
                    rawBatchId = options.generationBatchId.trim();
                    return [4 /*yield*/, supabase
                            .from("map_story_batch_logs")
                            .select("batch_id, status, operation")
                            .eq("batch_id", rawBatchId)
                            .maybeSingle()];
                case 1:
                    _a = _b.sent(), batchLog = _a.data, batchErr = _a.error;
                    if (batchErr || !batchLog) {
                        throw new Error("Untrusted generation_batch_id \"".concat(rawBatchId, "\": Not found in map_story_batch_logs (FK requirement)."));
                    }
                    if (batchLog.status !== "running") {
                        throw new Error("Invalid generation_batch_id \"".concat(rawBatchId, "\": Batch status is \"").concat(batchLog.status, "\", expected \"running\"."));
                    }
                    if (batchLog.operation !== "generation" && batchLog.operation !== "smoke_test") {
                        throw new Error("Invalid generation_batch_id \"".concat(rawBatchId, "\": Operation is \"").concat(batchLog.operation, "\", expected \"generation\" or \"smoke_test\"."));
                    }
                    verifiedBatchId = rawBatchId;
                    _b.label = 2;
                case 2:
                    itemResults = [];
                    rejectionBreakdown = {};
                    rejectedItems = [];
                    created = 0;
                    skipped = 0;
                    rejected = 0;
                    failed = 0;
                    _i = 0, items_1 = items;
                    _b.label = 3;
                case 3:
                    if (!(_i < items_1.length)) return [3 /*break*/, 9];
                    item = items_1[_i];
                    rawMapType = (typeof (item === null || item === void 0 ? void 0 : item.map_type) === "string" ? item.map_type : typeof (item === null || item === void 0 ? void 0 : item.mapType) === "string" ? item.mapType : "").trim();
                    rawTargetId = (typeof (item === null || item === void 0 ? void 0 : item.target_id) === "string" ? item.target_id : typeof (item === null || item === void 0 ? void 0 : item.targetId) === "string" ? item.targetId : "").trim();
                    return [4 /*yield*/, (0, preWriteSafetyLayer_1.validateMapStoryBeforeWrite)(item, { map_type: rawMapType, target_id: rawTargetId }, supabase)];
                case 4:
                    valRes = _b.sent();
                    if (!valRes.isValid) {
                        primaryStop = valRes.stopConditions[0] || "VALIDATION";
                        rejectionBreakdown[primaryStop] = (rejectionBreakdown[primaryStop] || 0) + 1;
                        rejectedItems.push({
                            target_id: rawTargetId || "unknown",
                            map_type: rawMapType || "unknown",
                            validator: primaryStop,
                            reason: valRes.stopConditions.join(", ") || "Validation Error",
                            description: valRes.errors.join("; ") || "Validation failed before database write",
                        });
                        if (valRes.stopConditions.includes("STOP-META-03")) {
                            skipped += 1;
                            itemResults.push({
                                mapType: rawMapType,
                                targetId: rawTargetId,
                                status: "SKIPPED_EXISTING",
                                error: valRes.errors.join("; "),
                            });
                        }
                        else {
                            rejected += 1;
                            itemResults.push({
                                mapType: rawMapType,
                                targetId: rawTargetId,
                                status: "REJECTED_VALIDATION",
                                error: valRes.errors.join("; "),
                            });
                        }
                        return [3 /*break*/, 8];
                    }
                    if (!((options === null || options === void 0 ? void 0 : options.dryRunOnly) === true)) return [3 /*break*/, 5];
                    created += 1;
                    itemResults.push({
                        mapType: rawMapType,
                        targetId: rawTargetId,
                        status: "CREATED",
                        error: "DRY_RUN_SIMULATION",
                    });
                    return [3 /*break*/, 8];
                case 5:
                    _b.trys.push([5, 7, , 8]);
                    insertPayload = {
                        type: rawMapType,
                        target_id: rawTargetId,
                        language: "ru",
                        content: valRes.candidate.content,
                        is_approved: false, // Server-forced draft status
                        auto_generated: true, // Server-forced AI flag
                        auto_generation_model: "antigravity-ide", // Server-forced model metadata
                    };
                    if (verifiedBatchId) {
                        insertPayload.generation_batch_id = verifiedBatchId;
                    }
                    return [4 /*yield*/, supabase.from("map_stories").insert(insertPayload)];
                case 6:
                    insertError = (_b.sent()).error;
                    if (insertError) {
                        isUniqueViolation = insertError.code === "23505" ||
                            insertError.message.toLowerCase().includes("unique") ||
                            insertError.message.toLowerCase().includes("already exists");
                        if (isUniqueViolation) {
                            skipped += 1;
                            itemResults.push({
                                mapType: rawMapType,
                                targetId: rawTargetId,
                                status: "SKIPPED_EXISTING",
                                error: "Story already exists in map_stories (UNIQUE constraint caught)",
                            });
                        }
                        else {
                            failed += 1;
                            itemResults.push({
                                mapType: rawMapType,
                                targetId: rawTargetId,
                                status: "FAILED_WRITE",
                                error: insertError.message,
                            });
                        }
                    }
                    else {
                        created += 1;
                        itemResults.push({
                            mapType: rawMapType,
                            targetId: rawTargetId,
                            status: "CREATED",
                        });
                    }
                    return [3 /*break*/, 8];
                case 7:
                    err_1 = _b.sent();
                    failed += 1;
                    itemResults.push({
                        mapType: rawMapType,
                        targetId: rawTargetId,
                        status: "FAILED_WRITE",
                        error: err_1 instanceof Error ? err_1.message : String(err_1),
                    });
                    return [3 /*break*/, 8];
                case 8:
                    _i++;
                    return [3 /*break*/, 3];
                case 9: return [2 /*return*/, {
                        created: created,
                        skipped: skipped,
                        rejected: rejected,
                        failed: failed,
                        itemResults: itemResults,
                        rejectionBreakdown: rejectionBreakdown,
                        rejectedItems: rejectedItems,
                    }];
            }
        });
    });
}
