import type { KeyboardEvent } from "react";

export type EditableMapSlide = {
  id: string;
  story_id: string | null;
  text: string;
  image_url: string | null;
  credit_line: string | null;
};

export function MapStorySlideEditor(props: {
  slide: EditableMapSlide;
  index: number;
  query: string;
  locked?: boolean;
  saving: boolean;
  saveState?: "idle" | "saved" | "error";
  onTextChange: (value: string) => void;
  onQueryChange: (value: string) => void;
  onSearch: () => void;
  onRemoveMedia: () => void;
  onInsert: () => void;
  onDelete: () => void;
  onSave: () => void;
}) {
  const submitSearch = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "Enter" || event.shiftKey || !props.query.trim()) return;
    event.preventDefault();
    props.onSearch();
  };
  const mediaIsVideo = /\.(mp4|webm|mov)(\?.*)?$/i.test(props.slide.image_url ?? "");
  return (
    <article className="map-slide-card" data-slide-index={props.index}>
      <header className="map-slide-card__header">
        <div className="map-slide-card__title"><span>{props.index + 1}</span><strong>Слайд {props.index + 1}</strong></div>
        <div className="map-slide-card__small-actions">
          <button type="button" aria-label={`Добавить слайд перед слайдом ${props.index + 1}`} onClick={props.onInsert}>+</button>
          <button type="button" className="is-danger" aria-label={`Удалить слайд ${props.index + 1}`} onClick={props.onDelete}>×</button>
        </div>
      </header>
      <label className="map-slide-card__field">
        <span>Текст слайда</span>
        <textarea value={props.slide.text} onChange={(event) => props.onTextChange(event.target.value)} placeholder="Текст слайда" />
      </label>
      <div className="map-slide-card__media">
        <span className="map-slide-card__label">Текущее медиа</span>
        {props.slide.image_url ? (
          <div className="map-slide-card__preview">
            {mediaIsVideo ? <video src={props.slide.image_url} controls preload="metadata" muted /> :
              // eslint-disable-next-line @next/next/no-img-element
              <img src={props.slide.image_url} alt={`Медиа слайда ${props.index + 1}`} loading="lazy" />}
            {props.slide.credit_line ? <small>{props.slide.credit_line}</small> : null}
          </div>
        ) : <div className="map-slide-card__empty">Медиа ещё не выбрано</div>}
      </div>
      <label className="map-slide-card__field">
        <span>Ключевое слово для поиска медиа</span>
        <div className="map-slide-card__search-row">
          <input value={props.query} onChange={(event) => props.onQueryChange(event.target.value)} onKeyDown={submitSearch} placeholder="Например: capybara" inputMode="search" />
          <button type="button" className="is-search" disabled={!props.query.trim() || props.locked} onClick={props.onSearch}>Найти</button>
        </div>
      </label>
      <div className="map-slide-card__actions">
        {props.slide.image_url && !props.locked ? <button type="button" className="is-remove" onClick={props.onRemoveMedia}>Удалить текущее медиа</button> : null}
        {props.locked ? <p>Первый слайд флага использует SVG из bucket flags-svg.</p> : null}
      </div>
      <footer className="map-slide-card__footer">
        <button type="button" className="map-slide-card__save" disabled={props.saving} onClick={props.onSave}>{props.saving ? "Сохраняю…" : props.saveState === "error" ? "Ошибка, повторить" : "Сохранить"}</button>
        <span role="status">{props.saveState === "saved" ? "Сохранено" : props.saveState === "error" ? "Не удалось сохранить. Изменения остались на телефоне" : ""}</span>
      </footer>
    </article>
  );
}
