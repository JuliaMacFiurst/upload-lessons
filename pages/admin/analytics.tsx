"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/router";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { AdminLogout } from "../../components/AdminLogout";
import { AdminTabs } from "../../components/AdminTabs";
import {
  getTestingReminderState,
  TESTING_REMINDER_TEXT,
  TESTING_REMINDER_VISITOR_THRESHOLD,
} from "../../lib/admin-analytics-reminder";
import { buildAnalyticsCsv, createLatestRequestCoordinator } from "../../lib/admin-analytics-client";
import type {
  AnalyticsAdminPayload,
  AnalyticsContentRow,
  AnalyticsMetricCard,
  AnalyticsPageRow,
  AnalyticsPeriodKey,
  AnalyticsQualityIssue,
  CommerceAnalyticsEnvironment,
  CommerceAnalyticsReportV1,
} from "../../lib/server/admin-analytics";

type AnalyticsTab = "overview" | "content" | "funnels" | "languages" | "pages" | "studio" | "acquisition" | "commerce" | "opportunities" | "quality" | "export";
type SortKey = keyof AnalyticsContentRow;

const tabLabels: Array<{ key: AnalyticsTab; label: string }> = [
  { key: "overview", label: "Overview" },
  { key: "content", label: "Content" },
  { key: "funnels", label: "Funnels" },
  { key: "languages", label: "Languages" },
  { key: "pages", label: "Pages" },
  { key: "studio", label: "Studio" },
  { key: "acquisition", label: "Acquisition" },
  { key: "commerce", label: "Commerce Analytics" },
  { key: "opportunities", label: "Что делать" },
  { key: "quality", label: "Data Quality" },
  { key: "export", label: "Export" },
];

const periodLabels: Record<AnalyticsPeriodKey, string> = {
  "24h": "24 часа",
  "7d": "7 дней",
  "14d": "14 дней",
};

const metricColors = {
  visitors: "#2563eb",
  sessions: "#16a34a",
  events: "#f97316",
};

async function fetchJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, { credentials: "include", cache: "no-store", signal });
  const data = (await response.json()) as T & { error?: string; requestId?: string };
  if (!response.ok) {
    const requestSuffix = data.requestId ? ` (ID: ${data.requestId})` : "";
    throw new Error(`Не удалось загрузить аналитику${requestSuffix}`);
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
  const copied = document.execCommand("copy");
  document.body.removeChild(textarea);
  if (!copied) {
    throw new Error("Clipboard is unavailable");
  }
}

function formatChange(value: number | null) {
  if (value == null) return "новое";
  if (value === 0) return "0%";
  return `${value > 0 ? "+" : ""}${value}%`;
}

function numberText(value: number, suffix = "") {
  return `${new Intl.NumberFormat("ru-RU").format(value)}${suffix}`;
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

function formatMinorUnits(value: number, currency: string) {
  try {
    const options = new Intl.NumberFormat("en", { style: "currency", currency }).resolvedOptions();
    const divisor = 10 ** (options.maximumFractionDigits ?? 2);
    return new Intl.NumberFormat("ru-RU", { style: "currency", currency }).format(value / divisor);
  } catch {
    return `${value} ${currency} minor units`;
  }
}

function CountCards({ rows }: { rows: Array<{ label: string; value: number | string; help: string }> }) {
  return <div className="analytics-metric-grid analytics-metric-grid--compact">{rows.map((row) => (
    <article key={row.label} className="analytics-metric">
      <div className="analytics-metric__label">{row.label}</div>
      <div className="analytics-metric__value">{typeof row.value === "number" ? numberText(row.value) : row.value}</div>
      <p>{row.help}</p>
    </article>
  ))}</div>;
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

function ExportButtons({ payload, tab, disabled }: { payload: AnalyticsAdminPayload; tab: AnalyticsTab; disabled: boolean }) {
  const [status, setStatus] = useState("");
  const copyText = tab === "export" ? payload.exportSummary : payload.exportSummary;

  return (
    <div className="analytics-export">
      <button
        className="analytics-button analytics-button--primary"
        type="button"
        disabled={disabled}
        onClick={async () => {
          await copyTextToClipboard(copyText);
          setStatus("Скопировано");
        }}
      >
        ChatGPT
      </button>
      <button className="analytics-button" type="button" disabled={disabled} onClick={() => downloadFile(`laplapla-analytics-${payload.period}.json`, JSON.stringify(payload, null, 2), "application/json")}>
        JSON
      </button>
      <button className="analytics-button" type="button" disabled={disabled} onClick={() => downloadFile(`laplapla-${tab}-${payload.period}.csv`, buildAnalyticsCsv(payload, tab), "text/csv;charset=utf-8")}>
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
      <div className="analytics-metric__value">{card.valueText || numberText(card.value, card.suffix)}</div>
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
  const [copyState, setCopyState] = useState<"idle" | "copied" | "error">("idle");
  const todayMetrics = [
    ["Посетители сегодня", payload.today.visitors],
    ["Сессии сегодня", payload.today.sessions],
    ["События сегодня", payload.today.events],
    ["Созданные проекты сегодня", payload.today.projectsCreated],
  ] as const;
  const rollingMetrics = [
    ["Последние 12 часов", payload.rollingActivity.last12Hours],
    ["Последние 24 часа", payload.rollingActivity.last24Hours],
  ] as const;
  const reminderState = getTestingReminderState(payload.today.visitors, new Date().getHours());

  const copyReminder = async () => {
    setCopyState("idle");
    try {
      await copyTextToClipboard(TESTING_REMINDER_TEXT);
      setCopyState("copied");
      window.setTimeout(() => setCopyState("idle"), 2000);
    } catch {
      setCopyState("error");
    }
  };

  return (
    <>
      <section className="analytics-panel">
        <div className="analytics-section-head">
          <div>
            <h2>Сегодня</h2>
            <p>{payload.today.date}, UTC · данные с 00:00 до момента обновления</p>
          </div>
        </div>
        <div className="analytics-metric-grid">
          {todayMetrics.map(([label, value]) => (
            <article className="analytics-metric" key={label}>
              <div className="analytics-metric__label">{label}</div>
              <div className="analytics-metric__value">{numberText(value)}</div>
            </article>
          ))}
        </div>
        <div className="analytics-metric-grid">
          {rollingMetrics.map(([label, metrics]) => (
            <article className="analytics-metric" key={label}>
              <div className="analytics-metric__label">{label}</div>
              <p>Посетители: <strong>{numberText(metrics.visitors)}</strong></p>
              <p>Сессии: <strong>{numberText(metrics.sessions)}</strong></p>
            </article>
          ))}
        </div>
      </section>
      <section className="analytics-panel">
        <h2>Testing reminder</h2>
        {reminderState === "reminder-needed" ? (
          <div className="analytics-error" role="status">
            <div>
              <strong>Сегодня пока мало тестировщиков</strong>
              <div>Посетителей сегодня: {payload.today.visitors}</div>
              <div>Цель для напоминания: {TESTING_REMINDER_VISITOR_THRESHOLD}</div>
            </div>
            <button className="analytics-button" type="button" onClick={() => void copyReminder()}>
              {copyState === "copied" ? "✓ Copied" : "Copy reminder"}
            </button>
            {copyState === "error" ? <span className="analytics-copy-status" role="alert">Не удалось скопировать сообщение</span> : null}
          </div>
        ) : reminderState === "activity-good" ? (
          <p>Testing activity looks good today · 15+ visitors</p>
        ) : (
          <p>Проверка активности для напоминания начнётся после 09:00 по вашему локальному времени.</p>
        )}
      </section>
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
  const showProgress = rows.some((row) => row.hasProgressData);
  const showShare = rows.some((row) => row.hasShareData);
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
            {showProgress ? header("progress", "Progress") : null}
            {header("exits", "Exits")}
            {showShare ? header("shares", "Share") : null}
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
              {showProgress ? <td>{row.progress}</td> : null}
              <td>{row.exits}</td>
              {showShare ? <td>{row.shares}</td> : null}
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
  if (payload.funnels.length === 0) {
    return <EmptyState text="Funnels временно скрыты: Phase 1 не связывает шаги в одну cohort/attempt цепочку, поэтому независимые event counts не выдаются за conversion." />;
  }
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
          { label: "Completion", render: (row) => row.completionStatus },
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
        ]}
      />
    </section>
  );
}

function PagesTab({ payload }: { payload: AnalyticsAdminPayload }) {
  return (
    <div className="analytics-grid-1">
      <PagePanel title="Самые посещаемые страницы" help="Страницы с максимальным числом canonical page_view." rows={payload.pages.topPages} />
      <section className="analytics-panel">
        <h2>Exit rate</h2>
        <p className="analytics-help">Не показывается: прежняя формула смешивала content_exit и page_view и могла превышать 100%. Для Phase 1 используется session-level bounce rate.</p>
      </section>
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
        <MetricCard card={studioCard({ key: "studio-open", label: "Открыли студию", value: payload.studio.opened, explanation: "Фактический mount Studio: событие `studio_open`." }, ["studio_open"])} />
        <MetricCard card={studioCard({ key: "project-created", label: "Создали проект", value: payload.studio.projectsCreated, explanation: "`studio_project_created` и старый `project_created`." }, ["studio_project_created", "project_created"])} />
        <MetricCard card={studioCard({ key: "export-completed", label: "Успешные экспорты", value: payload.studio.successfulExports, explanation: "`studio_export_completed` и legacy `video_exported`; recordings показаны отдельно." }, ["studio_export_completed", "video_exported"])} />
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
      <h3>Export method</h3>
      <SimpleRows
        rows={payload.studio.exportMethods}
        empty="Пока нет данных по export_method."
        columns={[
          { label: "Метод", render: (row) => row.method },
          { label: "Started", render: (row) => row.started },
          { label: "Completed", render: (row) => row.completed },
          { label: "Failed", render: (row) => row.failed },
        ]}
      />
      {payload.studio.funnelBlockedReason ? <div className="analytics-error">{payload.studio.funnelBlockedReason}</div> : null}
      <div className="analytics-grid-1">
        {payload.studio.funnelBlockedReason ? null : payload.studio.funnels.map((funnel) => {
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

function CommerceQuality({ report }: { report: CommerceAnalyticsReportV1 }) {
  const quality = report.data_quality;
  const warnings = [
    ["Traffic may be truncated", quality.traffic_may_be_truncated ? 1 : 0, `Raw traffic retention: ${quality.raw_traffic_retention_days} days.`],
    ["Events without visitor ID", quality.events_without_visitor_id, "Unique visitor counts may be incomplete."],
    ["Events without session ID", quality.events_without_session_id, "Session counts may be incomplete."],
    ["Visitor identity conflicts", quality.visitor_identity_conflict_events, "Legacy/current visitor namespaces conflict in these events."],
    ["Legacy visitor fallback", quality.legacy_visitor_fallback_events, "Rows counted through the legacy visitor field."],
    ["Legacy null attribution", quality.legacy_null_attribution_orders, "Orders remain explicitly Unknown."],
    ["Invalid attribution", quality.invalid_attribution_orders, "Malformed snapshots are not treated as attributed."],
    ["Unknown-environment orders", quality.unknown_environment_orders, "Not assigned to Live or Sandbox totals."],
    ["Unknown-environment paid orders", quality.unknown_environment_paid_orders, "Not assigned to Live or Sandbox revenue."],
    ["Refund/order environment mismatch", quality.refund_order_environment_mismatch_count, "Financial environment attribution is incomplete."],
    ["Paid orders without items", quality.paid_orders_without_items, "Product breakdown may be incomplete."],
    ["Paid item total mismatch", quality.paid_orders_with_item_total_mismatch, "Product gross may not reconcile to order gross."],
    ["Paid item currency mismatch", quality.paid_orders_with_item_currency_mismatch, "Product currency breakdown may be incomplete."],
  ] as const;
  const visible = warnings.filter(([, count]) => count > 0);
  return (
    <section className="analytics-panel">
      <h2>Commerce data quality</h2>
      {quality.status === "data incomplete" ? <div className="analytics-error" role="alert"><strong>Data incomplete.</strong> Проверьте предупреждения перед интерпретацией финансовых показателей.</div> : <p className="analytics-help">RPC сообщает: data ok.</p>}
      {visible.length === 0 ? <EmptyState text="Commerce RPC не сообщил предупреждений для выбранного периода." /> : (
        <SimpleRows rows={visible} empty="" columns={[
          { label: "Проверка", render: (row) => row[0] },
          { label: "Count", render: (row) => row[1] },
          { label: "Контекст", render: (row) => row[2] },
        ]} />
      )}
      {quality.unknown_environment_paid_minor.length > 0 ? (
        <SimpleRows rows={quality.unknown_environment_paid_minor} empty="" columns={[
          { label: "Unknown currency", render: (row) => row.currency },
          { label: "Paid amount outside Live/Sandbox", render: (row) => formatMinorUnits(row.paid_minor, row.currency) },
        ]} />
      ) : null}
    </section>
  );
}

function SourceTable({ title, rows }: { title: string; rows: CommerceAnalyticsReportV1["sources"]["first_touch"] }) {
  return (
    <section className="analytics-panel">
      <h2>{title}</h2>
      <SimpleRows rows={rows} empty="Нет paid orders с данными этого touchpoint." columns={[
        { label: "Source", render: (row) => row.source },
        { label: "UTM source", render: (row) => row.utm_source || "—" },
        { label: "UTM medium", render: (row) => row.utm_medium || "—" },
        { label: "UTM campaign", render: (row) => row.utm_campaign || "—" },
        { label: "Paid orders", render: (row) => row.paid_orders },
        { label: "Gross", render: (row) => formatMinorUnits(row.gross_minor, row.currency) },
        { label: "Currency", render: (row) => row.currency },
      ]} />
    </section>
  );
}

function AcquisitionTab({ payload }: { payload: AnalyticsAdminPayload }) {
  const report = payload.commerceAnalytics as CommerceAnalyticsReportV1;
  return (
    <div className="analytics-grid-1">
      <section className="analytics-panel">
        <h2>Audience</h2>
        <p className="analytics-help"><strong>Traffic = all production traffic.</strong> Переключатель Live/Sandbox влияет только на orders и paid attribution, но не на visitor/session metrics.</p>
        <CountCards rows={[
          { label: "Visitors", value: report.audience.visitors, help: "Unique production-site visitors." },
          { label: "Sessions", value: report.audience.sessions, help: "30-minute production sessions." },
          { label: "Shop visitors", value: report.audience.shop_visitors, help: "Unique visitors with shop_view." },
          { label: "Product viewers", value: report.audience.product_viewers, help: "Unique visitors with product_view." },
          { label: "Interested visitors", value: report.audience.interested_visitors, help: "Unique visitors with product_interest." },
          { label: "Interest events", value: report.audience.interest_events, help: "CTA clicks leading directly to checkout." },
        ]} />
      </section>
      <section className="analytics-panel">
        <h2>Checkout attribution · {report.environment}</h2>
        <CountCards rows={[
          { label: "Checkout starts", value: report.attribution.checkout_orders, help: "Orders created in the period." },
          { label: "Attributed orders", value: report.attribution.attributed_orders, help: "Orders with a valid Phase 2A snapshot." },
          { label: "Unattributed orders", value: report.attribution.unattributed_orders, help: "Includes legacy/Unknown attribution." },
          { label: "Coverage", value: report.attribution.coverage_percent == null ? "N/A" : `${report.attribution.coverage_percent}%`, help: "Attributed checkout orders / checkout orders." },
        ]} />
        <p className="analytics-help">Attribution — маркетинговый сигнал, а не доказательство причинности. Unknown показывается явно и не переименовывается в канал.</p>
      </section>
      <SourceTable title="First touch paid sources" rows={report.sources.first_touch} />
      <SourceTable title="Session touch paid sources" rows={report.sources.session_touch} />
      <CommerceQuality report={report} />
    </div>
  );
}

function CommerceAnalyticsTab({ payload }: { payload: AnalyticsAdminPayload }) {
  const report = payload.commerceAnalytics as CommerceAnalyticsReportV1;
  const funnelRows = [
    ["Shop visitors", report.audience.shop_visitors],
    ["Product viewers", report.audience.product_viewers],
    ["Interested visitors", report.audience.interested_visitors],
    ["Checkout starts", report.commerce.checkout_starts],
    ["Paid orders", report.commerce.paid_orders],
  ].map(([step, count]) => ({ step: String(step), count: Number(count) }));
  return (
    <div className="analytics-grid-1">
      <section className="analytics-panel">
        <h2>Commerce summary · {report.environment}</h2>
        <CountCards rows={[
          { label: "Checkout starts", value: report.commerce.checkout_starts, help: "Unique durable orders created in the period." },
          { label: "Paid orders", value: report.commerce.paid_orders, help: "Confirmed purchases by paid_at." },
          { label: "Refunded orders", value: report.commerce.refunded_orders, help: "Orders with completed refunds in the period." },
          ...report.commerce.revenue.flatMap((row) => [
            { label: `Gross · ${row.currency}`, value: formatMinorUnits(row.gross_minor, row.currency), help: "Confirmed paid order revenue." },
            { label: `Refunded · ${row.currency}`, value: formatMinorUnits(row.refunded_minor, row.currency), help: "Completed refunds in this period." },
            { label: `Net · ${row.currency}`, value: formatMinorUnits(row.net_minor, row.currency), help: "Gross minus completed refunds; may be negative." },
          ]),
        ]} />
      </section>
      <section className="analytics-panel">
        <h2>Revenue by currency</h2>
        <SimpleRows rows={report.commerce.revenue} empty="Нет paid orders или completed refunds за период." columns={[
          { label: "Currency", render: (row) => row.currency },
          { label: "Gross", render: (row) => formatMinorUnits(row.gross_minor, row.currency) },
          { label: "Completed refunds", render: (row) => formatMinorUnits(row.refunded_minor, row.currency) },
          { label: "Net", render: (row) => formatMinorUnits(row.net_minor, row.currency) },
        ]} />
        <p className="analytics-help">Net = gross paid in the window − completed refunds in the window. Отрицательное net допустимо; валюты не суммируются.</p>
      </section>
      <section className="analytics-panel">
        <h2>Checkout status distribution</h2>
        <SimpleRows rows={Object.entries(report.commerce.status_counts).map(([status, count]) => ({ status, count }))} empty="Нет orders за период." columns={[
          { label: "Status", render: (row) => row.status },
          { label: "Orders", render: (row) => row.count },
        ]} />
      </section>
      <section className="analytics-panel">
        <h2>Product performance</h2>
        <SimpleRows rows={report.products} empty="Нет product/commerce данных за период." columns={[
          { label: "Product", render: (row) => row.product_id },
          { label: "Views", render: (row) => row.product_views },
          { label: "Viewers", render: (row) => row.product_viewers },
          { label: "Interest events", render: (row) => row.interest_events },
          { label: "Interested visitors", render: (row) => row.interested_visitors },
          { label: "Checkout starts", render: (row) => row.checkout_starts },
          { label: "Paid / gross", render: (row) => row.paid.length === 0 ? "—" : row.paid.map((paid) => `${paid.paid_orders} · ${formatMinorUnits(paid.gross_minor, paid.currency)}`).join("; ") },
        ]} />
      </section>
      <section className="analytics-panel">
        <h2>Entry points</h2>
        <SimpleRows rows={Object.entries(report.funnel.entry_points).map(([entry, count]) => ({ entry, count }))} empty="Нет product_interest событий." columns={[
          { label: "Entry point", render: (row) => row.entry },
          { label: "Interest events", render: (row) => row.count },
        ]} />
      </section>
      <section className="analytics-panel">
        <h2>Independent funnel counts</h2>
        <p className="analytics-help"><strong>These are independent counts, not a linked conversion funnel.</strong> Step-to-step conversion percentages intentionally unavailable.</p>
        <SimpleRows rows={funnelRows} empty="Нет данных за период." columns={[
          { label: "Signal", render: (row) => row.step },
          { label: "Count", render: (row) => row.count },
        ]} />
      </section>
      <CommerceQuality report={report} />
    </div>
  );
}

function OpportunitiesTab({ payload }: { payload: AnalyticsAdminPayload }) {
  const technical = payload.opportunities.filter((item) => item.category === "technical");
  const product = payload.opportunities.filter((item) => item.category === "product");
  const renderItems = (items: typeof payload.opportunities) => (
    <div className="analytics-opportunities">
      {items.map((item) => (
        <article key={item.title} className={`analytics-opportunity analytics-opportunity--${item.tone}`}>
          <h3>{item.title}</h3>
          <strong>Уверенность: {item.confidence}</strong>
          <p>{item.description}</p>
        </article>
      ))}
    </div>
  );

  return (
    <section className="analytics-panel">
      <h2>Что делать дальше</h2>
      <p className="analytics-help">Это rule-based блок без LLM. Он использует только canonical открытия, completion, Studio events и языки; недостоверные exit/funnel выводы скрыты.</p>
      <h3>Технические проблемы</h3>
      {technical.length === 0 ? <EmptyState text="Явных технических проблем в данных не найдено." /> : renderItems(technical)}
      <h3>Продуктовые наблюдения</h3>
      {product.length === 0 ? <EmptyState text="Нет достаточно достоверных продуктовых выводов." /> : renderItems(product)}
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
  const missingImpact: Record<string, string> = {
    page_view: "Влияет на посещения страниц, переходы и bounce rate.",
    session_start: "Влияет на диагностику session tracking.",
    content_open: "Влияет на Content, Funnels и denominator для completion.",
    content_complete: "Completion rate, Languages и продуктовые выводы будут N/A.",
    content_exit: "Legacy duration signal; больше не используется как exit rate.",
    studio_open: "Studio opened требует canonical studio_open при фактическом mount; CTA click считается отдельно.",
    studio_export_started: "Нельзя понять, сколько людей начали экспорт.",
    studio_export_completed: "Нельзя доверять счётчику успешных экспортов.",
    studio_export_failed: "Не видно ошибок экспорта.",
    studio_recording_started: "Нельзя понять, сколько людей начали recording.",
    studio_recording_completed: "Нельзя доверять счётчику успешных recording.",
    studio_recording_failed: "Не видно ошибок recording.",
    duration_seconds: "Pages duration и средняя длительность будут приблизительными или N/A.",
  };
  const missingRows = payload.dataQuality.missingExpectedEvents.map((eventName) => ({ title: eventName, description: `За выбранный период сигнал не приходил. ${missingImpact[eventName] || "Это не всегда ошибка: событие может относиться к экрану без трафика."}`, severity: "info" as const }));
  return (
    <div className="analytics-grid-2">
      <QualityList title="Summary / длинные периоды" rows={payload.dataQuality.summaryWarnings} empty="Для выбранного периода нет предупреждений по summary." />
      <QualityList title="События не встречались вообще" rows={payload.dataQuality.missingEverEvents} empty="Все ожидаемые события встречались в загруженном окне." />
      <QualityList title="События не пришли за период" rows={missingRows} empty="Все ожидаемые события встретились за период." />
      <QualityList title="Необязательные события" rows={payload.dataQuality.optionalEventNotes} empty="Нет optional-событий для проверки." />
      <QualityList title="Проблемы с properties" rows={payload.dataQuality.propertyIssues} empty="Критичные поля выглядят заполненными." />
      <QualityList title="Подозрительные дубликаты" rows={payload.dataQuality.duplicateIssues} empty="Быстрых повторов не найдено." />
      <QualityList title="Провалы по дням" rows={payload.dataQuality.dailyDrops} empty="Резких дневных провалов не видно." />
      <QualityList title="Что невозможно посчитать точно" rows={payload.dataQuality.unavailableMetrics} empty="Основные метрики можно посчитать." />
    </div>
  );
}

function ExportTab({ payload, disabled }: { payload: AnalyticsAdminPayload; disabled: boolean }) {
  const [status, setStatus] = useState("");
  return (
    <section className="analytics-panel">
      <h2>Export</h2>
      <p className="analytics-help">JSON содержит весь payload. CSV выгружается для активной вкладки. Текст для ChatGPT написан по-русски и готов для анализа без персональных данных.</p>
      <div className="analytics-control-row">
        <button className="analytics-button analytics-button--primary" type="button" disabled={disabled} onClick={async () => {
          await copyTextToClipboard(payload.exportSummary);
          setStatus("Текст скопирован");
        }}>
          Скопировать для ChatGPT
        </button>
        <button className="analytics-button" type="button" disabled={disabled} onClick={() => downloadFile(`laplapla-analytics-${payload.period}.json`, JSON.stringify(payload, null, 2), "application/json")}>JSON</button>
        <button className="analytics-button" type="button" disabled={disabled} onClick={() => downloadFile(`laplapla-overview-${payload.period}.csv`, buildAnalyticsCsv(payload, "overview"), "text/csv;charset=utf-8")}>CSV overview</button>
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
  const [environment, setEnvironment] = useState<CommerceAnalyticsEnvironment>("live");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [appliedFilters, setAppliedFilters] = useState<{ period: AnalyticsPeriodKey; environment: CommerceAnalyticsEnvironment } | null>(null);
  const requestCoordinator = useRef(createLatestRequestCoordinator());

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) {
        router.replace("/login");
        return;
      }
      setSessionChecked(true);
    });
  }, [router, supabase]);

  const loadAnalytics = useCallback(async (selectedPeriod: AnalyticsPeriodKey, selectedEnvironment: CommerceAnalyticsEnvironment) => {
    const request = requestCoordinator.current.start();
    setLoading(true);
    setError(null);
    try {
      const nextPayload = await fetchJson<AnalyticsAdminPayload>(`/api/admin/analytics/overview?period=${selectedPeriod}&environment=${selectedEnvironment}`, request.signal);
      if (!requestCoordinator.current.isLatest(request.requestId)) return;
      setPayload(nextPayload);
      setAppliedFilters({ period: selectedPeriod, environment: selectedEnvironment });
    } catch (loadError) {
      if (!requestCoordinator.current.isLatest(request.requestId)) return;
      if (loadError instanceof DOMException && loadError.name === "AbortError") return;
      setPayload(null);
      setAppliedFilters(null);
      setError(loadError instanceof Error ? loadError.message : "Не удалось загрузить аналитику.");
    } finally {
      if (requestCoordinator.current.isLatest(request.requestId)) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (sessionChecked) {
      void loadAnalytics(period, environment);
    }
  }, [environment, loadAnalytics, period, sessionChecked]);

  useEffect(() => () => requestCoordinator.current.cancel(), []);

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
          <button className="analytics-button" type="button" onClick={() => void loadAnalytics(period, environment)} disabled={loading}>
            Обновить
          </button>
        </header>

        {error ? (
          <div className="analytics-error" role="alert">
            <div>{error}</div>
            <button className="analytics-button" type="button" onClick={() => void loadAnalytics(period, environment)} disabled={loading}>
              Повторить загрузку
            </button>
          </div>
        ) : null}
        {loading && !payload ? <EmptyState text="Загружаю аналитику..." /> : null}

        {payload ? (
          <>
            <div className="analytics-loading-line">
              Обновлено: {new Intl.DateTimeFormat("ru-RU", {
                dateStyle: "medium",
                timeStyle: "short",
                timeZone: "Asia/Jerusalem",
              }).format(new Date(payload.generatedAt))} (Израиль)
            </div>
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
                <div className="analytics-periods" aria-label="Commerce environment">
                  {(["live", "sandbox"] as const).map((value) => (
                    <button key={value} className={`analytics-chip ${environment === value ? "analytics-chip--active" : ""}`} type="button" onClick={() => setEnvironment(value)}>
                      {value === "live" ? "Live" : "Sandbox"}
                    </button>
                  ))}
                  <span className="analytics-help">Только commerce/orders; traffic остаётся all production.</span>
                </div>
              </div>
              <ExportButtons
                payload={payload}
                tab={activeTab}
                disabled={loading || !appliedFilters || appliedFilters.period !== period || appliedFilters.environment !== environment || ((activeTab === "acquisition" || activeTab === "commerce") && !payload.commerceAnalytics)}
              />
            </div>

            {loading ? <div className="analytics-loading-line">Обновляю данные за {periodLabels[period]}...</div> : null}
            {appliedFilters && appliedFilters.period === period && appliedFilters.environment === environment ? (
              <>
                {activeTab === "overview" ? <OverviewTab payload={payload} /> : null}
                {activeTab === "content" ? <ContentTab payload={payload} /> : null}
                {activeTab === "funnels" ? <FunnelsTab payload={payload} /> : null}
                {activeTab === "languages" ? <LanguagesTab payload={payload} /> : null}
                {activeTab === "pages" ? <PagesTab payload={payload} /> : null}
                {activeTab === "studio" ? <StudioTab payload={payload} /> : null}
                {activeTab === "acquisition" ? payload.commerceAnalytics ? <AcquisitionTab payload={payload} /> : <EmptyState text={`Commerce Analytics недоступна (${payload.commerceAnalyticsStatus.state === "unavailable" ? payload.commerceAnalyticsStatus.reason : "unknown"}). Phase 1 продолжает работать.`} /> : null}
                {activeTab === "commerce" ? payload.commerceAnalytics ? <CommerceAnalyticsTab payload={payload} /> : <EmptyState text={`Commerce Analytics недоступна (${payload.commerceAnalyticsStatus.state === "unavailable" ? payload.commerceAnalyticsStatus.reason : "unknown"}). Финансовые значения не подменены нулями.`} /> : null}
                {activeTab === "opportunities" ? <OpportunitiesTab payload={payload} /> : null}
                {activeTab === "quality" ? <DataQualityTab payload={payload} /> : null}
                {activeTab === "export" ? <ExportTab payload={payload} disabled={loading} /> : null}
              </>
            ) : <EmptyState text="Загружаю данные для выбранных фильтров. Предыдущий отчёт и его экспорты временно скрыты." />}
          </>
        ) : null}
      </main>
    </div>
  );
}
