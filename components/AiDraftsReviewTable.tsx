import { useCallback, useEffect, useMemo, useState } from "react";
import type { AiDraftItem, AiDraftsResponse, ApproveBatchResponse } from "../pages/api/admin/map-story/ai-drafts";

type MapTypeLabel = {
  label: string;
  icon: string;
};

const MAP_TYPE_META: Record<string, MapTypeLabel> = {
  sea: { label: "Море / Залив", icon: "🌊" },
  river: { label: "Река", icon: "🏞️" },
  physic: { label: "Физический объект", icon: "🏔️" },
  weather: { label: "Климат / Экорегион", icon: "🌿" },
  country: { label: "Страна", icon: "🗺️" },
  flag: { label: "Флаг", icon: "🚩" },
  culture: { label: "Культура", icon: "🏰" },
  food: { label: "Еда", icon: "🍏" },
  animal: { label: "Животное", icon: "🦁" },
};

function getMapTypeDisplay(mapType: string): { label: string; icon: string } {
  return MAP_TYPE_META[mapType] ?? { label: mapType, icon: "📍" };
}

function formatDate(isoString: string): string {
  try {
    const d = new Date(isoString);
    return d.toLocaleDateString("ru-RU", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return isoString;
  }
}

async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, options);
  const raw = await response.text();
  const contentType = response.headers.get("content-type") ?? "";

  if (!contentType.includes("application/json")) {
    throw new Error(`Server status ${response.status}: ${raw.slice(0, 200)}`);
  }

  const data = JSON.parse(raw) as T & { error?: string };
  if (!response.ok) {
    throw new Error(data.error ?? `Request failed with status ${response.status}`);
  }
  return data;
}

export function AiDraftsReviewTable({
  onDraftApproved,
}: {
  onDraftApproved?: () => void;
}) {
  const [drafts, setDrafts] = useState<AiDraftItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Filters & Search
  const [search, setSearch] = useState("");
  const [selectedType, setSelectedType] = useState<string>("all");
  const [sortOrder, setSortOrder] = useState<"newest" | "oldest" | "type">("newest");

  // Selection & Selection state
  const [selectedIds, setSelectedIds] = useState<Array<number | string>>([]);
  const [expandedIds, setExpandedIds] = useState<Set<number | string>>(new Set());

  // Modals & Action States
  const [viewingDraft, setViewingDraft] = useState<AiDraftItem | null>(null);
  const [editingDraft, setEditingDraft] = useState<AiDraftItem | null>(null);
  const [editedContent, setEditedContent] = useState("");
  const [approvingDraft, setApprovingDraft] = useState<AiDraftItem | null>(null);
  const [deletingDraft, setDeletingDraft] = useState<AiDraftItem | null>(null);
  const [approvingBatch, setApprovingBatch] = useState(false);
  const [processingAction, setProcessingAction] = useState(false);

  const loadDrafts = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchJson<AiDraftsResponse>("/api/admin/map-story/ai-drafts");
      setDrafts(data.drafts);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadDrafts();
  }, [loadDrafts]);

  // Filter & Sort
  const filteredDrafts = useMemo(() => {
    const query = search.trim().toLowerCase();

    const list = drafts.filter((item) => {
      if (selectedType !== "all" && item.type !== selectedType) {
        return false;
      }

      if (query) {
        const matchesTargetId = item.target_id.toLowerCase().includes(query);
        const matchesTitle = item.title_ru?.toLowerCase().includes(query) ?? false;
        if (!matchesTargetId && !matchesTitle) {
          return false;
        }
      }

      return true;
    });

    return list.sort((a, b) => {
      if (sortOrder === "oldest") {
        return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      }
      if (sortOrder === "type") {
        return a.type.localeCompare(b.type);
      }
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
  }, [drafts, search, selectedType, sortOrder]);

  const uniqueTypes = useMemo(() => {
    return Array.from(new Set(drafts.map((d) => d.type))).sort();
  }, [drafts]);

  const toggleExpand = (id: number | string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelect = (id: number | string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  const toggleSelectAll = () => {
    const allFilteredIds = filteredDrafts.map((d) => d.id);
    const allSelected = allFilteredIds.length > 0 && allFilteredIds.every((id) => selectedIds.includes(id));

    if (allSelected) {
      setSelectedIds((prev) => prev.filter((id) => !allFilteredIds.includes(id)));
    } else {
      setSelectedIds((prev) => Array.from(new Set([...prev, ...allFilteredIds])));
    }
  };

  // Actions
  const handleApproveSingle = async (draft: AiDraftItem) => {
    if (processingAction) return;
    setProcessingAction(true);
    setError(null);
    setSuccess(null);
    setApprovingDraft(null);
    setViewingDraft(null);

    try {
      await fetchJson("/api/admin/map-story/ai-drafts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "APPROVE_AI_DRAFT", id: draft.id }),
      });

      setSuccess(`История для "${draft.target_id}" успешно утверждена и доступна на карте.`);
      setDrafts((prev) => prev.filter((d) => d.id !== draft.id));
      setSelectedIds((prev) => prev.filter((i) => i !== draft.id));
      onDraftApproved?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to approve draft.");
    } finally {
      setProcessingAction(false);
    }
  };

  const handleApproveBatch = async () => {
    if (selectedIds.length === 0 || processingAction) return;
    setProcessingAction(true);
    setError(null);
    setSuccess(null);
    setApprovingBatch(false);

    try {
      const res = await fetchJson<ApproveBatchResponse>("/api/admin/map-story/ai-drafts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "APPROVE_AI_DRAFT_BATCH", ids: selectedIds }),
      });

      const approvedSet = new Set(selectedIds.filter((id) => !res.failures.some((f) => f.id === id)));
      setDrafts((prev) => prev.filter((d) => !approvedSet.has(d.id)));
      setSelectedIds([]);

      if (res.failed > 0) {
        setSuccess(`Утверждено: ${res.approved}. Ошибки: ${res.failed}.`);
        setError(`Ошибки утверждения: ${res.failures.map((f) => f.error).join("; ")}`);
      } else {
        setSuccess(`Успешно утверждено ${res.approved} черновиков.`);
      }
      onDraftApproved?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to approve batch.");
    } finally {
      setProcessingAction(false);
    }
  };

  const handleSaveEdit = async () => {
    if (!editingDraft || processingAction) return;
    if (!editedContent.trim()) {
      setError("Текст истории не может быть пустым.");
      return;
    }

    const currentDraft = editingDraft;
    setProcessingAction(true);
    setError(null);
    setSuccess(null);
    setEditingDraft(null);

    try {
      const res = await fetchJson<{ success: boolean; content: string }>("/api/admin/map-story/ai-drafts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "UPDATE_AI_DRAFT_CONTENT",
          id: currentDraft.id,
          content: editedContent,
        }),
      });

      setDrafts((prev) =>
        prev.map((d) =>
          d.id === currentDraft.id
            ? {
                ...d,
                content: res.content,
                wordCount: res.content.trim().split(/\s+/).filter(Boolean).length,
              }
            : d
        )
      );

      setSuccess(`Текст для "${currentDraft.target_id}" успешно обновлён.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update draft.");
    } finally {
      setProcessingAction(false);
    }
  };

  const handleDeleteSingle = async (draft: AiDraftItem) => {
    if (processingAction) return;
    setProcessingAction(true);
    setError(null);
    setSuccess(null);
    setDeletingDraft(null);

    try {
      await fetchJson("/api/admin/map-story/ai-drafts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "DELETE_AI_DRAFT", id: draft.id }),
      });

      setSuccess(`Черновик для "${draft.target_id}" удалён.`);
      setDrafts((prev) => prev.filter((d) => d.id !== draft.id));
      setSelectedIds((prev) => prev.filter((i) => i !== draft.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete draft.");
    } finally {
      setProcessingAction(false);
    }
  };

  return (
    <div className="ai-drafts-review-container">
      {/* Header & Controls */}
      <div className="ai-drafts-header">
        <div className="ai-drafts-title-group">
          <h2 className="ai-drafts-title">🤖 AI-черновики историй карт</h2>
          <span className="ai-drafts-badge-count">{drafts.length} историй ждут проверки</span>
        </div>
        <button
          type="button"
          className="map-targets-pagination__button"
          onClick={() => void loadDrafts()}
          disabled={loading || processingAction}
        >
          🔄 Обновить список
        </button>
      </div>

      {error ? <p className="map-targets-error">{error}</p> : null}
      {success ? <p className="map-targets-success">{success}</p> : null}

      {/* Filter controls */}
      <div className="map-targets-controls" style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "flex-end" }}>
        <label className="map-targets-field map-targets-field--search" style={{ flex: 1, minWidth: 200 }}>
          <span className="map-targets-field__label">Поиск по объекту или ID</span>
          <input
            className="map-targets-input"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Например: Bransfield или Остров"
            style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: "1px solid #ccc" }}
          />
        </label>

        <div className="map-targets-field" style={{ minWidth: 180 }}>
          <span className="map-targets-field__label" style={{ display: "block", marginBottom: 4 }}>Тип карты</span>
          <select
            className="map-targets-input"
            value={selectedType}
            onChange={(e) => setSelectedType(e.target.value)}
            style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: "1px solid #ccc" }}
          >
            <option value="all">Все типы карт ({drafts.length})</option>
            {uniqueTypes.map((t) => (
              <option key={t} value={t}>
                {getMapTypeDisplay(t).icon} {getMapTypeDisplay(t).label} ({drafts.filter((d) => d.type === t).length})
              </option>
            ))}
          </select>
        </div>

        <div className="map-targets-field" style={{ minWidth: 160 }}>
          <span className="map-targets-field__label" style={{ display: "block", marginBottom: 4 }}>Сортировка</span>
          <select
            className="map-targets-input"
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value as any)}
            style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: "1px solid #ccc" }}
          >
            <option value="newest">Сначала новые</option>
            <option value="oldest">Сначала старые</option>
            <option value="type">По типу карты</option>
          </select>
        </div>
      </div>

      {/* Batch Action Bar */}
      {selectedIds.length > 0 ? (
        <div
          className="map-targets-batch-bar"
          style={{
            marginTop: 12,
            padding: "12px 16px",
            backgroundColor: "#fff8e6",
            border: "1px solid #ffe5b4",
            borderRadius: 8,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <div className="map-targets-batch-bar__meta">
            <strong>Выбрано черновиков:</strong> {selectedIds.length} из {filteredDrafts.length}
          </div>
          <div className="map-targets-batch-bar__actions" style={{ display: "flex", gap: 10 }}>
            <button
              type="button"
              className="map-targets-pagination__button"
              onClick={() => setSelectedIds([])}
            >
              Снять выделение
            </button>
            <button
              type="button"
              className="map-targets-generate"
              style={{ backgroundColor: "#027a48", color: "#fff", padding: "8px 16px", borderRadius: 8, border: "none", cursor: "pointer", fontWeight: 600 }}
              onClick={() => setApprovingBatch(true)}
              disabled={processingAction}
            >
              ✅ Утвердить выбранные ({selectedIds.length})
            </button>
          </div>
        </div>
      ) : null}

      {/* Loading state */}
      {loading ? <div className="map-targets-state" style={{ padding: 20 }}>Загрузка AI-черновиков...</div> : null}

      {/* Empty State */}
      {!loading && filteredDrafts.length === 0 ? (
        <div className="map-targets-state" style={{ padding: 40, textAlign: "center", backgroundColor: "#fafafa", borderRadius: 12, border: "1px dashed #ccc" }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>🤖</div>
          <h3 style={{ margin: 0, fontSize: 18, color: "#333" }}>AI-черновиков пока нет</h3>
          <p style={{ margin: "8px 0 0", color: "#666" }}>
            Новые истории, созданные фабрикой, появятся здесь после записи в статусе черновика.
          </p>
        </div>
      ) : null}

      {/* Main Table */}
      {!loading && filteredDrafts.length > 0 ? (
        <div className="map-targets-table-wrapper" style={{ marginTop: 16, overflowX: "auto" }}>
          <table className="map-targets-table" style={{ width: "100%", borderCollapse: "collapse", textAlign: "left" }}>
            <thead>
              <tr style={{ backgroundColor: "#f4f6f8", borderBottom: "2px solid #e1e6eb" }}>
                <th style={{ width: 40, padding: 10 }}>
                  <input
                    type="checkbox"
                    checked={
                      filteredDrafts.length > 0 &&
                      filteredDrafts.every((d) => selectedIds.includes(d.id))
                    }
                    onChange={toggleSelectAll}
                  />
                </th>
                <th style={{ padding: 10 }}>Тип карты</th>
                <th style={{ padding: 10 }}>Объект / ID</th>
                <th style={{ padding: 10 }}>Текст истории</th>
                <th style={{ width: 70, padding: 10 }}>Слов</th>
                <th style={{ padding: 10 }}>Дата</th>
                <th style={{ padding: 10 }}>Источник</th>
                <th style={{ padding: 10 }}>Статус</th>
                <th style={{ width: 220, padding: 10 }}>Действия</th>
              </tr>
            </thead>
            <tbody>
              {filteredDrafts.map((draft) => {
                const typeMeta = getMapTypeDisplay(draft.type);
                const isExpanded = expandedIds.has(draft.id);
                const isSelected = selectedIds.includes(draft.id);

                return (
                  <tr key={draft.id} style={{ backgroundColor: isSelected ? "#fffdf5" : undefined, borderBottom: "1px solid #edf1f5" }}>
                    <td style={{ padding: 10 }}>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelect(draft.id)}
                      />
                    </td>
                    <td style={{ padding: 10 }}>
                      <span className="map-targets-type-badge">
                        {typeMeta.icon} {typeMeta.label}
                      </span>
                    </td>
                    <td style={{ padding: 10 }}>
                      {draft.title_ru ? (
                        <div style={{ fontWeight: 600, marginBottom: 2 }}>{draft.title_ru}</div>
                      ) : null}
                      <code style={{ fontSize: 12, backgroundColor: "#f0f0f0", padding: "2px 6px", borderRadius: 4 }}>
                        {draft.target_id}
                      </code>
                    </td>
                    <td style={{ padding: 10, maxWidth: 350 }}>
                      <div
                        style={{
                          maxHeight: isExpanded ? "none" : "3.6em",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          lineHeight: "1.4",
                          fontSize: 13,
                        }}
                      >
                        {draft.content}
                      </div>
                      <button
                        type="button"
                        style={{
                          border: "none",
                          background: "none",
                          color: "#0066cc",
                          cursor: "pointer",
                          padding: 0,
                          fontSize: 12,
                          marginTop: 4,
                        }}
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleExpand(draft.id);
                        }}
                      >
                        {isExpanded ? "▲ Свернуть" : "▼ Раскрыть полностью"}
                      </button>
                    </td>
                    <td style={{ fontSize: 12, textAlign: "center", padding: 10 }}>{draft.wordCount}</td>
                    <td style={{ fontSize: 12, whiteSpace: "nowrap", padding: 10 }}>{formatDate(draft.created_at)}</td>
                    <td style={{ padding: 10 }}>
                      <span className="map-targets-model-tag">{draft.auto_generation_model}</span>
                    </td>
                    <td style={{ padding: 10 }}>
                      <span className="map-targets-status-badge map-targets-status-badge--warning">
                        🤖 Черновик
                      </span>
                    </td>
                    <td style={{ padding: 10 }}>
                      <div className="map-targets-actions-cell" style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        <button
                          type="button"
                          className="map-targets-mini-btn"
                          title="Просмотреть детально"
                          style={{ padding: "6px 10px", fontSize: 13, cursor: "pointer", borderRadius: 6, border: "1px solid #ccc", background: "#fff" }}
                          onClick={(e) => {
                            e.stopPropagation();
                            setViewingDraft(draft);
                          }}
                        >
                          👁️
                        </button>
                        <button
                          type="button"
                          className="map-targets-mini-btn"
                          title="Редактировать текст"
                          style={{ padding: "6px 10px", fontSize: 13, cursor: "pointer", borderRadius: 6, border: "1px solid #ccc", background: "#fff" }}
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingDraft(draft);
                            setEditedContent(draft.content);
                          }}
                        >
                          ✏️
                        </button>
                        <button
                          type="button"
                          className="map-targets-mini-btn map-targets-mini-btn--success"
                          title="Утвердить историю"
                          style={{ padding: "6px 10px", fontSize: 12, cursor: "pointer", borderRadius: 6, border: "1px solid #a6f4c5", background: "#ecfdf3", color: "#027a48", fontWeight: 600 }}
                          onClick={(e) => {
                            e.stopPropagation();
                            setApprovingDraft(draft);
                          }}
                        >
                          ✅ Утвердить
                        </button>
                        <button
                          type="button"
                          className="map-targets-mini-btn map-targets-mini-btn--danger"
                          title="Удалить черновик"
                          style={{ padding: "6px 10px", fontSize: 13, cursor: "pointer", borderRadius: 6, border: "1px solid #fda29b", background: "#fef3f2", color: "#b42318" }}
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeletingDraft(draft);
                          }}
                        >
                          🗑️
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}

      {/* Modal: View Full Draft */}
      {viewingDraft ? (
        <div className="map-targets-modal-overlay" onClick={() => setViewingDraft(null)}>
          <div className="map-targets-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 640 }}>
            <h3>Просмотр черновика: {viewingDraft.target_id}</h3>
            <div style={{ marginBottom: 12, fontSize: 13, color: "#555" }}>
              <span>Тип: {getMapTypeDisplay(viewingDraft.type).label} | </span>
              <span>Модель: {viewingDraft.auto_generation_model} | </span>
              <span>Слов: {viewingDraft.wordCount}</span>
            </div>
            <div style={{ padding: 14, backgroundColor: "#f9f9f9", borderRadius: 8, lineHeight: 1.5, fontSize: 14, border: "1px solid #eee" }}>
              {viewingDraft.content}
            </div>
            <div className="map-targets-modal-actions" style={{ marginTop: 20, display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <button
                type="button"
                className="map-targets-pagination__button"
                style={{ padding: "8px 16px", borderRadius: 8, cursor: "pointer", border: "1px solid #ccc", background: "#fff" }}
                onClick={() => setViewingDraft(null)}
              >
                Закрыть
              </button>
              <button
                type="button"
                className="map-targets-generate"
                style={{ padding: "8px 16px", borderRadius: 8, cursor: "pointer", border: "none", background: "#027a48", color: "#fff", fontWeight: 600 }}
                onClick={() => {
                  const d = viewingDraft;
                  setViewingDraft(null);
                  setApprovingDraft(d);
                }}
              >
                ✅ Перейти к утверждению
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Modal: Edit Content */}
      {editingDraft ? (
        <div className="map-targets-modal-overlay" onClick={() => setEditingDraft(null)}>
          <div className="map-targets-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 640 }}>
            <h3>Редактирование черновика: {editingDraft.target_id}</h3>
            <p style={{ fontSize: 13, color: "#666", marginBottom: 12 }}>
              Изменение текста сохранит статус черновика (`is_approved = false`). Утверждение производится отдельно.
            </p>
            <textarea
              style={{ width: "100%", height: 160, padding: 10, fontSize: 14, lineHeight: 1.4, borderRadius: 8, border: "1px solid #ccc" }}
              value={editedContent}
              onChange={(e) => setEditedContent(e.target.value)}
            />
            <div className="map-targets-modal-actions" style={{ marginTop: 20, display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <button
                type="button"
                className="map-targets-pagination__button"
                style={{ padding: "8px 16px", borderRadius: 8, cursor: "pointer", border: "1px solid #ccc", background: "#fff" }}
                onClick={() => setEditingDraft(null)}
                disabled={processingAction}
              >
                Отмена
              </button>
              <button
                type="button"
                className="map-targets-generate"
                style={{ padding: "8px 16px", borderRadius: 8, cursor: "pointer", border: "none", background: "#0066cc", color: "#fff", fontWeight: 600 }}
                onClick={() => void handleSaveEdit()}
                disabled={processingAction || !editedContent.trim()}
              >
                {processingAction ? "Сохраняем..." : "Сохранить изменения"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Modal: Approve Single Confirmation */}
      {approvingDraft ? (
        <div className="map-targets-modal-overlay" onClick={() => setApprovingDraft(null)}>
          <div className="map-targets-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 500 }}>
            <h3>Подтверждение утверждения</h3>
            <p style={{ fontSize: 14, lineHeight: 1.4, margin: "12px 0 20px" }}>
              Утвердить историю для объекта <strong>"{approvingDraft.target_id}"</strong> и сделать её доступной пользователям в карте?
            </p>
            <div className="map-targets-modal-actions" style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <button
                type="button"
                className="map-targets-pagination__button"
                style={{ padding: "8px 16px", borderRadius: 8, cursor: "pointer", border: "1px solid #ccc", background: "#fff" }}
                onClick={() => setApprovingDraft(null)}
                disabled={processingAction}
              >
                Отмена
              </button>
              <button
                type="button"
                className="map-targets-generate"
                style={{ padding: "8px 16px", borderRadius: 8, cursor: "pointer", border: "none", background: "#027a48", color: "#fff", fontWeight: 600 }}
                onClick={() => void handleApproveSingle(approvingDraft)}
                disabled={processingAction}
              >
                {processingAction ? "Утверждаем..." : "Да, утвердить"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Modal: Approve Batch Confirmation */}
      {approvingBatch ? (
        <div className="map-targets-modal-overlay" onClick={() => setApprovingBatch(false)}>
          <div className="map-targets-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 500 }}>
            <h3>Массовое утверждение черновиков</h3>
            <p style={{ fontSize: 14, lineHeight: 1.4, margin: "12px 0 20px" }}>
              Вы уверены, что хотите утвердить <strong>{selectedIds.length}</strong> выбранных черновиков? После утверждения истории станут доступны на пользовательских картах.
            </p>
            <div className="map-targets-modal-actions" style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <button
                type="button"
                className="map-targets-pagination__button"
                style={{ padding: "8px 16px", borderRadius: 8, cursor: "pointer", border: "1px solid #ccc", background: "#fff" }}
                onClick={() => setApprovingBatch(false)}
                disabled={processingAction}
              >
                Отмена
              </button>
              <button
                type="button"
                className="map-targets-generate"
                style={{ padding: "8px 16px", borderRadius: 8, cursor: "pointer", border: "none", background: "#027a48", color: "#fff", fontWeight: 600 }}
                onClick={() => void handleApproveBatch()}
                disabled={processingAction}
              >
                {processingAction ? "Утверждаем пакет..." : `Утвердить ${selectedIds.length} историй`}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Modal: Delete Confirmation */}
      {deletingDraft ? (
        <div className="map-targets-modal-overlay" onClick={() => setDeletingDraft(null)}>
          <div className="map-targets-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 500 }}>
            <h3 style={{ color: "#d93025" }}>Удаление черновика</h3>
            <p style={{ fontSize: 14, lineHeight: 1.4, margin: "12px 0 20px" }}>
              Удалить черновик истории для <strong>"{deletingDraft.target_id}"</strong>? Это действие нельзя отменить.
            </p>
            <div className="map-targets-modal-actions" style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <button
                type="button"
                className="map-targets-pagination__button"
                style={{ padding: "8px 16px", borderRadius: 8, cursor: "pointer", border: "1px solid #ccc", background: "#fff" }}
                onClick={() => setDeletingDraft(null)}
                disabled={processingAction}
              >
                Отмена
              </button>
              <button
                type="button"
                className="map-targets-pagination__button"
                style={{ padding: "8px 16px", borderRadius: 8, cursor: "pointer", backgroundColor: "#d93025", color: "#fff", border: "none", fontWeight: 600 }}
                onClick={() => void handleDeleteSingle(deletingDraft)}
                disabled={processingAction}
              >
                {processingAction ? "Удаляем..." : "Удалить черновик"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
