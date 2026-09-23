import { AdminLogout } from "../../components/AdminLogout";
import { AdminTabs } from "../../components/AdminTabs";
import { getQuestPrintLabUrl } from "../../lib/client/quest-print-lab";

export default function QuestsAdminPage() {
  const printLabUrl = getQuestPrintLabUrl();

  return (
    <div className="books-admin-page">
      <div className="admin-top-bar">
        <div className="admin-top-bar__row admin-top-bar__row--right">
          <AdminLogout />
        </div>
        <div className="admin-top-bar__row">
          <AdminTabs />
        </div>
      </div>

      <header className="books-admin-header">
        <div>
          <h1 className="books-admin-title">Квесты</h1>
          <p className="books-admin-subtitle">
            Внутренняя лаборатория печатных материалов LapLapLa.
          </p>
        </div>
        <span className="books-badge">Local development</span>
      </header>

      <section className="books-panel" aria-labelledby="sound-case-title">
        <div>
          <h2 className="books-panel__title" id="sound-case-title">
            Sound Case #001
          </h2>
          <p className="books-admin-subtitle">Звуковой крокодил</p>
        </div>

        <ul>
          <li>3 printable pages</li>
          <li>12 Sound Cards</li>
          <li>RU / EN / HE</li>
        </ul>

        <div className="books-actions">
          <a
            className="books-button books-button--primary"
            href={printLabUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            Открыть Quest Print Lab ↗
          </a>
        </div>
      </section>
    </div>
  );
}
