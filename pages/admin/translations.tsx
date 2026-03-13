import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { AdminTabs } from "../../components/AdminTabs";
import { AdminLogout } from "../../components/AdminLogout";
import { TranslationSummary } from "../../components/translations/TranslationSummary";
import { TranslationEstimator } from "../../components/translations/TranslationEstimator";
import { TranslationSelector } from "../../components/translations/TranslationSelector";
import { TranslationProgress } from "../../components/translations/TranslationProgress";
import { TranslationLogs } from "../../components/translations/TranslationLogs";
import { TranslationConfirmModal } from "../../components/translations/TranslationConfirmModal";
import { TranslationUntranslatedLessons } from "../../components/translations/TranslationUntranslatedLessons";
import type {
  AnalyzeResponse,
  ProgressResponse,
  RunRequest,
  TranslationScope,
} from "../../components/translations/types";

async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, options);
  const data = (await response.json()) as T & { error?: string };
  if (!response.ok) {
    const message = (data as { error?: string }).error ?? "Request failed";
    throw new Error(message);
  }
  return data;
}

export default function AdminTranslationsPage() {
  const router = useRouter();
  const supabase = createClientComponentClient();

  const [sessionChecked, setSessionChecked] = useState(false);
  const [lang, setLang] = useState("he");
  const [scope, setScope] = useState<TranslationScope>("all");
  const [firstNEnabled, setFirstNEnabled] = useState(false);
  const [firstN, setFirstN] = useState(50);
  const [batchSize, setBatchSize] = useState<10 | 20 | 50>(10);
  const [analyzeLoading, setAnalyzeLoading] = useState(false);
  const [runLoading, setRunLoading] = useState(false);
  const [analysis, setAnalysis] = useState<AnalyzeResponse | null>(null);
  const [progress, setProgress] = useState<ProgressResponse | null>(null);
  const [openConfirm, setOpenConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const showMessage = (message: string, type: "success" | "error") => {
    if (type === "success") {
      setSuccess(message);
      setError(null);
      return;
    }
    setError(message);
    setSuccess(null);
  };

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) {
        router.replace("/login");
        return;
      }
      setSessionChecked(true);
    });
  }, [router, supabase]);

  const firstNParam = firstNEnabled ? firstN : undefined;

  const analyzeUrl = useMemo(() => {
    const params = new URLSearchParams({
      lang,
      scope,
    });
    if (firstNParam) {
      params.set("firstN", String(firstNParam));
    }
    return `/api/admin/translation/analyze?${params.toString()}`;
  }, [lang, scope, firstNParam]);

  const loadAnalysis = async () => {
    setAnalyzeLoading(true);
    setError(null);
    try {
      const data = await fetchJson<AnalyzeResponse>(analyzeUrl);
      setAnalysis(data);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setError(message);
    } finally {
      setAnalyzeLoading(false);
    }
  };

  const loadProgress = async () => {
    try {
      const data = await fetchJson<ProgressResponse>("/api/admin/translation/run");
      setProgress(data);
      if (data.errorMessage) {
        setError(data.errorMessage);
      }
      if (!data.running && data.finishedAt && !data.errorMessage) {
        setRunLoading(false);
        setSuccess("Translation run finished.");
      } else if (!data.running && data.errorMessage) {
        setRunLoading(false);
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setError(message);
    }
  };

  useEffect(() => {
    if (!sessionChecked) {
      return;
    }
    void loadAnalysis();
    void loadProgress();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionChecked]);

  useEffect(() => {
    if (!progress?.running) {
      return;
    }
    const timer = setInterval(() => {
      void loadProgress();
    }, 1500);
    return () => clearInterval(timer);
  }, [progress?.running]);

  const openConfirmation = () => {
    setError(null);
    setSuccess(null);
    if (!analysis) {
      setError("Run analysis before starting translation.");
      return;
    }
    if (analysis.counts.total === 0) {
      setError("Nothing to translate for selected filters.");
      return;
    }
    if (progress?.running) {
      setError("Another translation run is already in progress.");
      return;
    }
    setOpenConfirm(true);
  };

  const startRun = async () => {
    setRunLoading(true);
    setError(null);
    setSuccess(null);
    try {
      await fetchJson<{ ok: true; runId: string }>("/api/admin/translation/run", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          lang,
          scope,
          firstN: firstNParam,
          batchSize,
          confirmed: true,
        } satisfies RunRequest),
      });
      setOpenConfirm(false);
      await loadProgress();
      await loadAnalysis();
      setSuccess("Translation run started.");
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setError(message);
      setRunLoading(false);
    }
  };

  if (!sessionChecked) {
    return <p style={{ padding: 24 }}>Checking session...</p>;
  }

  return (
    <div className="admin-translations-page">
      <div className="admin-top-bar">
        <div className="admin-top-bar__row admin-top-bar__row--right">
          <AdminLogout />
        </div>
        <div className="admin-top-bar__row">
          <AdminTabs />
        </div>
      </div>

      <h1 className="admin-translations-title">Translation Control Panel</h1>
      {analysis?.mockModeActive && (
        <div className="translations-mock-banner">
          MOCK MODE ACTIVE
          <span>(no Gemini calls)</span>
        </div>
      )}

      <TranslationSelector
        lang={lang}
        scope={scope}
        firstNEnabled={firstNEnabled}
        firstN={firstN}
        loading={analyzeLoading}
        onLangChange={setLang}
        onScopeChange={setScope}
        onFirstNEnabledChange={setFirstNEnabled}
        onFirstNChange={setFirstN}
        onAnalyze={() => {
          void loadAnalysis();
        }}
      />

      {analysis && (
        <>
          <TranslationSummary
            data={analysis}
          />
          <TranslationEstimator
            totalCharacters={analysis.totalCharacters}
            estimatedTokens={analysis.estimatedTokens}
            estimatedCostUsd={analysis.estimatedCostUsd}
            costModel={analysis.costModel}
            tokenMethod={analysis.tokenMethod}
          />
        </>
      )}

      <TranslationUntranslatedLessons lang={lang} scope={scope} onMessage={showMessage} />

      <section className="translations-panel">
        <h2 className="translations-title">Run Translation</h2>
        <p className="translations-hint">
          Translation starts only after explicit confirmation. Parallel runs are blocked.
        </p>
        <div className="translations-row translations-row--gap">
          <label className="translations-label">
            Batch size
            <select
              className="translations-input"
              value={batchSize}
              onChange={(e) => setBatchSize(Number(e.target.value) as 10 | 20 | 50)}
            >
              <option value={10}>10</option>
              <option value={20}>20</option>
              <option value={50}>50</option>
            </select>
          </label>
          {progress?.running && (
            <div className="translations-hint">
              Active batch size: {progress.batchSize ?? batchSize}
            </div>
          )}
        </div>
        <button
          onClick={openConfirmation}
          disabled={runLoading || progress?.running || !analysis}
          className="translations-button translations-button--primary"
        >
          {progress?.running ? "Run in progress..." : "Start translation run"}
        </button>
      </section>

      {progress && <TranslationProgress progress={progress} />}
      <TranslationLogs logs={progress?.logs ?? []} />

      {error && <div className="translations-alert translations-alert--error">{error}</div>}
      {success && <div className="translations-alert translations-alert--success">{success}</div>}

      <TranslationConfirmModal
        open={openConfirm}
        items={analysis?.counts.total ?? 0}
        tokens={analysis?.estimatedTokens ?? 0}
        cost={analysis?.estimatedCostUsd ?? 0}
        lang={lang}
        onCancel={() => setOpenConfirm(false)}
        onConfirm={() => {
          void startRun();
        }}
      />
    </div>
  );
}
