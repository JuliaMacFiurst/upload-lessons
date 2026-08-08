export type FieldType = "string" | "number" | "boolean" | "object" | "array";

export type FieldConstraint = {
  name: string;
  type: FieldType;
  required: boolean;
  allowEmptyString?: boolean;
  allowedValues?: string[];
};

export type TableSchemaDefinition = {
  tableName: string;
  targetDatabaseTable: string;
  primaryKey: string[];
  requiredFields: FieldConstraint[];
  optionalFields?: FieldConstraint[];
};

export type SchemaValidationResult = {
  isValid: boolean;
  tableName: string;
  stopId?: "STOP-SCHEMA-01";
  missingFields: string[];
  typeErrors: string[];
  unknownFields: string[];
  message?: string;
};

/**
 * Universal Database Table Candidate Schema Registry across all LapLapLa domain tables.
 * Reflects the actual Importer & Admin API input contract for each domain table.
 */
export const DB_TABLE_SCHEMAS: Record<string, TableSchemaDefinition> = {
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
    optionalFields: [
      { name: "story_sources", type: "object", required: false },
      { name: "source_validation_status", type: "string", required: false },
      { name: "source_validated_at", type: "string", required: false },
      { name: "source_validation_version", type: "number", required: false },
      { name: "needs_rewrite", type: "boolean", required: false },
      { name: "content_version", type: "number", required: false },
    ],
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
export function validateCandidateSchema(
  candidate: Record<string, unknown>,
  schema: TableSchemaDefinition
): SchemaValidationResult {
  const missingFields: string[] = [];
  const typeErrors: string[] = [];
  const unknownFields: string[] = [];

  const allowedFieldNames = new Set([
    ...schema.requiredFields.map((f) => f.name),
    ...(schema.optionalFields?.map((f) => f.name) ?? []),
  ]);

  // Check unknown extra fields
  for (const key of Object.keys(candidate)) {
    if (!allowedFieldNames.has(key)) {
      unknownFields.push(key);
    }
  }

  // Check required fields
  for (const field of schema.requiredFields) {
    const val = candidate[field.name];

    if (val === undefined || val === null) {
      missingFields.push(field.name);
      continue;
    }

    // Check type
    if (field.type === "array") {
      if (!Array.isArray(val)) {
        typeErrors.push(`Field "${field.name}" must be an array, got ${typeof val}`);
      }
    } else if (typeof val !== field.type) {
      typeErrors.push(`Field "${field.name}" must be type ${field.type}, got ${typeof val}`);
    }

    // Check empty string constraint
    if (field.type === "string" && field.allowEmptyString === false) {
      if (typeof val === "string" && val.trim().length === 0) {
        typeErrors.push(`Field "${field.name}" cannot be empty`);
      }
    }

    // Check allowed values (enum check)
    if (field.allowedValues && typeof val === "string") {
      if (!field.allowedValues.includes(val)) {
        typeErrors.push(
          `Field "${field.name}" value "${val}" is not in allowed list [${field.allowedValues.join(", ")}]`
        );
      }
    }
  }

  if (missingFields.length > 0 || typeErrors.length > 0 || unknownFields.length > 0) {
    const details: string[] = [];
    if (missingFields.length > 0) details.push(`Missing fields: [${missingFields.join(", ")}]`);
    if (typeErrors.length > 0) details.push(`Type errors: [${typeErrors.join("; ")}]`);
    if (unknownFields.length > 0) details.push(`Unknown extra fields: [${unknownFields.join(", ")}]`);

    return {
      isValid: false,
      tableName: schema.tableName,
      stopId: "STOP-SCHEMA-01",
      missingFields,
      typeErrors,
      unknownFields,
      message: `[STOP-SCHEMA-01] Candidate schema validation failed for table "${schema.tableName}". ${details.join(". ")}`,
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
export class CandidateBuilder<TRaw extends Record<string, unknown>, TCandidate extends Record<string, unknown>> {
  private schema: TableSchemaDefinition;
  private transformFn: (raw: TRaw) => TCandidate;

  constructor(
    schema: TableSchemaDefinition,
    transformFn: (raw: TRaw) => TCandidate
  ) {
    this.schema = schema;
    this.transformFn = transformFn;
  }

  public buildAndValidate(raw: TRaw): {
    candidate?: TCandidate;
    validation: SchemaValidationResult;
  } {
    const candidate = this.transformFn(raw);
    const validation = validateCandidateSchema(candidate, this.schema);

    if (!validation.isValid) {
      return { validation };
    }

    return { candidate, validation };
  }
}
