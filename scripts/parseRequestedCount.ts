// scripts/parseRequestedCount.ts
/**
 * Parse the requested count for factory commands.
 *
 * Precedence:
 *   1️⃣ CLI positional argument (process.argv[2])
 *   2️⃣ REQUESTED_COUNT environment variable
 *   3️⃣ Default value of 50
 *
 * Validation:
 *   - Must be an integer
 *   - Must be > 0
 *   - Upper bound is 10,000 (arbitrary safe limit)
 *
 * Throws an Error with a clear message if validation fails.
 */
export function parseRequestedCount(
  argv: string[],
  env: NodeJS.ProcessEnv
): number {
  const rawCli = argv[2];
  const rawEnv = env.REQUESTED_COUNT;
  const raw = rawCli !== undefined ? rawCli : rawEnv;
  const source = rawCli !== undefined ? "CLI" : rawEnv !== undefined ? "ENV" : "DEFAULT";
  if (source === "DEFAULT") {
    return 50;
  }
  const num = Number(raw);
  if (!Number.isFinite(num) || Number.isNaN(num)) {
    throw new Error(`Invalid requested count "${raw}" – not a number (source: ${source})`);
  }
  if (!Number.isInteger(num)) {
    throw new Error(`Invalid requested count "${raw}" – must be an integer (source: ${source})`);
  }
  if (num <= 0) {
    throw new Error(`Invalid requested count "${raw}" – must be greater than 0 (source: ${source})`);
  }
  const MAX = 10000;
  if (num > MAX) {
    throw new Error(`Invalid requested count "${raw}" – exceeds maximum allowed (${MAX}) (source: ${source})`);
  }
  return num;
}
