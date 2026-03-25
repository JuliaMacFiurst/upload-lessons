import type { StorySubmissionListItem, StorySubmissionStatus } from "../../lib/story-submissions/types";

type SubmissionListProps = {
  items: StorySubmissionListItem[];
  selectedId: string | null;
  filter: StorySubmissionStatus | "all";
  loading: boolean;
  onFilterChange: (value: StorySubmissionStatus | "all") => void;
  onSelect: (id: string) => void;
};

function formatDate(value: string | null) {
  if (!value) {
    return "Без даты";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

const FILTERS: Array<{ value: StorySubmissionStatus | "all"; label: string }> = [
  { value: "all", label: "Все" },
  { value: "pending", label: "Ожидают" },
  { value: "approved", label: "Одобрены" },
  { value: "rejected", label: "Отклонены" },
];

export function SubmissionList({
  items,
  selectedId,
  filter,
  loading,
  onFilterChange,
  onSelect,
}: SubmissionListProps) {
  return (
    <aside className="story-submissions-sidebar">
      <div className="story-submissions-sidebar__head">
        <div>
          <h2 className="story-submissions-sidebar__title">Истории пользователей</h2>
          <p className="story-submissions-sidebar__hint">
            Открой историю, вычитай текст и реши, пускать ли её дальше.
          </p>
        </div>
      </div>

      <div className="story-submissions-filters" role="tablist" aria-label="Фильтр статуса">
        {FILTERS.map((item) => (
          <button
            key={item.value}
            type="button"
            className={
              item.value === filter
                ? "story-submissions-filter story-submissions-filter--active"
                : "story-submissions-filter"
            }
            onClick={() => onFilterChange(item.value)}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="story-submissions-list">
        {loading ? <div className="story-submissions-empty">Загружаю истории...</div> : null}
        {!loading && items.length === 0 ? (
          <div className="story-submissions-empty">По этому фильтру пока ничего нет.</div>
        ) : null}

        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            className={
              item.id === selectedId
                ? "story-submissions-card story-submissions-card--active"
                : "story-submissions-card"
            }
            onClick={() => onSelect(item.id)}
          >
            <div className="story-submissions-card__top">
              <strong>{item.heroName.trim() || "Без имени героя"}</strong>
              <span className={`story-submissions-badge story-submissions-badge--${item.status}`}>
                {item.status}
              </span>
            </div>
            <div className="story-submissions-card__meta">
              <span>{item.mode.trim() || "Без режима"}</span>
              <span>{formatDate(item.createdAt)}</span>
            </div>
            <p className="story-submissions-card__snippet">
              {item.snippet.trim() || "История ещё почти пустая."}
            </p>
          </button>
        ))}
      </div>
    </aside>
  );
}
