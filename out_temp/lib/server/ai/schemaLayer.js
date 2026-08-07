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
exports.CandidateBuilder = exports.DB_TABLE_SCHEMAS = void 0;
exports.validateCandidateSchema = validateCandidateSchema;
/**
 * Universal Database Table Candidate Schema Registry across all LapLapLa domain tables.
 * Reflects the actual Importer & Admin API input contract for each domain table.
 */
exports.DB_TABLE_SCHEMAS = {
    map_stories: {
        tableName: "map_stories",
        targetDatabaseTable: "map_stories",
        primaryKey: ["map_type", "target_id"],
        requiredFields: [
            {
                name: "map_type",
                type: "string",
                required: true,
                allowEmptyString: false,
                allowedValues: [
                    "country",
                    "flag",
                    "culture",
                    "food",
                    "river",
                    "sea",
                    "animal",
                    "weather",
                    "physic",
                ],
            },
            { name: "target_id", type: "string", required: true, allowEmptyString: false },
            { name: "content", type: "string", required: true, allowEmptyString: false },
        ],
        optionalFields: [],
    },
    content_translations: {
        tableName: "content_translations",
        targetDatabaseTable: "content_translations",
        primaryKey: ["content_type", "content_id", "language"],
        requiredFields: [
            { name: "content_type", type: "string", required: true, allowEmptyString: false },
            { name: "content_id", type: "string", required: true, allowEmptyString: false },
            { name: "language", type: "string", required: true, allowEmptyString: false, allowedValues: ["en", "he"] },
            { name: "translation", type: "object", required: true },
        ],
    },
    books: {
        tableName: "books",
        targetDatabaseTable: "books",
        primaryKey: ["slug"],
        requiredFields: [
            { name: "title", type: "string", required: true, allowEmptyString: false },
            { name: "slug", type: "string", required: true, allowEmptyString: false },
            { name: "description", type: "string", required: true, allowEmptyString: false },
        ],
    },
};
/**
 * Validates any candidate object against its target table schema definition.
 * Triggers STOP-SCHEMA-01 if required fields are missing, invalidly typed, empty, or unknown extra fields exist.
 */
function validateCandidateSchema(candidate, schema) {
    var _a, _b;
    var missingFields = [];
    var typeErrors = [];
    var unknownFields = [];
    var allowedFieldNames = new Set(__spreadArray(__spreadArray([], schema.requiredFields.map(function (f) { return f.name; }), true), ((_b = (_a = schema.optionalFields) === null || _a === void 0 ? void 0 : _a.map(function (f) { return f.name; })) !== null && _b !== void 0 ? _b : []), true));
    // Check unknown extra fields
    for (var _i = 0, _c = Object.keys(candidate); _i < _c.length; _i++) {
        var key = _c[_i];
        if (!allowedFieldNames.has(key)) {
            unknownFields.push(key);
        }
    }
    // Check required fields
    for (var _d = 0, _e = schema.requiredFields; _d < _e.length; _d++) {
        var field = _e[_d];
        var val = candidate[field.name];
        if (val === undefined || val === null) {
            missingFields.push(field.name);
            continue;
        }
        // Check type
        if (field.type === "array") {
            if (!Array.isArray(val)) {
                typeErrors.push("Field \"".concat(field.name, "\" must be an array, got ").concat(typeof val));
            }
        }
        else if (typeof val !== field.type) {
            typeErrors.push("Field \"".concat(field.name, "\" must be type ").concat(field.type, ", got ").concat(typeof val));
        }
        // Check empty string constraint
        if (field.type === "string" && field.allowEmptyString === false) {
            if (typeof val === "string" && val.trim().length === 0) {
                typeErrors.push("Field \"".concat(field.name, "\" cannot be empty"));
            }
        }
        // Check allowed values (enum check)
        if (field.allowedValues && typeof val === "string") {
            if (!field.allowedValues.includes(val)) {
                typeErrors.push("Field \"".concat(field.name, "\" value \"").concat(val, "\" is not in allowed list [").concat(field.allowedValues.join(", "), "]"));
            }
        }
    }
    if (missingFields.length > 0 || typeErrors.length > 0 || unknownFields.length > 0) {
        var details = [];
        if (missingFields.length > 0)
            details.push("Missing fields: [".concat(missingFields.join(", "), "]"));
        if (typeErrors.length > 0)
            details.push("Type errors: [".concat(typeErrors.join("; "), "]"));
        if (unknownFields.length > 0)
            details.push("Unknown extra fields: [".concat(unknownFields.join(", "), "]"));
        return {
            isValid: false,
            tableName: schema.tableName,
            stopId: "STOP-SCHEMA-01",
            missingFields: missingFields,
            typeErrors: typeErrors,
            unknownFields: unknownFields,
            message: "[STOP-SCHEMA-01] Candidate schema validation failed for table \"".concat(schema.tableName, "\". ").concat(details.join(". ")),
        };
    }
    return {
        isValid: true,
        tableName: schema.tableName,
        missingFields: [],
        typeErrors: [],
        unknownFields: [],
    };
}
/**
 * Candidate Builder Interface for Factories.
 * Transforms raw Skill generation output into deterministic, canonical Importer Candidate objects.
 */
var CandidateBuilder = /** @class */ (function () {
    function CandidateBuilder(schema, transformFn) {
        this.schema = schema;
        this.transformFn = transformFn;
    }
    CandidateBuilder.prototype.buildAndValidate = function (raw) {
        var candidate = this.transformFn(raw);
        var validation = validateCandidateSchema(candidate, this.schema);
        if (!validation.isValid) {
            return { validation: validation };
        }
        return { candidate: candidate, validation: validation };
    };
    return CandidateBuilder;
}());
exports.CandidateBuilder = CandidateBuilder;
