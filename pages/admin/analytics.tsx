"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { AdminLogout } from "../../components/AdminLogout";
import { AdminTabs } from "../../components/AdminTabs";
import type {
  AnalyticsAdminPayload,
  AnalyticsContentRow,
  AnalyticsMetricCard,
  AnalyticsPageRow,
  AnalyticsPeriodKey,
} from "../../lib/server/admin-analytics";

type AnalyticsTab = "overview" | "content" | "funnels" | "languages" | "pages" | "studio" | "drawing" | "opportunities";
type SortKey = keyof AnalyticsContentRow;

const tabLabels: Array<{ key: AnalyticsTab; label: string }> = [
  { key: "overview", label: "Overview" },
  { key: "content", label: "Content" },
  { key: "funnels", label: "Funnels" },
  { key: "languages", label: "Languages" },
  { key: "pages", label: "Pages" },
  { key: "studio", label: "Studio" },
  { key: "drawing", label: "Drawing lesson" },
  { key: "opportunities", label: "Opportunities" },
];

const periodLabels: Record<AnalyticsPeriodKey, string> = {
  today: "Сегодня",
  "7d": "Последние 7 дней",
  "14d": "Последние 2 недели",
};

const metricColors = {
  visitors: "#2563eb",
  sessions: "#16a34a",
  events: "#f97316",
};

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { credentials: "include" });
  const data = (await response.json()) as T & { error?: string };
  if (!response.ok) {
    throw new Error(data.error || "Request failed.");
  }
  return data;
}

async function copyTextToClipboard(value: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  textarea.style.top = "0";
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  document.execCommand("copy");
  document.body.removeChild(textarea);
}

function formatChange(value: number | null) {
  if (value == null) {
    return "новое";
  }
  if (value === 0) {
    return "0%";
  }
  return `${value > 0 ? "+" : ""}${value}%`;
}

function numberText(value: number, suffix = "") {
  return `${new Intl.NumberFormat("ru-RU").format(value)}${suffix}`;
}

function tableToCsv(headers: string[], rows: Array<Array<string | number | null>>) {
  const escape = (value: string | number | null) => {
    const text = value == null ? "" : String(value);
    return `"${text.replace(/"/g, '""')}"`;
  };
  return [headers, ...rows].map((row) => row.map(escape).join(",")).join("\n");
}

function downloadFile(filename: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function buildExportText(payload: AnalyticsAdminPayload, tab: AnalyticsTab) {
  const lines: string[] = [`=== LAPLAPLA ANALYTICS: ${tab.toUpperCase()} ===`, `Generated: ${payload.generatedAt}`, ""];
  if (tab === "overview") {
    lines.push("=== VISITORS LAST 14 DAYS ===");
    payload.growth.forEach((item) => lines.push(`${item.date}: visitors=${item.visitors} sessions=${item.sessions} events=${item.events}`));
    lines.push("", "=== SUMMARY LAST 14 DAYS ===");
    payload.periods["14d"].forEach((card) => lines.push(`${card.label}: ${card.value}${card.suffix || ""} (${formatChange(card.changePercent)})`));
  }
  if (tab === "content") {
    lines.push("=== TOP CONTENT ===");
    payload.content.rows.forEach((row) => lines.push(`${row.title} | type=${row.type} | opens=${row.opens} | completed=${row.completions} | completion=${row.completionRate}% | growth=${formatChange(row.growthPercent)}`));
  }
  if (tab === "funnels") {
    lines.push("=== FUNNEL ===");
    payload.funnels.forEach((row) => lines.push(`${row.step}: users=${row.users} dropoff=${row.dropoffPercent == null ? "n/a" : `${row.dropoffPercent}%`}`));
  }
  if (tab === "languages") {
    lines.push("=== LANGUAGES ===");
    payload.languages.forEach((row) => lines.push(`${row.lang}: events=${row.events} completion=${row.completionRate}% growth=${formatChange(row.growthPercent)}`));
  }
  if (tab === "pages") {
    lines.push("=== TOP PAGES ===");
    payload.pages.topPages.forEach((row) => lines.push(`${row.page}: views=${row.views} visitors=${row.visitors} avg_events=${row.averageEvents}`));
    lines.push("", "=== TOP ENTRY PAGES ===");
    payload.pages.entryPages.forEach((row) => lines.push(`${row.page}: entries=${row.views} visitors=${row.visitors}`));
    lines.push("", "=== TOP EXIT PAGES ===");
    payload.pages.exitPages.forEach((row) => lines.push(`${row.page}: exits=${row.views} visitors=${row.visitors}`));
  }
  if (tab === "studio") {
    lines.push("=== STUDIO ===");
    lines.push(`projects_created=${payload.studio.projectsCreated}`);
    lines.push(`videos_exported=${payload.studio.videosExported}`);
    lines.push(`downloads=${payload.studio.downloads}`);
    lines.push(`average_slides=${payload.studio.averageSlides ?? "n/a"}`);
    lines.push(`average_video_seconds=${payload.studio.averageVideoSeconds ?? "n/a"}`);
  }
  if (tab === "drawing") {
    lines.push("=== DRAWING LESSONS ===");
    payload.drawingLessons.lessons.forEach((row) => lines.push(`${row.title}: completions=${row.completions} growth=${formatChange(row.growthPercent)}`));
    lines.push("", "=== DRAWING CATEGORIES ===");
    payload.drawingLessons.categories.forEach((row) => lines.push(`${row.title}: completions=${row.completions}`));
  }
  if (tab === "opportunities") {
    lines.push("=== OPPORTUNITIES ===");
    payload.opportunities.forEach((item) => lines.push(`${item.title}\n${item.description}\n`));
  }
  return lines.join("\n");
}

function buildCsv(payload: AnalyticsAdminPayload, tab: AnalyticsTab) {
  if (tab === "content") {
    return tableToCsv(["title", "type", "opens", "completions", "completion_rate", "growth_percent"], payload.content.rows.map((row) => [row.title, row.type, row.opens, row.completions, row.completionRate, row.growthPercent]));
  }
  if (tab === "languages") {
    return tableToCsv(["lang", "events", "completion_rate", "growth_percent"], payload.languages.map((row) => [row.lang, row.events, row.completionRate, row.growthPercent]));
  }
  if (tab === "pages") {
    return tableToCsv(["page", "views", "visitors", "average_events"], payload.pages.topPages.map((row) => [row.page, row.views, row.visitors, row.averageEvents]));
  }
  if (tab === "funnels") {
    return tableToCsv(["step", "users", "dropoff_percent"], payload.funnels.map((row) => [row.step, row.users, row.dropoffPercent]));
  }
  return tableToCsv(["date", "visitors", "sessions", "events"], payload.growth.map((row) => [row.date, row.visitors, row.sessions, row.events]));
}

function EmptyState({ text }: { text: string }) {
  return <div className="analytics-empty">{text}</div>;
}

function PeriodButtons({ period, setPeriod }: { period: AnalyticsPeriodKey; setPeriod: (period: AnalyticsPeriodKey) => void }) {
  return (
    <div className="analytics-periods">
      {(Object.keys(periodLabels) as AnalyticsPeriodKey[]).map((key) => (
        <button key={key} className={`analytics-chip ${period === key ? "analytics-chip--active" : ""}`} type="button" onClick={() => setPeriod(key)}>
          {periodLabels[key]}
        </button>
      ))}
    </div>
  );
}

function ExportButtons({ payload, tab }: { payload: AnalyticsAdminPayload; tab: AnalyticsTab }) {
  const [status, setStatus] = useState("");
  const text = useMemo(() => buildExportText(payload, tab), [payload, tab]);

  return (
    <div className="analytics-export">
      <button
        className="analytics-button analytics-button--primary"
        type="button"
        onClick={async () => {
          await copyTextToClipboard(text);
          setStatus("Данные скопированы");
        }}
      >
        ChatGPT
      </button>
      <button className="analytics-button" type="button" onClick={() => downloadFile(`laplapla-${tab}.json`, JSON.stringify(payload, null, 2), "application/json")}>
        JSON
      </button>
      <button className="analytics-button" type="button" onClick={() => downloadFile(`laplapla-${tab}.csv`, buildCsv(payload, tab), "text/csv;charset=utf-8")}>
        CSV
      </button>
      {status ? <span className="analytics-copy-status">{status}</span> : null}
    </div>
  );
}

function MetricCard({ card }: { card: AnalyticsMetricCard }) {
  const positive = card.changePercent == null || card.changePercent >= 0;
  return (
    <article className="analytics-metric">
      <div className="analytics-metric__label">{card.label}</div>
      <div className="analytics-metric__value">{numberText(card.value, card.suffix)}</div>
      <div className={`analytics-metric__change ${positive ? "analytics-metric__change--up" : "analytics-metric__change--down"}`}>
        {formatChange(card.changePercent)}
      </div>
      <p>{card.explanation}</p>
    </article>
  );
}

function LineChart({ payload }: { payload: AnalyticsAdminPayload }) {
  const [visible, setVisible] = useState({ visitors: true, sessions: true, events: true });
  const [days, setDays] = useState<7 | 14>(14);
  const data = payload.growth.slice(days === 7 ? -7 : 0);
  const max = Math.max(1, ...data.flatMap((row) => [visible.visitors ? row.visitors : 0, visible.sessions ? row.sessions : 0, visible.events ? row.events : 0]));
  const width = 760;
  const height = 260;
  const padding = 32;

  const points = (key: "visitors" | "sessions" | "events") => data.map((row, index) => {
    const x = padding + (index * (width - padding * 2)) / Math.max(1, data.length - 1);
    const y = height - padding - (row[key] / max) * (height - padding * 2);
    return `${x},${y}`;
  }).join(" ");

  return (
    <section className="analytics-panel">
      <div className="analytics-section-head">
        <div>
          <h2>График роста</h2>
          <p>Этот график показывает, как менялись посетители, сессии и события по дням. Если линия растёт, значит активность на сайте увеличивается.</p>
        </div>
        <div className="analytics-control-row">
          <button className={`analytics-chip ${days === 7 ? "analytics-chip--active" : ""}`} type="button" onClick={() => setDays(7)}>7 дней</button>
          <button className={`analytics-chip ${days === 14 ? "analytics-chip--active" : ""}`} type="button" onClick={() => setDays(14)}>14 дней</button>
        </div>
      </div>
      <div className="analytics-control-row">
        {(["visitors", "sessions", "events"] as const).map((key) => (
          <label key={key} className="analytics-toggle">
            <input type="checkbox" checked={visible[key]} onChange={(event) => setVisible((current) => ({ ...current, [key]: event.target.checked }))} />
            <span style={{ backgroundColor: metricColors[key] }} />
            {key}
          </label>
        ))}
      </div>
      {data.length === 0 ? <EmptyState text="Пока нет данных для графика роста." /> : (
        <div className="analytics-chart-wrap">
          <svg className="analytics-line-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="График роста">
            <line x1={padding} y1={height - padding} x2={width - padding} y2={height - padding} />
            <line x1={padding} y1={padding} x2={padding} y2={height - padding} />
            {visible.visitors ? <polyline points={points("visitors")} stroke={metricColors.visitors} /> : null}
            {visible.sessions ? <polyline points={points("sessions")} stroke={metricColors.sessions} /> : null}
            {visible.events ? <polyline points={points("events")} stroke={metricColors.events} /> : null}
          </svg>
          <div className="analytics-chart-labels">
            {data.map((row) => <span key={row.date}>{row.date.slice(5)}</span>)}
          </div>
        </div>
      )}
    </section>
  );
}

function OverviewTab({ payload, period, setPeriod }: { payload: AnalyticsAdminPayload; period: AnalyticsPeriodKey; setPeriod: (period: AnalyticsPeriodKey) => void }) {
  return (
    <>
      <div className="analytics-metric-grid">
        {payload.periods[period].map((card) => <MetricCard key={card.key} card={card} />)}
      </div>
      <LineChart payload={payload} />
      <section className="analytics-panel">
        <h2>Схема переходов</h2>
        <p className="analytics-help">Этот блок показывает, с какой страницы пользователь чаще переходил дальше. Если переходов мало, значит данных пока недостаточно или люди смотрят только одну страницу за визит.</p>
        {payload.pages.transitions.length === 0 ? <EmptyState text="Пока нет достаточных данных о переходах между страницами." /> : (
          <div className="analytics-transition-list">
            {payload.pages.transitions.map((item) => (
              <div key={`${item.from}-${item.to}`} className="analytics-transition">
                <span>{item.from}</span>
                <strong>→</strong>
                <span>{item.to}</span>
                <b>{item.count}</b>
              </div>
            ))}
          </div>
        )}
      </section>
    </>
  );
}

function ContentTable({ rows }: { rows: AnalyticsContentRow[] }) {
  const [sortKey, setSortKey] = useState<SortKey>("opens");
  const [direction, setDirection] = useState<"asc" | "desc">("desc");
  const sorted = useMemo(() => [...rows].sort((a, b) => {
    const left = a[sortKey];
    const right = b[sortKey];
    const result = typeof left === "number" && typeof right === "number" ? left - right : String(left).localeCompare(String(right));
    return direction === "asc" ? result : -result;
  }), [direction, rows, sortKey]);

  const header = (key: SortKey, label: string) => (
    <th>
      <button type="button" onClick={() => {
        setDirection((current) => sortKey === key && current === "desc" ? "asc" : "desc");
        setSortKey(key);
      }}>
        {label}
      </button>
    </th>
  );

  return (
    <div className="analytics-table-wrap">
      <table className="analytics-table">
        <thead>
          <tr>
            {header("title", "Название")}
            {header("type", "Тип")}
            {header("opens", "Открытия")}
            {header("completions", "Завершения")}
            {header("completionRate", "Completion %")}
            {header("growthPercent", "Рост")}
          </tr>
        </thead>
        <tbody>
          {sorted.map((row) => (
            <tr key={`${row.type}-${row.title}`}>
              <td>{row.title}</td>
              <td>{row.type}</td>
              <td>{row.opens}</td>
              <td>{row.completions}</td>
              <td>{row.completionRate}%</td>
              <td>{formatChange(row.growthPercent)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MiniList({ title, rows, empty }: { title: string; rows: AnalyticsContentRow[]; empty: string }) {
  return (
    <section className="analytics-panel">
      <h3>{title}</h3>
      {rows.length === 0 ? <EmptyState text={empty} /> : (
        <div className="analytics-mini-list">
          {rows.map((row) => (
            <div key={`${title}-${row.type}-${row.title}`}>
              <strong>{row.title}</strong>
              <span>{row.type} · opens {row.opens} · completion {row.completionRate}% · рост {formatChange(row.growthPercent)}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function ContentTab({ payload }: { payload: AnalyticsAdminPayload }) {
  return (
    <>
      <section className="analytics-panel">
        <h2>Content</h2>
        <p className="analytics-help">Эта таблица показывает, что пользователи открывают и что доводят до конца. Высокий completion означает, что материал удерживает внимание.</p>
        {payload.content.rows.length === 0 ? <EmptyState text="Пока нет данных по контенту." /> : <ContentTable rows={payload.content.rows} />}
      </section>
      <div className="analytics-grid-2">
        <MiniList title="Лучший контент" rows={payload.content.best} empty="Пока нет контента с завершениями." />
        <MiniList title="Худший контент" rows={payload.content.worst} empty="Пока недостаточно открытий, чтобы честно выбрать слабые материалы." />
        <MiniList title="Быстрорастущий контент" rows={payload.content.fastest} empty="Пока не видно роста относительно прошлого периода." />
        <MiniList title="Скрытые жемчужины" rows={payload.content.hiddenGems} empty="Пока нет контента с высоким completion и низким трафиком." />
      </div>
    </>
  );
}

function SimpleRows<T>({ rows, columns, empty }: { rows: T[]; columns: Array<{ label: string; render: (row: T) => string | number }>; empty: string }) {
  if (rows.length === 0) {
    return <EmptyState text={empty} />;
  }
  return (
    <div className="analytics-table-wrap">
      <table className="analytics-table">
        <thead><tr>{columns.map((column) => <th key={column.label}>{column.label}</th>)}</tr></thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={index}>{columns.map((column) => <td key={column.label}>{column.render(row)}</td>)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PagePanel({ title, help, rows }: { title: string; help: string; rows: AnalyticsPageRow[] }) {
  return (
    <section className="analytics-panel">
      <h2>{title}</h2>
      <p className="analytics-help">{help}</p>
      <SimpleRows
        rows={rows}
        empty="Пока нет данных по страницам."
        columns={[
          { label: "Страница", render: (row) => row.page },
          { label: "Просмотры", render: (row) => row.views },
          { label: "Уникальные посетители", render: (row) => row.visitors },
          { label: "Среднее число событий", render: (row) => row.averageEvents },
        ]}
      />
    </section>
  );
}

export default function AnalyticsAdminPage() {
  const router = useRouter();
  const supabase = createClientComponentClient();
  const [sessionChecked, setSessionChecked] = useState(false);
  const [payload, setPayload] = useState<AnalyticsAdminPayload | null>(null);
  const [activeTab, setActiveTab] = useState<AnalyticsTab>("overview");
  const [period, setPeriod] = useState<AnalyticsPeriodKey>("7d");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) {
        router.replace("/login");
        return;
      }
      setSessionChecked(true);
    });
  }, [router, supabase]);

  const loadAnalytics = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setPayload(await fetchJson<AnalyticsAdminPayload>("/api/admin/analytics/overview"));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Не удалось загрузить аналитику.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (sessionChecked) {
      void loadAnalytics();
    }
  }, [loadAnalytics, sessionChecked]);

  if (!sessionChecked) {
    return null;
  }

  return (
    <div className="analytics-page">
      <div className="admin-top-bar">
        <div className="admin-top-bar__row admin-top-bar__row--right">
          <AdminLogout />
        </div>
        <div className="admin-top-bar__row admin-top-bar__row--tabs">
          <AdminTabs />
        </div>
      </div>

      <main className="analytics-shell">
        <header className="analytics-header">
          <div>
            <h1>Analytics</h1>
            <p>Продуктовая аналитика LapLapLa: что растёт, где люди уходят и какие идеи стоит развивать дальше.</p>
          </div>
          <button className="analytics-button" type="button" onClick={() => void loadAnalytics()} disabled={loading}>
            Обновить
          </button>
        </header>

        {error ? <div className="analytics-error">{error}</div> : null}
        {loading && !payload ? <EmptyState text="Загружаю аналитику..." /> : null}

        {payload ? (
          <>
            <div className="analytics-mode-row">
              <div className="analytics-mode-stack">
                <div className="analytics-tabs">
                  {tabLabels.map((tab) => (
                    <button key={tab.key} type="button" className={`analytics-tab ${activeTab === tab.key ? "analytics-tab--active" : ""}`} onClick={() => setActiveTab(tab.key)}>
                      {tab.label}
                    </button>
                  ))}
                </div>
                {activeTab === "overview" ? <PeriodButtons period={period} setPeriod={setPeriod} /> : null}
              </div>
              <ExportButtons payload={payload} tab={activeTab} />
            </div>

            {activeTab === "overview" ? <OverviewTab payload={payload} period={period} setPeriod={setPeriod} /> : null}
            {activeTab === "content" ? <ContentTab payload={payload} /> : null}
            {activeTab === "funnels" ? (
              <section className="analytics-panel">
                <h2>Funnels</h2>
                <p className="analytics-help">Этот отчёт показывает, на каком этапе пользователи чаще всего прекращают взаимодействие.</p>
                <div className="analytics-funnel">
                  {payload.funnels.map((step) => (
                    <div key={step.step} className="analytics-funnel-step">
                      <strong>{step.step}</strong>
                      <span>{step.users} пользователей</span>
                      <em>{step.dropoffPercent == null ? "первый шаг" : `потери ${step.dropoffPercent}%`}</em>
                    </div>
                  ))}
                </div>
              </section>
            ) : null}
            {activeTab === "languages" ? (
              <section className="analytics-panel">
                <h2>Languages</h2>
                <p className="analytics-help">Здесь видно, на каких языках пользователи активнее взаимодействуют с сайтом. Новые языки появятся автоматически, если начнут приходить в событиях.</p>
                <SimpleRows
                  rows={payload.languages}
                  empty="Пока нет языковых данных."
                  columns={[
                    { label: "Язык", render: (row) => row.lang },
                    { label: "События", render: (row) => row.events },
                    { label: "Completion", render: (row) => `${row.completionRate}%` },
                    { label: "Рост", render: (row) => formatChange(row.growthPercent) },
                  ]}
                />
              </section>
            ) : null}
            {activeTab === "pages" ? (
              <div className="analytics-grid-1">
                <PagePanel title="Top Pages" help="Самые просматриваемые страницы. Они показывают, куда чаще всего попадает внимание пользователей." rows={payload.pages.topPages} />
                <PagePanel title="Top Entry Pages" help="Страницы, с которых чаще всего начинается визит. Они важны как первое впечатление о сайте." rows={payload.pages.entryPages} />
                <PagePanel title="Top Exit Pages" help="Страницы, на которых визит чаще всего заканчивается. Высокое число выходов не всегда плохо, но такие страницы стоит проверять." rows={payload.pages.exitPages} />
              </div>
            ) : null}
            {activeTab === "studio" ? (
              <section className="analytics-panel">
                <h2>Studio</h2>
                <p className="analytics-help">Этот экран показывает, сколько пользователей создают проекты и доходят до результата: экспорта или скачивания.</p>
                <div className="analytics-metric-grid analytics-metric-grid--compact">
                  <MetricCard card={{ key: "projects", label: "Созданные проекты", value: payload.studio.projectsCreated, changePercent: 0, explanation: "Сколько проектов создано пользователями за последние 2 недели." }} />
                  <MetricCard card={{ key: "exports", label: "Экспортированные видео", value: payload.studio.videosExported, changePercent: 0, explanation: "Сколько раз пользователи получили готовое видео." }} />
                  <MetricCard card={{ key: "downloads", label: "Скачивания", value: payload.studio.downloads, changePercent: 0, explanation: "Скачивания показывают, что результат оказался достаточно ценным, чтобы забрать его себе." }} />
                </div>
                <div className="analytics-grid-2">
                  <div className="analytics-subpanel"><strong>Среднее количество слайдов</strong><span>{payload.studio.averageSlides ?? "нет данных"}</span></div>
                  <div className="analytics-subpanel"><strong>Средняя длина видео</strong><span>{payload.studio.averageVideoSeconds == null ? "нет данных" : `${payload.studio.averageVideoSeconds} сек.`}</span></div>
                  <div className="analytics-subpanel"><strong>Топ пресетов</strong><span>{payload.studio.topPresets.map((item) => `${item.label}: ${item.count}`).join(", ") || "нет данных"}</span></div>
                  <div className="analytics-subpanel"><strong>Топ языков</strong><span>{payload.studio.topLanguages.map((item) => `${item.label}: ${item.count}`).join(", ") || "нет данных"}</span></div>
                </div>
              </section>
            ) : null}
            {activeTab === "drawing" ? (
              <div className="analytics-grid-2">
                <section className="analytics-panel">
                  <h2>Какие уроки пройдены</h2>
                  <p className="analytics-help">Здесь видно, какие drawing lessons пользователи завершали чаще всего.</p>
                  <SimpleRows rows={payload.drawingLessons.lessons} empty="Пока нет завершённых уроков рисования." columns={[
                    { label: "Урок", render: (row) => row.title },
                    { label: "Завершения", render: (row) => row.completions },
                    { label: "Рост", render: (row) => formatChange(row.growthPercent) },
                  ]} />
                </section>
                <section className="analytics-panel">
                  <h2>Категории</h2>
                  <p className="analytics-help">Категории помогают понять, какие темы рисования стоит развивать дальше.</p>
                  <SimpleRows rows={payload.drawingLessons.categories} empty="Пока нет данных по категориям." columns={[
                    { label: "Категория", render: (row) => row.title },
                    { label: "Завершения", render: (row) => row.completions },
                  ]} />
                </section>
              </div>
            ) : null}
            {activeTab === "opportunities" ? (
              <section className="analytics-panel">
                <h2>Opportunities</h2>
                <p className="analytics-help">Этот экран автоматически ищет сигналы, которые помогают принимать решения: что продвигать, что улучшить и какие направления растут.</p>
                <div className="analytics-opportunities">
                  {payload.opportunities.map((item) => (
                    <article key={item.title} className={`analytics-opportunity analytics-opportunity--${item.tone}`}>
                      <h3>{item.title}</h3>
                      <p>{item.description}</p>
                    </article>
                  ))}
                </div>
              </section>
            ) : null}
          </>
        ) : null}
      </main>
    </div>
  );
}
