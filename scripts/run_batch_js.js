// JS wrapper using ts-node to run the canonical batch runner
require('ts-node').register({ transpileOnly: true });
const { runCanonicalMapStoryBatch } = require('../lib/server/mapContentWriter/batchRunner.ts');

(async () => {
  const report = await runCanonicalMapStoryBatch({ requestedCount: 50, operation: 'generation' });
  console.log('=== Batch Report ===');
  console.log(JSON.stringify(report, null, 2));
})();
