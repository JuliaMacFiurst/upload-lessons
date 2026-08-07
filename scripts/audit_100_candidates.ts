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

async function audit() {
  loadEnvLocal();

  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    console.error("Missing Supabase credentials");
    process.exit(1);
  }

  const supabase = createClient(url, key);

  console.log("================================================================================");
  console.log("🔍 AUDITING .pilot-reports/candidate-100-stories-latest.json AGAINST SUPABASE");
  console.log("================================================================================");

  // 1. Audit Fraser specifically
  console.log("\n[1] SPECIFIC AUDIT FOR Fraser TARGET:");
  const { data: fraserStories, error: fraserErr } = await supabase
    .from("map_stories")
    .select("id, type, target_id, language, is_approved, content")
    .eq("target_id", "Fraser");

  console.log(`Fraser stories count in map_stories table: ${fraserStories?.length ?? 0}`);
  if (fraserStories && fraserStories.length > 0) {
    fraserStories.forEach((s) => {
      console.log(`  - ID: ${s.id}, type: "${s.type}", target_id: "${s.target_id}", language: "${s.language}", is_approved: ${s.is_approved}`);
    });
  }

  // 2. Exact read-only SELECT per object in map_stories for (type = c.map_type, target_id = c.target_id, language = 'ru')
  const duplicates: Array<{ map_type: string; target_id: string; existingStory: any }> = [];
  const brandNew: Array<{ map_type: string; target_id: string }> = [];

  // Fetch paginated RU stories to ensure full DB coverage
  let allRuStories: any[] = [];
  let page = 0;
  const pageSize = 1000;
  let hasMore = true;

  while (hasMore) {
    const { data: pageData, error } = await supabase
      .from("map_stories")
      .select("id, type, target_id, language, is_approved")
      .eq("language", "ru")
      .range(page * pageSize, (page + 1) * pageSize - 1);

    if (error || !pageData || pageData.length === 0) {
      hasMore = false;
    } else {
      allRuStories = allRuStories.concat(pageData);
      if (pageData.length < pageSize) {
        hasMore = false;
      } else {
        page++;
      }
    }
  }

  console.log(`\n[2] TOTAL RU STORIES IN DATABASE (PAGINATED): ${allRuStories.length}`);

  // 3. Load candidates file
  const candidateFile = path.join(process.cwd(), ".pilot-reports/candidate-100-stories-latest.json");
  const candidates = JSON.parse(fs.readFileSync(candidateFile, "utf-8")) as Array<{
    map_type: string;
    target_id: string;
    content: string;
  }>;

  // Also verify exact individual SELECT for each candidate as double check
  for (const c of candidates) {
    const { data: exactMatch } = await supabase
      .from("map_stories")
      .select("id, type, target_id, language, is_approved")
      .eq("type", c.map_type)
      .eq("target_id", c.target_id)
      .eq("language", "ru");

    if (exactMatch && exactMatch.length > 0) {
      duplicates.push({
        map_type: c.map_type,
        target_id: c.target_id,
        existingStory: exactMatch[0],
      });
    } else {
      brandNew.push({
        map_type: c.map_type,
        target_id: c.target_id,
      });
    }
  }

  console.log("--------------------------------------------------------------------------------");
  console.log(`Total Candidate Objects Audited: ${candidates.length}`);
  console.log(`Real New Objects (Absent in DB): ${brandNew.length}`);
  console.log(`Existing Duplicates (Already in DB): ${duplicates.length}`);
  console.log("--------------------------------------------------------------------------------");

  if (duplicates.length > 0) {
    console.log("\nFULL LIST OF DUPLICATES FOUND IN BATCH:");
    duplicates.forEach((d, idx) => {
      console.log(
        `  [${idx + 1}] map_type: "${d.map_type}", target_id: "${d.target_id}" (DB Story ID: ${d.existingStory.id}, language: "${d.existingStory.language}")`
      );
    });
  }

  // Write exact clean new targets array to scratch file for re-assembling
  const dbStoryMap = new Set(allRuStories.map((s) => `${s.type}:${s.target_id}`));
  const cleanCandidates = candidates.filter((c) => !dbStoryMap.has(`${c.map_type}:${c.target_id}`));
  fs.writeFileSync("scratch_clean_new_candidates.json", JSON.stringify(cleanCandidates, null, 2));

  console.log("================================================================================\n");
}

audit();
