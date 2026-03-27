import type { TranslationScope } from "./types";

type Props = {
  lang: string;
  scope: TranslationScope;
  firstNEnabled: boolean;
  firstN: number;
  loading: boolean;
  onLangChange: (value: string) => void;
  onScopeChange: (value: TranslationScope) => void;
  onFirstNEnabledChange: (value: boolean) => void;
  onFirstNChange: (value: number) => void;
  onAnalyze: () => void;
};

export function TranslationSelector(props: Props) {
  return (
    <section className="translations-panel">
      <h2 className="translations-title">Translation Selection</h2>

      <div className="translations-row">
        <label className="translations-label">
          Target language
          <input
            className="translations-input"
            type="text"
            value={props.lang}
            onChange={(e) => props.onLangChange(e.target.value)}
            placeholder="he"
            maxLength={10}
          />
        </label>
      </div>

      <div className="translations-radio-grid">
        <label className="translations-radio">
          <input
            type="radio"
            name="scope"
            checked={props.scope === "all"}
            onChange={() => props.onScopeChange("all")}
          />
          Translate everything
        </label>
        <label className="translations-radio">
          <input
            type="radio"
            name="scope"
            checked={props.scope === "lessons"}
            onChange={() => props.onScopeChange("lessons")}
          />
          Lessons only
        </label>
        <label className="translations-radio">
          <input
            type="radio"
            name="scope"
            checked={props.scope === "map_stories"}
            onChange={() => props.onScopeChange("map_stories")}
          />
          Map stories only
        </label>
        <label className="translations-radio">
          <input
            type="radio"
            name="scope"
            checked={props.scope === "artworks"}
            onChange={() => props.onScopeChange("artworks")}
          />
          Artworks only
        </label>
        <label className="translations-radio">
          <input
            type="radio"
            name="scope"
            checked={props.scope === "books"}
            onChange={() => props.onScopeChange("books")}
          />
          Books only
        </label>
        <label className="translations-radio">
          <input
            type="radio"
            name="scope"
            checked={props.scope === "stories"}
            onChange={() => props.onScopeChange("stories")}
          />
          Stories only
        </label>
      </div>

      <div className="translations-row translations-row--gap">
        <label className="translations-checkbox">
          <input
            type="checkbox"
            checked={props.firstNEnabled}
            onChange={(e) => props.onFirstNEnabledChange(e.target.checked)}
          />
          First N items
        </label>
        <input
          className="translations-input translations-input--small"
          type="number"
          min={1}
          value={props.firstN}
          disabled={!props.firstNEnabled}
          onChange={(e) => props.onFirstNChange(Number(e.target.value) || 1)}
        />
      </div>

      <button
        className="translations-button translations-button--secondary"
        disabled={props.loading}
        onClick={props.onAnalyze}
      >
        {props.loading ? "Analyzing..." : "Analyze workload"}
      </button>
    </section>
  );
}
