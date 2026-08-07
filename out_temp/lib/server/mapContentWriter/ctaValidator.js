"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateOpenCTA = validateOpenCTA;
var CLOSED_CTA_PATTERNS = [
    /^\s*хочешь(\s+|$|[.,!?])/i,
    /^\s*хотел(\s+|$|[.,!?])/i,
    /^\s*хотела(\s+|$|[.,!?])/i,
    /^\s*хотели(\s+|$|[.,!?])/i,
    /^\s*нравится(\s+|$|[.,!?])/i,
    /^\s*бывал(\s+|$|[.,!?])/i,
    /^\s*бывала(\s+|$|[.,!?])/i,
    /^\s*видел(\s+|$|[.,!?])/i,
    /^\s*видела(\s+|$|[.,!?])/i,
    /^\s*знаешь(\s+|$|[.,!?])/i,
    /^\s*помнишь(\s+|$|[.,!?])/i,
];
var OPEN_QUESTION_PATTERNS = [
    /^\s*как(\s+|$|[.,!?])/i,
    /^\s*что(\s+|$|[.,!?])/i,
    /^\s*почему(\s+|$|[.,!?])/i,
    /^\s*каким(\s+|$|[.,!?])/i,
    /^\s*какой(\s+|$|[.,!?])/i,
    /^\s*какая(\s+|$|[.,!?])/i,
    /^\s*какое(\s+|$|[.,!?])/i,
    /^\s*какие(\s+|$|[.,!?])/i,
    /^\s*каких(\s+|$|[.,!?])/i,
    /^\s*какую(\s+|$|[.,!?])/i,
    /^\s*какого(\s+|$|[.,!?])/i,
    /^\s*каком(\s+|$|[.,!?])/i,
    /^\s*какому(\s+|$|[.,!?])/i,
    /^\s*зачем(\s+|$|[.,!?])/i,
    /^\s*чем(\s+|$|[.,!?])/i,
    /^\s*чему(\s+|$|[.,!?])/i,
    /^\s*где(\s+|$|[.,!?])/i,
    /^\s*куда(\s+|$|[.,!?])/i,
    /^\s*откуда(\s+|$|[.,!?])/i,
];
/**
 * Validates that the story CTA is a proper open-ended question encouraging thought/reasoning.
 * Blocks closed yes/no questions ("Хочешь...?", "Хотел бы...?").
 */
function validateOpenCTA(content) {
    var _a, _b;
    var trimmed = content.trim();
    if (!trimmed) {
        return {
            isValid: false,
            stopId: "STOP-DOD-01",
            message: "[STOP-DOD-01] Story content is empty.",
        };
    }
    // Split into sentences
    var sentences = trimmed.split(/(?<=[.!?])\s+/).filter(Boolean);
    var lastSentence = (_b = (_a = sentences[sentences.length - 1]) === null || _a === void 0 ? void 0 : _a.trim()) !== null && _b !== void 0 ? _b : "";
    if (!lastSentence.endsWith("?")) {
        return {
            isValid: false,
            stopId: "STOP-DOD-01",
            message: "[STOP-DOD-01] Last sentence must be a question ending with '?'.",
        };
    }
    // Check closed question patterns
    for (var _i = 0, CLOSED_CTA_PATTERNS_1 = CLOSED_CTA_PATTERNS; _i < CLOSED_CTA_PATTERNS_1.length; _i++) {
        var pattern = CLOSED_CTA_PATTERNS_1[_i];
        if (pattern.test(lastSentence)) {
            return {
                isValid: false,
                stopId: "STOP-DOD-01",
                message: "[STOP-DOD-01] Closed CTA question detected (\"".concat(lastSentence, "\"). Question must be open-ended, encouraging reasoning."),
            };
        }
    }
    // Check open question patterns
    var isStartOpen = OPEN_QUESTION_PATTERNS.some(function (p) { return p.test(lastSentence); });
    var hasOpenPhrases = /как ты думаешь/i.test(lastSentence) ||
        /как думаешь/i.test(lastSentence) ||
        /что помогает/i.test(lastSentence) ||
        /каким образом/i.test(lastSentence);
    if (!isStartOpen && !hasOpenPhrases) {
        return {
            isValid: false,
            stopId: "STOP-DOD-01",
            message: "[STOP-DOD-01] CTA question (\"".concat(lastSentence, "\") does not start with an open question word (\u043A\u0430\u043A, \u043F\u043E\u0447\u0435\u043C\u0443, \u0447\u0442\u043E, \u043A\u0430\u043A\u0438\u043C \u043E\u0431\u0440\u0430\u0437\u043E\u043C, \u043A\u0430\u043A\u0438\u0445, etc.)."),
        };
    }
    return { isValid: true };
}
