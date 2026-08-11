import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { AdminLogout } from "../../../components/AdminLogout";
import { AdminTabs } from "../../../components/AdminTabs";
import { MapTranslationQueue } from "../../../components/MapTranslationQueue";

export default function AiMapTranslationsPage() {
  const router = useRouter();
  const supabase = createClientComponentClient();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) void router.replace("/login");
      else setReady(true);
    });
  }, [router, supabase]);

  if (!ready) return <p style={{ padding: 24 }}>Checking session...</p>;

  return <div className="page">
    <div className="admin-top-bar"><div className="admin-top-bar__row admin-top-bar__row--right"><AdminLogout /></div><div className="admin-top-bar__row"><AdminTabs /></div></div>
    <header><div><h1>AI Translations</h1><p>Small-batch manual translation workspace for approved Russian map stories. No translation generation happens here.</p></div></header>
    <nav className="maps-subnav" aria-label="Maps workspaces">
      <Link href="/admin/map-targets">Maps</Link>
      <Link href="/admin/map-targets?workspace=ai-drafts">AI Drafts</Link>
      <Link href="/admin/map-targets/ai-translations" className="active">AI Translations</Link>
    </nav>
    <MapTranslationQueue />
    <style jsx>{`.page{padding:24px;background:#fffcf6;min-height:100vh}header{margin:20px 0 10px}h1{margin:0;font-size:32px}header p{color:#667085;max-width:850px}.maps-subnav{display:flex;gap:8px}.maps-subnav :global(a){padding:9px 14px;border:1px solid #e6d8bb;border-radius:10px;background:white;color:#5d4822;text-decoration:none}.maps-subnav :global(a.active){background:#fff0c9;border-color:#f5a623;font-weight:800}`}</style>
  </div>;
}
