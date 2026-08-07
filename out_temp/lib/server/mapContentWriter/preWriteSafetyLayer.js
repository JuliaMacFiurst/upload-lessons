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
exports.validateMapStoryBeforeWrite = validateMapStoryBeforeWrite;
var schemaLayer_ts_1 = require("../ai/schemaLayer.ts");
var languageGuard_ts_1 = require("../ai/languageGuard.ts");
var ctaValidator_ts_1 = require("./ctaValidator.ts");
var candidateBuilder_ts_1 = require("./candidateBuilder.ts");
/**
 * Universal Pre-Write Safety Layer for Map Content Writer.
 * Runs 6 mandatory safety checks before any Admin API write request:
 * 1. Schema Validation (STOP-SCHEMA-01)
 * 2. Immutable Target Contract (STOP-META-01)
 * 3. Target Existence in map_targets (STOP-META-02)
 * 4. Duplicate Check in map_stories (STOP-META-03)
 * 5. Russian Language Purity (STOP-LANG-01)
 * 6. Definition of Done Quality Checks (STOP-DOD-01)
 */
function validateMapStoryBeforeWrite(candidateInput_1, expectedTarget_1, supabase_1) {
    return __awaiter(this, arguments, void 0, function (candidateInput, expectedTarget, supabase, customAllowlist, options) {
        var stopConditions, errors, schemaRes, mapType, targetId, content, _a, targetRow, targetError, _b, existingStory, storyError, langRes, ctaRes, wordCount, sentences, emojiRegex, built;
        var _c, _d, _e;
        if (customAllowlist === void 0) { customAllowlist = []; }
        if (options === void 0) { options = {}; }
        return __generator(this, function (_f) {
            switch (_f.label) {
                case 0:
                    stopConditions = [];
                    errors = [];
                    schemaRes = (0, schemaLayer_ts_1.validateCandidateSchema)(candidateInput, schemaLayer_ts_1.DB_TABLE_SCHEMAS.map_stories);
                    if (!schemaRes.isValid) {
                        stopConditions.push("STOP-SCHEMA-01");
                        if (schemaRes.message)
                            errors.push(schemaRes.message);
                        return [2 /*return*/, { isValid: false, stopConditions: stopConditions, errors: errors }];
                    }
                    mapType = String((_c = candidateInput.map_type) !== null && _c !== void 0 ? _c : "");
                    targetId = String((_d = candidateInput.target_id) !== null && _d !== void 0 ? _d : "");
                    content = String((_e = candidateInput.content) !== null && _e !== void 0 ? _e : "");
                    // 2. Immutable Target Contract Guard (STOP-META-01)
                    if (targetId !== expectedTarget.target_id || mapType !== expectedTarget.map_type) {
                        stopConditions.push("STOP-META-01");
                        errors.push("[STOP-META-01] Target contract mismatch: expected (".concat(expectedTarget.map_type, ", \"").concat(expectedTarget.target_id, "\"), got (").concat(mapType, ", \"").concat(targetId, "\")"));
                        return [2 /*return*/, { isValid: false, stopConditions: stopConditions, errors: errors }];
                    }
                    return [4 /*yield*/, supabase
                            .from("map_targets")
                            .select("map_type,target_id")
                            .eq("map_type", mapType)
                            .eq("target_id", targetId)
                            .maybeSingle()];
                case 1:
                    _a = _f.sent(), targetRow = _a.data, targetError = _a.error;
                    if (targetError || !targetRow) {
                        stopConditions.push("STOP-META-02");
                        errors.push("[STOP-META-02] Target (".concat(mapType, ", \"").concat(targetId, "\") does not exist in map_targets table."));
                        return [2 /*return*/, { isValid: false, stopConditions: stopConditions, errors: errors }];
                    }
                    if (!!options.allowOverwrite) return [3 /*break*/, 3];
                    return [4 /*yield*/, supabase
                            .from("map_stories")
                            .select("id")
                            .eq("type", mapType)
                            .eq("target_id", targetId)
                            .eq("language", "ru")
                            .maybeSingle()];
                case 2:
                    _b = _f.sent(), existingStory = _b.data, storyError = _b.error;
                    if (storyError) {
                        errors.push("Failed to check existing story: ".concat(storyError.message));
                        return [2 /*return*/, { isValid: false, stopConditions: stopConditions, errors: errors }];
                    }
                    if (existingStory === null || existingStory === void 0 ? void 0 : existingStory.id) {
                        stopConditions.push("STOP-META-03");
                        errors.push("[STOP-META-03] Story already exists in map_stories for (".concat(mapType, ", \"").concat(targetId, "\", language='ru'). Direct overwrite is FORBIDDEN."));
                        return [2 /*return*/, { isValid: false, stopConditions: stopConditions, errors: errors }];
                    }
                    _f.label = 3;
                case 3:
                    langRes = (0, languageGuard_ts_1.validateRussianLanguagePurity)(content, customAllowlist);
                    if (!langRes.isValid) {
                        stopConditions.push("STOP-LANG-01");
                        if (langRes.message)
                            errors.push(langRes.message);
                        return [2 /*return*/, { isValid: false, stopConditions: stopConditions, errors: errors }];
                    }
                    ctaRes = (0, ctaValidator_ts_1.validateOpenCTA)(content);
                    if (!ctaRes.isValid) {
                        stopConditions.push("STOP-DOD-01");
                        if (ctaRes.message)
                            errors.push(ctaRes.message);
                    }
                    wordCount = content.trim().split(/\s+/).filter(Boolean).length;
                    if (wordCount < 80 || wordCount > 140) {
                        stopConditions.push("STOP-DOD-01");
                        errors.push("[STOP-DOD-01] Word count is ".concat(wordCount, " (outside hard range 80\u2013140 words)."));
                    }
                    sentences = content.split(/(?<=[.!?])\s+/);
                    emojiRegex = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu;
                    sentences.forEach(function (sentence, sIdx) {
                        var matches = sentence.match(emojiRegex);
                        if (sIdx > 0 && matches && matches.length > 0) {
                            stopConditions.push("STOP-DOD-01");
                            errors.push("[STOP-DOD-01] Emoji found in sentence ".concat(sIdx + 1, " (allowed ONLY in sentence 1)."));
                        }
                        if (sIdx === 0 && matches && matches.length > 1) {
                            stopConditions.push("STOP-DOD-01");
                            errors.push("[STOP-DOD-01] ".concat(matches.length, " emojis found in sentence 1 (maximum 1 emoji allowed)."));
                        }
                    });
                    if (stopConditions.length > 0) {
                        return [2 /*return*/, { isValid: false, stopConditions: stopConditions, errors: errors }];
                    }
                    built = candidateBuilder_ts_1.mapStoryCandidateBuilder.buildAndValidate({
                        map_type: mapType,
                        target_id: targetId,
                        content: content,
                    });
                    return [2 /*return*/, {
                            isValid: true,
                            candidate: built.candidate,
                            stopConditions: [],
                            errors: [],
                        }];
            }
        });
    });
}
