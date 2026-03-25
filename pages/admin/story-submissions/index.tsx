"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/router";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { AdminLogout } from "../../../components/AdminLogout";
import { AdminTabs } from "../../../components/AdminTabs";
import { SubmissionList } from "../../../components/story-submissions/SubmissionList";
import { StoryEditor } from "../../../components/story-submissions/StoryEditor";
import type {
  StorySubmission,
  StorySubmissionListItem,
  StorySubmissionStatus,
} from "../../../lib/story-submissions/types";

async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, options);
  const data = (await response.json()) as T & { error?: string };
  if (!response.ok) {
    throw new Error(data.error ?? "Request failed.");
  }
  return data;
}

function toPatchBody(submission: StorySubmission) {
  return {
    hero_name: submission.heroName,
    reviewer_notes: submission.reviewerNotes,
    assembled_story: {
      steps: submission.assembledStory.steps.map((step) => ({
        key: step.key,
        text: step.text,
        keywords: step.keywords,
        preview: step.preview ?? null,
      })),
    },
    slides: submission.assembledStory.steps.flatMap((step) => {
      if (!step.slideMediaUrl.trim()) {
        return [];
      }
      const existingSlide = submission.slides.find((slide) => slide.stepKey === step.key);
      return [{
        ...(existingSlide?.id ? { id: existingSlide.id } : {}),
        step_key: step.key,
        media_url: step.slideMediaUrl,
      }];
    }),
  };
}

export default function AdminStorySubmissionsPage() {
  const router = useRouter();
  const supabase = createClientComponentClient();

  const [sessionChecked, setSessionChecked] = useState(false);
  const [filter, setFilter] = useState<StorySubmissionStatus | "all">("pending");
  const [items, setItems] = useState<StorySubmissionListItem[]>([]);
  const [activeSubmission, setActiveSubmission] = useState<StorySubmission | null>(null);
  const [loadingList, setLoadingList] = useState(false);
  const [loadingSubmissionId, setLoadingSubmissionId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const requestedId = typeof router.query.id === "string" ? router.query.id : null;
  const hasLoadedSubmissionsRef = useRef(false);
  const failedSubmissionIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) {
        router.replace("/login");
        return;
      }
      setSessionChecked(true);
    });
  }, [router, supabase]);

  const loadSubmissions = useCallback(async () => {
    setLoadingList(true);
    setError(null);
    try {
      const data = await fetchJson<{ submissions: StorySubmissionListItem[] }>(
        "/api/admin/story-submissions",
      );
      setItems(data.submissions);
    } catch (loadError) {
      console.error("[STORY SUBMISSIONS LOAD ERROR]", loadError);
      setError(loadError instanceof Error ? loadError.message : String(loadError));
    } finally {
      setLoadingList(false);
    }
  }, []);

  const openSubmission = useCallback(async (id: string) => {
    setLoadingSubmissionId(id);
    setError(null);
    try {
      console.log("[FETCH SUBMISSION]", id);
      const data = await fetchJson<{ submission: StorySubmission }>(`/api/admin/story-submissions/${id}`);
      failedSubmissionIdsRef.current.delete(id);
      setActiveSubmission(data.submission);
      if (requestedId !== id) {
        await router.replace(
          {
            pathname: router.pathname,
            query: { id },
          },
          undefined,
          { shallow: true },
        );
      }
    } catch (loadError) {
      failedSubmissionIdsRef.current.add(id);
      console.error("[STORY SUBMISSIONS LOAD ERROR]", loadError);
      setError(loadError instanceof Error ? loadError.message : String(loadError));
    } finally {
      setLoadingSubmissionId(null);
    }
  }, [requestedId, router]);

  useEffect(() => {
    if (!sessionChecked || hasLoadedSubmissionsRef.current) {
      return;
    }
    hasLoadedSubmissionsRef.current = true;
    console.log("[FETCH SUBMISSIONS]");
    void loadSubmissions();
  }, [sessionChecked, loadSubmissions]);

  const filteredItems = useMemo(
    () => items.filter((item) => filter === "all" || item.status === filter),
    [filter, items],
  );

  useEffect(() => {
    if (!sessionChecked || !router.isReady) {
      return;
    }

    if (filteredItems.length === 0) {
      if (activeSubmission !== null) {
        setActiveSubmission(null);
      }
      return;
    }

    const hasVisibleActive = activeSubmission
      ? filteredItems.some((item) => item.id === activeSubmission.id)
      : false;

    if (hasVisibleActive) {
      return;
    }

    const requestedVisible = requestedId
      ? filteredItems.find((item) => item.id === requestedId)?.id ?? null
      : null;

    const nextId = requestedVisible ?? filteredItems[0]?.id ?? null;

    if (!nextId || loadingSubmissionId === nextId || failedSubmissionIdsRef.current.has(nextId)) {
      return;
    }

    void openSubmission(nextId);
  }, [activeSubmission, filteredItems, loadingSubmissionId, openSubmission, requestedId, router.isReady, sessionChecked]);

  const syncItem = useCallback((submission: StorySubmission) => {
    setItems((current) => {
      const nextItem: StorySubmissionListItem = {
        id: submission.id,
        heroName: submission.heroName,
        mode: submission.mode,
        status: submission.status,
        createdAt: submission.createdAt,
        snippet: submission.snippet,
      };

      if (!current.some((item) => item.id === submission.id)) {
        return [nextItem, ...current];
      }

      return current.map((item) => (item.id === submission.id ? nextItem : item));
    });
  }, []);

  const saveEdits = useCallback(async () => {
    if (!activeSubmission) {
      return;
    }

    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const data = await fetchJson<{ submission: StorySubmission }>(
        `/api/admin/story-submissions/${activeSubmission.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(toPatchBody(activeSubmission)),
        },
      );
      setActiveSubmission(data.submission);
      syncItem(data.submission);
      setSuccess("Изменения сохранены.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : String(saveError));
    } finally {
      setBusy(false);
    }
  }, [activeSubmission, syncItem]);

  const moderate = useCallback(async (action: "approve" | "reject") => {
    if (!activeSubmission) {
      return;
    }

    const body =
      action === "reject"
        ? { reviewerNotes: activeSubmission.reviewerNotes }
        : toPatchBody(activeSubmission);

    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const data = await fetchJson<{ submission: StorySubmission }>(
        `/api/admin/story-submissions/${activeSubmission.id}/${action}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      setActiveSubmission(data.submission);
      syncItem(data.submission);
      setSuccess(action === "approve" ? "История одобрена." : "История отклонена.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : String(saveError));
    } finally {
      setBusy(false);
    }
  }, [activeSubmission, syncItem]);

  if (!sessionChecked) {
    return <p style={{ padding: 24 }}>Checking session...</p>;
  }

  return (
    <div className="books-admin-page story-submissions-page">
      <div className="admin-top-bar">
        <div className="admin-top-bar__row admin-top-bar__row--right">
          <AdminLogout />
        </div>
        <div className="admin-top-bar__row">
          <AdminTabs />
        </div>
      </div>

      {error ? <div className="books-alert books-alert--error">{error}</div> : null}
      {success ? <div className="books-alert books-alert--success">{success}</div> : null}

      <div className="story-submissions-layout">
        <SubmissionList
          items={filteredItems}
          selectedId={activeSubmission?.id ?? null}
          filter={filter}
          loading={loadingList}
          onFilterChange={setFilter}
          onSelect={(id) => {
            failedSubmissionIdsRef.current.delete(id);
            void openSubmission(id);
          }}
        />

        <div className="story-submissions-main">
          {loadingSubmissionId ? (
            <div className="story-submissions-loading">Открываю историю...</div>
          ) : null}

          <StoryEditor
            submission={activeSubmission}
            busy={busy}
            onChange={setActiveSubmission}
            onSave={saveEdits}
            onApprove={() => moderate("approve")}
            onReject={() => moderate("reject")}
          />
        </div>
      </div>
    </div>
  );
}
