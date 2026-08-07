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
exports.getAdminSupabaseClient = getAdminSupabaseClient;
exports.runCanonicalMapStoryBatch = runCanonicalMapStoryBatch;
var fs_1 = require("fs");
var path_1 = require("path");
var supabase_js_1 = require("@supabase/supabase-js");
var candidateBuilder_1 = require("./candidateBuilder");
var stagedAiDraftWriter_1 = require("./stagedAiDraftWriter");
var canonicalStoryGenerator_1 = require("./canonicalStoryGenerator");
function loadEnvLocal() {
    var envPath = path_1.default.join(process.cwd(), ".env.local");
    if (fs_1.default.existsSync(envPath)) {
        var content = fs_1.default.readFileSync(envPath, "utf-8");
        content.split("\n").forEach(function (line) {
            var trimmed = line.trim();
            if (trimmed && !trimmed.startsWith("#") && trimmed.includes("=")) {
                var _a = trimmed.split("="), key = _a[0], valParts = _a.slice(1);
                var val = valParts.join("=").trim().replace(/^["']|["']$/g, "");
                if (key && !process.env[key.trim()]) {
                    process.env[key.trim()] = val;
                }
            }
        });
    }
}
function getAdminSupabaseClient() {
    loadEnvLocal();
    var url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
    var serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !serviceKey) {
        throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    }
    return (0, supabase_js_1.createClient)(url, serviceKey);
}
/**
 * Canonical Map Story Content Factory Batch Runner.
 * Sole owner and generator of batch_id. Guaranteed lifecycle:
 * status='running' -> execution -> status='completed' (or status='failed').
 */
function runCanonicalMapStoryBatch(options, customSupabase) {
    return __awaiter(this, void 0, void 0, function () {
        var startTime, supabase, requestedCount, operation, mapTypeFilter, dryRunOnly, randomSuffix, batchId, logInitErr, queueQuery, _a, queueTargets, totalQueueCount, queueErr, targetsToProcess, queueBeforeCount, durationMs_1, candidatesToInsert, i, target, name_1, content, built, stagedResults_1, chunkSize, i, chunk, chunkRes, durationMs, afterQuery, queueAfterCount, updateErr, reportDir, reportPath, fatalError_1, durationMs;
        var _b, _c;
        var _d, _e, _f, _g;
        return __generator(this, function (_h) {
            switch (_h.label) {
                case 0:
                    startTime = Date.now();
                    supabase = customSupabase || getAdminSupabaseClient();
                    requestedCount = (_d = options === null || options === void 0 ? void 0 : options.requestedCount) !== null && _d !== void 0 ? _d : 50;
                    operation = (_e = options === null || options === void 0 ? void 0 : options.operation) !== null && _e !== void 0 ? _e : "generation";
                    mapTypeFilter = (_f = options === null || options === void 0 ? void 0 : options.mapTypeFilter) === null || _f === void 0 ? void 0 : _f.trim();
                    dryRunOnly = (_g = options === null || options === void 0 ? void 0 : options.dryRunOnly) !== null && _g !== void 0 ? _g : false;
                    randomSuffix = Math.random().toString(36).substring(2, 7);
                    batchId = "batch-".concat(Date.now(), "-").concat(randomSuffix);
                    return [4 /*yield*/, supabase.from("map_story_batch_logs").insert({
                            batch_id: batchId,
                            requested: requestedCount,
                            inserted: 0,
                            rejected: 0,
                            duplicate: 0,
                            db_errors: 0,
                            duration_ms: 0,
                            rejection_breakdown: {},
                            rejected_items: [],
                            model: "antigravity-ide",
                            status: "running",
                            operation: operation,
                            updated_count: 0,
                        })];
                case 1:
                    logInitErr = (_h.sent()).error;
                    if (logInitErr) {
                        throw new Error("Failed to initialize running log for batch ".concat(batchId, ": ").concat(logInitErr.message));
                    }
                    _h.label = 2;
                case 2:
                    _h.trys.push([2, 12, , 14]);
                    queueQuery = supabase
                        .from("map_story_generation_queue")
                        .select("map_type, target_id, title_ru, title_en", { count: "exact" });
                    if (mapTypeFilter) {
                        queueQuery = queueQuery.eq("map_type", mapTypeFilter);
                    }
                    return [4 /*yield*/, queueQuery.limit(requestedCount)];
                case 3:
                    _a = _h.sent(), queueTargets = _a.data, totalQueueCount = _a.count, queueErr = _a.error;
                    if (queueErr) {
                        throw new Error("Failed to fetch generation queue: ".concat(queueErr.message));
                    }
                    targetsToProcess = queueTargets || [];
                    queueBeforeCount = totalQueueCount !== null && totalQueueCount !== void 0 ? totalQueueCount : targetsToProcess.length;
                    if (!(targetsToProcess.length === 0)) return [3 /*break*/, 5];
                    durationMs_1 = Date.now() - startTime;
                    return [4 /*yield*/, supabase
                            .from("map_story_batch_logs")
                            .update({
                            status: "completed",
                            duration_ms: durationMs_1,
                        })
                            .eq("batch_id", batchId)];
                case 4:
                    _h.sent();
                    return [2 /*return*/, {
                            batchId: batchId,
                            operation: operation,
                            status: "completed",
                            requested: requestedCount,
                            inserted: 0,
                            rejected: 0,
                            duplicate: 0,
                            dbErrors: 0,
                            durationMs: durationMs_1,
                            queueBeforeCount: queueBeforeCount,
                            queueAfterCount: queueBeforeCount,
                            stagedWriteResults: {
                                created: 0,
                                skipped: 0,
                                rejected: 0,
                                failed: 0,
                                itemResults: [],
                                rejectionBreakdown: {},
                                rejectedItems: [],
                            },
                        }];
                case 5:
                    candidatesToInsert = [];
                    for (i = 0; i < targetsToProcess.length; i++) {
                        target = targetsToProcess[i];
                        name_1 = target.title_ru || target.title_en || target.target_id;
                        content = (0, canonicalStoryGenerator_1.generateCanonicalStoryText)(target.map_type, target.target_id, name_1, i);
                        built = candidateBuilder_1.mapStoryCandidateBuilder.buildAndValidate({
                            map_type: target.map_type,
                            target_id: target.target_id,
                            content: content,
                        });
                        if (built.candidate) {
                            candidatesToInsert.push({
                                map_type: built.candidate.map_type,
                                target_id: built.candidate.target_id,
                                content: built.candidate.content,
                            });
                        }
                    }
                    stagedResults_1 = {
                        created: 0,
                        skipped: 0,
                        rejected: 0,
                        failed: 0,
                        itemResults: [],
                        rejectionBreakdown: {},
                        rejectedItems: [],
                    };
                    chunkSize = 5;
                    i = 0;
                    _h.label = 6;
                case 6:
                    if (!(i < candidatesToInsert.length)) return [3 /*break*/, 9];
                    chunk = candidatesToInsert.slice(i, i + chunkSize);
                    return [4 /*yield*/, (0, stagedAiDraftWriter_1.insertStagedAiDrafts)(chunk, supabase, {
                            generationBatchId: batchId,
                            dryRunOnly: dryRunOnly,
                        })];
                case 7:
                    chunkRes = _h.sent();
                    stagedResults_1.created += chunkRes.created;
                    stagedResults_1.skipped += chunkRes.skipped;
                    stagedResults_1.rejected += chunkRes.rejected;
                    stagedResults_1.failed += chunkRes.failed;
                    (_b = stagedResults_1.itemResults).push.apply(_b, chunkRes.itemResults);
                    Object.entries(chunkRes.rejectionBreakdown).forEach(function (_a) {
                        var key = _a[0], count = _a[1];
                        stagedResults_1.rejectionBreakdown[key] = (stagedResults_1.rejectionBreakdown[key] || 0) + count;
                    });
                    (_c = stagedResults_1.rejectedItems).push.apply(_c, chunkRes.rejectedItems);
                    _h.label = 8;
                case 8:
                    i += chunkSize;
                    return [3 /*break*/, 6];
                case 9:
                    durationMs = Date.now() - startTime;
                    afterQuery = supabase.from("map_story_generation_queue").select("*", { count: "exact", head: true });
                    if (mapTypeFilter)
                        afterQuery = afterQuery.eq("map_type", mapTypeFilter);
                    return [4 /*yield*/, afterQuery];
                case 10:
                    queueAfterCount = (_h.sent()).count;
                    return [4 /*yield*/, supabase
                            .from("map_story_batch_logs")
                            .update({
                            inserted: stagedResults_1.created,
                            rejected: stagedResults_1.rejected,
                            duplicate: stagedResults_1.skipped,
                            db_errors: stagedResults_1.failed,
                            duration_ms: durationMs,
                            rejection_breakdown: stagedResults_1.rejectionBreakdown,
                            rejected_items: stagedResults_1.rejectedItems,
                            status: "completed",
                        })
                            .eq("batch_id", batchId)];
                case 11:
                    updateErr = (_h.sent()).error;
                    if (updateErr) {
                        console.warn("[BatchRunner] Failed to finalize completed log for batch ".concat(batchId, ":"), updateErr.message);
                    }
                    reportDir = path_1.default.join(process.cwd(), ".pilot-reports");
                    if (!fs_1.default.existsSync(reportDir))
                        fs_1.default.mkdirSync(reportDir, { recursive: true });
                    reportPath = path_1.default.join(reportDir, "canonical-batch-".concat(batchId, ".json"));
                    fs_1.default.writeFileSync(reportPath, JSON.stringify({ batchId: batchId, operation: operation, durationMs: durationMs, stagedResults: stagedResults_1 }, null, 2));
                    return [2 /*return*/, {
                            batchId: batchId,
                            operation: operation,
                            status: "completed",
                            requested: targetsToProcess.length,
                            inserted: stagedResults_1.created,
                            rejected: stagedResults_1.rejected,
                            duplicate: stagedResults_1.skipped,
                            dbErrors: stagedResults_1.failed,
                            durationMs: durationMs,
                            queueBeforeCount: queueBeforeCount,
                            queueAfterCount: queueAfterCount !== null && queueAfterCount !== void 0 ? queueAfterCount : (queueBeforeCount - stagedResults_1.created),
                            stagedWriteResults: stagedResults_1,
                        }];
                case 12:
                    fatalError_1 = _h.sent();
                    durationMs = Date.now() - startTime;
                    return [4 /*yield*/, supabase
                            .from("map_story_batch_logs")
                            .update({
                            status: "failed",
                            duration_ms: durationMs,
                        })
                            .eq("batch_id", batchId)];
                case 13:
                    _h.sent();
                    throw fatalError_1;
                case 14: return [2 /*return*/];
            }
        });
    });
}
