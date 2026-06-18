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
  AnalyticsQualityIssue,
} from "../../lib/server/admin-analytics";

type AnalyticsTab = "overview" | "content" | "funnels" | "languages" | "pages" | "studio" | "opportunities" | "quality" | "export";
type SortKey = keyof AnalyticsContentRow;

const tabLabels: Array<{ key: AnalyticsTab; label: string }> = [
  { key: "overview", label: "Overview" },
  { key: "content", label: "Content" },
  { key: "funnels", label: "Funnels" },
  { key: "languages", label: "Languages" },
  { key: "pages", label: "Pages" },
  { key: "studio", label: "Studio" },
  { key: "opportunities", label: "Что делать" },
  { key: "quality", label: "Data Quality" },
  { key: "export", label: "Export" },
];

const periodLabels: Record<AnalyticsPeriodKey, string> = {
  "7d": "7 дней",
  "14d": "14 дней",
  "30d": "30 дней",
  "90d": "90 дней",
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
  if (value == null) return "новое";
  if (value === 0) return "0%";
  return `${value > 0 ? "+" : ""}${value}%`;
}

function numberText(value: number, suffix = "") {
  return `${new Intl.NumberFormat("ru-RU").format(value)}${suffix}`;
}

function tableToCsv(headers: string[], rows: Array<Array<string | number | null>>) {
  const escape = (value: string | number | null) => `"${(value == null ? "" : String(value)).replace(/"/g, '""')}"`;
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

function buildCsv(payload: AnalyticsAdminPayload, tab: AnalyticsTab) {
  if (tab === "content") {
    return tableToCsv(
      ["title", "type", "opens", "completions", "progress", "exits", "shares", "errors", "completion_rate", "growth_percent"],
      payload.content.rows.map((row) => [row.title, row.type, row.opens, row.completions, row.progress, row.exits, row.shares, row.errors, row.completionStatus, row.growthPercent]),
    );
  }
  if (tab === "languages") {
    return tableToCsv(["lang", "events", "opens", "completions", "exits", "completion_rate"], payload.languages.map((row) => [row.lang, row.events, row.opens, row.completions, row.exits, row.completionRate]));
  }
  if (tab === "pages") {
    return tableToCsv(["title", "page", "views", "visitors", "exits", "exit_rate", "avg_duration", "duration_status", "avg_events"], payload.pages.topPages.map((row) => [row.title, row.page, row.views, row.visitors, row.exits, row.exitRate, row.averageDurationSeconds, row.durationStatus, row.averageEvents]));
  }
  if (tab === "funnels") {
    return tableToCsv(["funnel", "step", "count", "conversion_percent", "note"], payload.funnels.flatMap((funnel) => funnel.steps.map((step) => [funnel.title, step.step, step.count, step.conversionPercent, step.note])));
  }
  if (tab === "studio") {
    return tableToCsv(["step", "count", "conversion_percent", "note"], payload.studio.breakpoints.map((step) => [step.step, step.count, step.conversionPercent, step.note]));
  }
  return tableToCsv(["date", "visitors", "sessions", "events"], payload.growth.map((row) => [row.date, row.visitors, row.sessions, row.events]));
}

function EmptyState({ text }: { text: string }) {
  return <div className="analytics-empty">{text}</div>;
}

function PeriodButtons({ period, setPeriod, availablePeriods }: { period: AnalyticsPeriodKey; setPeriod: (period: AnalyticsPeriodKey) => void; availablePeriods: AnalyticsPeriodKey[] }) {
  return (
    <div className="analytics-periods">
      {availablePeriods.map((key) => (
        <button key={key} className={`analytics-chip ${period === key ? "analytics-chip--active" : ""}`} type="button" onClick={() => setPeriod(key)}>
          {periodLabels[key]}
        </button>
      ))}
    </div>
  );
}

function ExportButtons({ payload, tab }: { payload: AnalyticsAdminPayload; tab: AnalyticsTab }) {
  const [status, setStatus] = useState("");
  const copyText = tab === "export" ? payload.exportSummary : payload.exportSummary;

  return (
    <div className="analytics-export">
      <button
        className="analytics-button analytics-button--primary"
        type="button"
        onClick={async () => {
          await copyTextToClipboard(copyText);
          setStatus("Скопировано");
        }}
      >
        ChatGPT
      </button>
      <button className="analytics-button" type="button" onClick={() => downloadFile(`laplapla-analytics-${payload.period}.json`, JSON.stringify(payload, null, 2), "application/json")}>
        JSON
      </button>
      <button className="analytics-button" type="button" onClick={() => downloadFile(`laplapla-${tab}-${payload.period}.csv`, buildCsv(payload, tab), "text/csv;charset=utf-8")}>
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
      <div className={`analytics-metric__change ${positive ? "analytics-metric__change--up" : "analytics-metric__change--down"}`}>{formatChange(card.changePercent)}</div>
      <p>{card.explanation}</p>
      <p><strong>Как считается:</strong> {card.formula}</p>
      <p><strong>События:</strong> {card.events.join(", ")}</p>
      <p><strong>Доверие:</strong> {card.confidence}. {card.reliability}</p>
    </article>
  );
}

function Bar({ value, max }: { value: number; max: number }) {
  return <span className="analytics-bar"><span style={{ width: `${Math.max(4, Math.round((value / Math.max(1, max)) * 100))}%` }} /></span>;
}

function LineChart({ payload }: { payload: AnalyticsAdminPayload }) {
  const [visible, setVisible] = useState({ visitors: true, sessions: true, events: true });
  const data = payload.growth;
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
          <h2>Динамика по дням</h2>
          <p>Посетители, сессии и события за выбранный период. Резкие провалы часто означают проблему с трекингом или релизом.</p>
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
      </div>
      {data.length === 0 ? <EmptyState text="Пока нет данных для графика." /> : (
        <div className="analytics-chart-wrap">
          <svg className="analytics-line-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="График активности">
            <line x1={padding} y1={height - padding} x2={width - padding} y2={height - padding} />
            <line x1={padding} y1={padding} x2={padding} y2={height - padding} />
            {visible.visitors ? <polyline points={points("visitors")} stroke={metricColors.visitors} /> : null}
            {visible.sessions ? <polyline points={points("sessions")} stroke={metricColors.sessions} /> : null}
            {visible.events ? <polyline points={points("events")} stroke={metricColors.events} /> : null}
          </svg>
          <div className="analytics-chart-labels" style={{ gridTemplateColumns: `repeat(${data.length}, minmax(0, 1fr))` }}>
            {data.map((row) => <span key={row.date}>{row.date.slice(5)}</span>)}
          </div>
        </div>
      )}
    </section>
  );
}

function OverviewTab({ payload }: { payload: AnalyticsAdminPayload }) {
  return (
    <>
      <div className="analytics-metric-grid">
        {payload.periods[payload.period].map((card) => <MetricCard key={card.key} card={card} />)}
      </div>
      <LineChart payload={payload} />
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
            {header("title", "Контент")}
            {header("type", "Раздел")}
            {header("opens", "Открытия")}
            {header("completions", "Завершения")}
            {header("progress", "Progress")}
            {header("exits", "Exits")}
            {header("shares", "Share")}
            {header("errors", "Ошибки")}
            {header("completionRate", "Completion")}
          </tr>
        </thead>
        <tbody>
          {sorted.map((row) => (
            <tr key={row.key}>
              <td>{row.title}</td>
              <td>{row.type}</td>
              <td>{row.opens}</td>
              <td>{row.completions}</td>
              <td>{row.progress}</td>
              <td>{row.exits}</td>
              <td>{row.shares}</td>
              <td>{row.errors}</td>
              <td>{row.completionStatus}</td>
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
            <div key={`${title}-${row.key}`}>
              <strong>{row.title}</strong>
              <span>{row.type} · opens {row.opens} · completes {row.completions} · exits {row.exits} · completion {row.completionStatus}</span>
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
        <p className="analytics-help">Группировка идёт по `content_id`, затем `content_slug`, затем названию. Старые story/map/recipe события тоже попадают сюда.</p>
        {payload.content.rows.length === 0 ? <EmptyState text="Пока нет данных по контенту." /> : <ContentTable rows={payload.content.rows} />}
      </section>
      <div className="analytics-grid-2">
        <MiniList title="Лучший контент недели" rows={payload.content.best} empty="Пока нет открытий." />
        <MiniList title="Открывают, но не заканчивают" rows={payload.content.openedNotFinished} empty="Нет явных кандидатов." />
        <MiniList title="Высокий completion rate" rows={payload.content.highCompletion} empty="Пока мало завершений." />
        <MiniList title="Низкий completion rate" rows={payload.content.lowCompletion} empty="Пока нет слабых мест с достаточным трафиком." />
        <MiniList title="Кандидаты развивать дальше" rows={payload.content.developFurther} empty="Пока нет сильных кандидатов." />
      </div>
    </>
  );
}

function SimpleRows<T>({ rows, columns, empty }: { rows: T[]; columns: Array<{ label: string; render: (row: T) => string | number | null }>; empty: string }) {
  if (rows.length === 0) return <EmptyState text={empty} />;
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

function FunnelsTab({ payload }: { payload: AnalyticsAdminPayload }) {
  return (
    <div className="analytics-grid-1">
      {payload.funnels.map((funnel) => {
        const max = Math.max(1, ...funnel.steps.map((step) => step.count));
        return (
          <section key={funnel.key} className="analytics-panel">
            <h2>{funnel.title}</h2>
            <p className="analytics-help">{funnel.explanation} Доверие: {funnel.confidence}.</p>
            <div className="analytics-funnel">
              {funnel.steps.map((step) => (
                <div key={step.step} className="analytics-funnel-step">
                  <strong>{step.step}</strong>
                  <span>{step.count}</span>
                  <Bar value={step.count} max={max} />
                  <em>{step.conversionPercent == null ? "первый шаг" : `${step.conversionPercent}% от прошлого шага`}</em>
                  <p>{step.note}</p>
                </div>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function LanguagesTab({ payload }: { payload: AnalyticsAdminPayload }) {
  return (
    <section className="analytics-panel">
      <h2>Languages</h2>
      <p className="analytics-help">Язык берётся из `language`, потом из `properties`, потом из старого `lang`.</p>
      <SimpleRows
        rows={payload.languages}
        empty="Пока нет языковых данных."
        columns={[
          { label: "Язык", render: (row) => row.lang },
          { label: "События", render: (row) => row.events },
          { label: "Открытия", render: (row) => row.opens },
          { label: "Завершения", render: (row) => row.completions },
          { label: "Уходы", render: (row) => row.exits },
          { label: "Completion", render: (row) => `${row.completionRate}%` },
          { label: "Рост", render: (row) => formatChange(row.growthPercent) },
        ]}
      />
    </section>
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
          { label: "Контент", render: (row) => row.title === row.page ? row.page : `${row.title} · ${row.page}` },
          { label: "Просмотры", render: (row) => row.views },
          { label: "Посетители", render: (row) => row.visitors },
          { label: "Выходы", render: (row) => row.exits },
          { label: "Exit rate", render: (row) => `${row.exitRate}%` },
          { label: "Длительность", render: (row) => row.averageDurationSeconds == null ? "нет данных" : `${row.averageDurationSeconds} сек. · ${row.durationStatus}` },
        ]}
      />
    </section>
  );
}

function PagesTab({ payload }: { payload: AnalyticsAdminPayload }) {
  return (
    <div className="analytics-grid-1">
      <PagePanel title="Самые посещаемые страницы" help="Страницы с максимальным вниманием пользователей." rows={payload.pages.topPages} />
      <PagePanel title="Страницы с высоким выходом" help="Где визит чаще заканчивается или приходит `content_exit`." rows={payload.pages.highExitPages} />
      <PagePanel title="Низкая длительность" help="Страницы с коротким `duration_seconds`, если это поле приходит." rows={payload.pages.lowDurationPages} />
      <section className="analytics-panel">
        <h2>Переходы между страницами</h2>
        <p className="analytics-help">Считается по порядку событий внутри `session_id`.</p>
        {payload.pages.transitions.length === 0 ? <EmptyState text="Пока нет достаточных данных о переходах." /> : (
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
    </div>
  );
}

function StudioTab({ payload }: { payload: AnalyticsAdminPayload }) {
  const studioCard = (card: Pick<AnalyticsMetricCard, "key" | "label" | "value" | "explanation">, events: string[]): AnalyticsMetricCard => ({
    ...card,
    changePercent: 0,
    formula: "count events",
    events,
    confidence: "средняя",
    reliability: "Studio-счётчик точен, если событие отправляется во всех вариантах студии.",
  });
  return (
    <section className="analytics-panel">
      <h2>Studio</h2>
      <p className="analytics-help">Путь студии показывает, где люди теряются: открытие, создание проекта, добавление медиа, экспорт и ошибки.</p>
      <div className="analytics-metric-grid analytics-metric-grid--compact">
        <MetricCard card={studioCard({ key: "studio-open", label: "Открыли студию", value: payload.studio.opened, explanation: "Событие `studio_open`." }, ["studio_open"])} />
        <MetricCard card={studioCard({ key: "project-created", label: "Создали проект", value: payload.studio.projectsCreated, explanation: "`studio_project_created` и старый `project_created`." }, ["studio_project_created", "project_created"])} />
        <MetricCard card={studioCard({ key: "export-completed", label: "Успешно экспортировали", value: payload.studio.exportCompleted, explanation: "`studio_export_completed` и старый `video_exported`." }, ["studio_export_completed", "video_exported"])} />
        <MetricCard card={studioCard({ key: "export-failed", label: "Export failed", value: payload.studio.exportFailed, explanation: "Ошибки экспорта из `studio_export_failed`." }, ["studio_export_failed"])} />
        <MetricCard card={studioCard({ key: "recording-started", label: "Recording started", value: payload.studio.recordingStarted, explanation: "Старт записи экрана/canvas." }, ["studio_recording_started"])} />
        <MetricCard card={studioCard({ key: "recording-completed", label: "Recording completed", value: payload.studio.recordingCompleted, explanation: "Успешное завершение записи." }, ["studio_recording_completed"])} />
        <MetricCard card={studioCard({ key: "recording-failed", label: "Recording failed", value: payload.studio.recordingFailed, explanation: "Ошибка записи." }, ["studio_recording_failed"])} />
      </div>
      <SimpleRows
        rows={payload.studio.breakpoints}
        empty="Пока нет studio-событий."
        columns={[
          { label: "Шаг", render: (row) => row.step },
          { label: "Count", render: (row) => row.count },
          { label: "Conversion", render: (row) => row.conversionPercent == null ? "первый шаг" : `${row.conversionPercent}%` },
          { label: "Комментарий", render: (row) => row.note },
        ]}
      />
      <div className="analytics-grid-1">
        {payload.studio.funnels.map((funnel) => {
          const max = Math.max(1, ...funnel.steps.map((step) => step.count));
          return (
            <section key={funnel.key} className="analytics-subpanel">
              <strong>{funnel.title}</strong>
              <span>{funnel.explanation} Доверие: {funnel.confidence}.</span>
              <div className="analytics-funnel analytics-funnel--compact">
                {funnel.steps.map((step) => (
                  <div key={step.step} className="analytics-funnel-step">
                    <strong>{step.step}</strong>
                    <span>{step.count}</span>
                    <Bar value={step.count} max={max} />
                    <em>{step.conversionPercent == null ? "первый шаг" : `${step.conversionPercent}%`}</em>
                  </div>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </section>
  );
}

function OpportunitiesTab({ payload }: { payload: AnalyticsAdminPayload }) {
  return (
    <section className="analytics-panel">
      <h2>Что делать дальше</h2>
      <p className="analytics-help">Это rule-based блок без LLM. Он смотрит на открытия, completion, exits, export funnel и языки.</p>
      <div className="analytics-opportunities">
        {payload.opportunities.map((item) => (
          <article key={item.title} className={`analytics-opportunity analytics-opportunity--${item.tone}`}>
            <h3>{item.title}</h3>
            <strong>Уверенность: {item.confidence}</strong>
            <p>{item.description}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

function QualityList({ title, rows, empty }: { title: string; rows: AnalyticsQualityIssue[]; empty: string }) {
  return (
    <section className="analytics-panel">
      <h2>{title}</h2>
      {rows.length === 0 ? <EmptyState text={empty} /> : (
        <div className="analytics-quality-list">
          {rows.map((row, index) => (
            <article key={`${row.title}-${index}`} className={`analytics-quality analytics-quality--${row.severity}`}>
              <strong>{row.title}{row.count == null ? "" : ` · ${row.count}`}</strong>
              <span>{row.description}</span>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function DataQualityTab({ payload }: { payload: AnalyticsAdminPayload }) {
  const missingRows = payload.dataQuality.missingExpectedEvents.map((eventName) => ({ title: eventName, description: "За выбранный период событие не приходило. Это не всегда ошибка: событие может относиться к экрану без трафика.", severity: "info" as const }));
  return (
    <div className="analytics-grid-2">
      <QualityList title="Summary / длинные периоды" rows={payload.dataQuality.summaryWarnings} empty="Для выбранного периода нет предупреждений по summary." />
      <QualityList title="События не встречались вообще" rows={payload.dataQuality.missingEverEvents} empty="Все ожидаемые события встречались в загруженном окне." />
      <QualityList title="События не пришли за период" rows={missingRows} empty="Все ожидаемые события встретились за период." />
      <QualityList title="Проблемы с properties" rows={payload.dataQuality.propertyIssues} empty="Критичные поля выглядят заполненными." />
      <QualityList title="Подозрительные дубликаты" rows={payload.dataQuality.duplicateIssues} empty="Быстрых повторов не найдено." />
      <QualityList title="Провалы по дням" rows={payload.dataQuality.dailyDrops} empty="Резких дневных провалов не видно." />
      <QualityList title="Что невозможно посчитать точно" rows={payload.dataQuality.unavailableMetrics} empty="Основные метрики можно посчитать." />
    </div>
  );
}

function ExportTab({ payload }: { payload: AnalyticsAdminPayload }) {
  const [status, setStatus] = useState("");
  return (
    <section className="analytics-panel">
      <h2>Export</h2>
      <p className="analytics-help">JSON содержит весь payload. CSV выгружается для активной вкладки. Текст для ChatGPT написан по-русски и готов для анализа без персональных данных.</p>
      <div className="analytics-control-row">
        <button className="analytics-button analytics-button--primary" type="button" onClick={async () => {
          await copyTextToClipboard(payload.exportSummary);
          setStatus("Текст скопирован");
        }}>
          Скопировать для ChatGPT
        </button>
        <button className="analytics-button" type="button" onClick={() => downloadFile(`laplapla-analytics-${payload.period}.json`, JSON.stringify(payload, null, 2), "application/json")}>JSON</button>
        <button className="analytics-button" type="button" onClick={() => downloadFile(`laplapla-overview-${payload.period}.csv`, buildCsv(payload, "overview"), "text/csv;charset=utf-8")}>CSV overview</button>
        {status ? <span className="analytics-copy-status">{status}</span> : null}
      </div>
      <pre className="analytics-export-text">{payload.exportSummary}</pre>
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

  const loadAnalytics = useCallback(async (selectedPeriod: AnalyticsPeriodKey) => {
    setLoading(true);
    setError(null);
    try {
      setPayload(await fetchJson<AnalyticsAdminPayload>(`/api/admin/analytics/overview?period=${selectedPeriod}`));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Не удалось загрузить аналитику.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (sessionChecked) {
      void loadAnalytics(period);
    }
  }, [loadAnalytics, period, sessionChecked]);

  useEffect(() => {
    if (payload && payload.period !== period) {
      setPeriod(payload.period);
    }
  }, [payload, period]);

  if (!sessionChecked) return null;

  return (
    <div className="analytics-page">
      <div className="admin-top-bar">
        <div className="admin-top-bar__row admin-top-bar__row--right"><AdminLogout /></div>
        <div className="admin-top-bar__row admin-top-bar__row--tabs"><AdminTabs /></div>
      </div>

      <main className="analytics-shell">
        <header className="analytics-header">
          <div>
            <h1>Analytics</h1>
            <p>Админский dashboard LapLapLa: продуктовые метрики, контент, воронки, качество данных и экспорт из Supabase `analytics_events`.</p>
          </div>
          <button className="analytics-button" type="button" onClick={() => void loadAnalytics(period)} disabled={loading}>
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
                <PeriodButtons period={period} setPeriod={setPeriod} availablePeriods={payload.availablePeriods} />
              </div>
              <ExportButtons payload={payload} tab={activeTab} />
            </div>

            {loading ? <div className="analytics-loading-line">Обновляю данные за {periodLabels[period]}...</div> : null}
            {activeTab === "overview" ? <OverviewTab payload={payload} /> : null}
            {activeTab === "content" ? <ContentTab payload={payload} /> : null}
            {activeTab === "funnels" ? <FunnelsTab payload={payload} /> : null}
            {activeTab === "languages" ? <LanguagesTab payload={payload} /> : null}
            {activeTab === "pages" ? <PagesTab payload={payload} /> : null}
            {activeTab === "studio" ? <StudioTab payload={payload} /> : null}
            {activeTab === "opportunities" ? <OpportunitiesTab payload={payload} /> : null}
            {activeTab === "quality" ? <DataQualityTab payload={payload} /> : null}
            {activeTab === "export" ? <ExportTab payload={payload} /> : null}
          </>
        ) : null}
      </main>
    </div>
  );
}
