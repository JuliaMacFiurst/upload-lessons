import fs from "fs";
import path from "path";
import { createClient } from "@supabase/supabase-js";

function loadEnvLocal() {
  const envPath = path.join(process.cwd(), ".env.local");
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, "utf-8");
    content.split("\n").forEach((line) => {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith("#") && trimmed.includes("=")) {
        const [key, ...valParts] = trimmed.split("=");
        const val = valParts.join("=").trim().replace(/^["']|["']$/g, "");
        if (key && !process.env[key.trim()]) {
          process.env[key.trim()] = val;
        }
      }
    });
  }
}

async function inspectSchemaAndAuditDuplicates() {
  loadEnvLocal();

  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    console.error("Missing Supabase credentials");
    process.exit(1);
  }

  const supabase = createClient(url, key);

  console.log("================================================================================");
  console.log("🔍 READ-ONLY AUDIT FOR DUPLICATES IN MAP_STORIES (GROUP BY type, target_id, language)");
  console.log("================================================================================");

  let allStories: any[] = [];
  let page = 0;
  while (true) {
    const { data: batch, error } = await supabase
      .from("map_stories")
      .select("id, type, target_id, language, is_approved")
      .range(page * 1000, (page + 1) * 1000 - 1);
    if (error || !batch || batch.length === 0) break;
    allStories = allStories.concat(batch);
    if (batch.length < 1000) break;
    page++;
  }

  console.log(`Total map_stories in DB: ${allStories.length}`);

  const counts: Record<string, { count: number; items: any[] }> = {};
  for (const s of allStories) {
    const k = `${s.type} | ${s.target_id} | ${s.language}`;
    if (!counts[k]) counts[k] = { count: 0, items: [] };
    counts[k].count++;
    counts[k].items.push(s);
  }

  const duplicates = Object.entries(counts).filter(([_, v]) => v.count > 1);
  console.log(`\nDuplicates count (HAVING count(*) > 1): ${duplicates.length}`);

  if (duplicates.length > 0) {
    console.log("⚠️ DUPLICATES FOUND IN PRODUCTION DATABASE:");
    duplicates.forEach(([k, v]) => {
      console.log(`  [${k}]: count = ${v.count}`);
      v.items.forEach((it) => console.log(`     - ID: ${it.id}, is_approved: ${it.is_approved}`));
    });
  } else {
    console.log("✅ NO DUPLICATES FOUND IN MAP_STORIES! (type, target_id, language) combination is 100% UNIQUE in production.");
  }

  console.log("\n================================================================================");
  console.log("📐 INSPECT MAP_TARGETS COLUMNS");
  console.log("================================================================================");
  const { data: sampleTarget } = await supabase.from("map_targets").select("*").limit(1);
  if (sampleTarget && sampleTarget.length > 0) {
    console.log("map_targets columns:", Object.keys(sampleTarget[0]));
  }

  console.log("\n================================================================================");
  console.log("📐 INSPECT MAP_STORIES COLUMNS");
  console.log("================================================================================");
  const { data: sampleStory } = await supabase.from("map_stories").select("*").limit(1);
  if (sampleStory && sampleStory.length > 0) {
    console.log("map_stories columns:", Object.keys(sampleStory[0]));
  }

  console.log("\n================================================================================");
  console.log("🔍 INSPECT FIRST AI DRAFTS (IDs 1393, 1394, 1395, 1396, 1397)");
  console.log("================================================================================");
  const { data: aiDrafts } = await supabase
    .from("map_stories")
    .select("*")
    .in("id", [1393, 1394, 1395, 1396, 1397]);

  if (aiDrafts) {
    aiDrafts.forEach((row) => {
      console.log(`  - ID: ${row.id}, type: "${row.type}", target_id: "${row.target_id}", language: "${row.language}", is_approved: ${row.is_approved}`);
    });
  }

  console.log("================================================================================\n");
}

inspectSchemaAndAuditDuplicates();
