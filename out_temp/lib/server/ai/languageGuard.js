"use strict";
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_LATIN_ALLOWLIST = void 0;
exports.validateRussianLanguagePurity = validateRussianLanguagePurity;
/**
 * Standard default allowlist for Latin tokens in Russian content.
 * Can be extended explicitly per contract/type rules.
 */
exports.DEFAULT_LATIN_ALLOWLIST = [
    "GPS",
    "UNESCO",
    "UTC",
    "UNESCO-MAB",
    "km",
    "m",
    "cm",
    "mm",
];
/**
 * Checks Russian content for unauthorized Latin tokens (STOP-LANG-01).
 * Supports explicit allowlist.
 */
function validateRussianLanguagePurity(content, customAllowlist) {
    var _a;
    if (customAllowlist === void 0) { customAllowlist = []; }
    var allowlistSet = new Set(__spreadArray(__spreadArray([], exports.DEFAULT_LATIN_ALLOWLIST, true), customAllowlist, true).map(function (t) { return t.toLowerCase(); }));
    // Extract words containing at least one Latin character [a-zA-Z]
    // Handles punctuation surrounding words cleanly
    var latinWordRegex = /[a-zA-Zа-яА-ЯёЁ]*[a-zA-Z]+[a-zA-Zа-яА-ЯёЁ]*/gu;
    var matches = Array.from(content.matchAll(latinWordRegex));
    var offendingTokens = [];
    var excerpts = [];
    for (var _i = 0, matches_1 = matches; _i < matches_1.length; _i++) {
        var match = matches_1[_i];
        var rawToken = match[0];
        var index = (_a = match.index) !== null && _a !== void 0 ? _a : 0;
        // Clean leading/trailing non-alphanumeric punctuation
        var cleanedToken = rawToken.replace(/^[^a-zA-Z]+|[^a-zA-Z]+$/g, "");
        if (!cleanedToken)
            continue;
        if (!allowlistSet.has(cleanedToken.toLowerCase())) {
            offendingTokens.push(cleanedToken);
            // Extract 25-char context snippet around the token
            var start = Math.max(0, index - 15);
            var end = Math.min(content.length, index + rawToken.length + 15);
            var snippet = content.slice(start, end).replace(/\n/g, " ");
            excerpts.push("\"...".concat(snippet, "...\""));
        }
    }
    if (offendingTokens.length > 0) {
        var uniqueTokens = Array.from(new Set(offendingTokens));
        return {
            isValid: false,
            stopId: "STOP-LANG-01",
            offendingTokens: uniqueTokens,
            excerpts: excerpts,
            message: "[STOP-LANG-01] Russian content contains unauthorized Latin tokens: ".concat(uniqueTokens
                .map(function (t) { return "\"".concat(t, "\""); })
                .join(", "), ". Context snippets: ").concat(excerpts.join("; ")),
        };
    }
    return {
        isValid: true,
        offendingTokens: [],
        excerpts: [],
    };
}
