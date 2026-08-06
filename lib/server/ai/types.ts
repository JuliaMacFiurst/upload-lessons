export type SkillLifecycleStatus =
  | "RESEARCH"
  | "SPECIFICATION"
  | "IMPLEMENTED"
  | "VALIDATION"
  | "PILOT"
  | "LIMITED"
  | "PRODUCTION_READY";

export type MutationCapability = "NO_WRITE" | "ADMIN_API_ONLY" | "PRODUCTION";

export type ContentCapability = "DRY_RUN_ONLY" | "PILOT_APPROVED" | "PRODUCTION_APPROVED";

export type SkillRegistryEntry = {
  id: string;
  displayName: string;
  version: string;
  status: SkillLifecycleStatus;
  lifecycle: SkillLifecycleStatus;
  entry: string;
  contract: string;
  validationRecord: string;
  ownerDecision?: string;
  owner: string;
  mutation: MutationCapability;
  content: ContentCapability;
  supportedLanguages: string[];
  supportedCommands: string[];
  metadata?: Record<string, unknown>;
};

export type SkillRegistry = {
  version: string;
  updatedAt: string;
  skills: Record<string, SkillRegistryEntry>;
};

export type StopConditionCategory =
  | "METADATA"
  | "TYPE"
  | "RESEARCH"
  | "FACT"
  | "KIDS"
  | "LANGUAGE"
  | "SCHEMA"
  | "DOD"
  | "DOCS"
  | "SAFETY";

export type StopCondition = {
  id: string;
  category: StopConditionCategory;
  description: string;
  stage: string;
  expectedBehavior: string;
  relatedTest: string;
};

export type ConfidenceScoreBreakdown = {
  factualScore: number;
  languageScore: number;
  dodScore: number;
  retryPenalty: number;
  finalScorePercentage: number;
  band: "HIGH" | "MEDIUM" | "LOW" | "REJECTED";
};

export type QueueJobStatus =
  | "PENDING"
  | "PROCESSING"
  | "COMPLETED"
  | "FAILED"
  | "PAUSED"
  | "SKIPPED";

export type QueueJobItem<TInput = unknown, TOutput = unknown> = {
  id: string;
  jobId: string;
  targetId: string;
  input: TInput;
  output?: TOutput;
  status: QueueJobStatus;
  attempts: number;
  maxAttempts: number;
  confidenceScore?: ConfidenceScoreBreakdown;
  stopConditionsTriggered: string[];
  metadata?: Record<string, unknown>;
  error?: string;
  createdAt: string;
  updatedAt: string;
};

export type QueueBatchJob = {
  id: string;
  skillId: string;
  title: string;
  totalItems: number;
  processedItems: number;
  successfulItems: number;
  failedItems: number;
  status: QueueJobStatus;
  checkpointFile: string;
  createdAt: string;
  updatedAt: string;
};
