import type { AnalyzeResponse } from "./types";

type Props = {
  data: AnalyzeResponse;
};

export function TranslationSummary(props: Props) {
  const cards = [
    { label: "Lessons", value: props.data.counts.lessons },
    { label: "Map stories", value: props.data.counts.mapStories },
    { label: "Artworks", value: props.data.counts.artworks },
    { label: "Books", value: props.data.counts.books },
    { label: "Stories", value: props.data.counts.stories },
    { label: "Parrot styles", value: props.data.counts.parrotMusicStyles },
    { label: "Total", value: props.data.counts.total },
    { label: "Translated", value: props.data.statusCounts.translated },
    { label: "Missing", value: props.data.statusCounts.missing },
    { label: "Outdated", value: props.data.statusCounts.outdated },
  ];

  return (
    <section className="translations-panel">
      <h2 className="translations-title">Translation State</h2>
      <div className="translations-grid translations-grid--4 translations-grid--summary">
        {cards.map((card) => (
          <div key={card.label} className="translations-card">
            <div className="translations-card__label">{card.label}</div>
            <div className="translations-card__value">{card.value}</div>
          </div>
        ))}
      </div>
    </section>
  );
}
