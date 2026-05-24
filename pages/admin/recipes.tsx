"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { AdminLogout } from "../../components/AdminLogout";
import { AdminTabs } from "../../components/AdminTabs";
import type { RecipeListItem, RecipeRecord } from "../../lib/recipes/types";

type RecipesResponse = {
  recipes: RecipeListItem[];
  total: number;
  page: number;
  limit: number;
};

async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, options);
  const data = (await response.json()) as T & { error?: string };
  if (!response.ok) {
    throw new Error(data.error ?? "Request failed.");
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

const emptyRecipeJsonTemplate = `{
  "slug": "friday-georgian-khachapuri",
  "title": "Хачапури на сковороде",
  "description": "Упрощенный семейный рецепт из Грузии для уютной пятницы.",
  "image_url": "https://example.com/khachapuri.png",
  "country": "Грузия",
  "ingredients": ["лаваш или тесто", "сыр", "яйцо", "йогурт", "зелень"],
  "fact": "В разных регионах Грузии хачапури готовят по-разному, и у каждого варианта свой характер.",
  "raccoon_caption": "Енотик уже нюхает сыр!",
  "cooking_time": "20 минут",
  "cooking_steps": [
    { "order": 1, "text": "Смешай сыр, яйцо и немного йогурта." },
    { "order": 2, "text": "Положи начинку в тесто или лаваш." },
    { "order": 3, "text": "Подрумянь на сковороде с двух сторон." }
  ],
  "raccoon_advice": "Если сыр очень соленый, добавь больше зелени.",
  "serving_instructions": "Подавай теплым с овощами и маленькой историей про Грузию.",
  "laplapla_interaction_caption": "Сохрани рецепт и найди новые семейные идеи на LapLapLa.com",
  "publish_date": "2026-06-05T09:00:00+03:00",
  "pinterest_status": "draft",
  "pinterest_description": "Простой детский рецепт пятницы: хачапури на сковороде, страна недели - Грузия.",
  "hashtags": ["#kidsrecipes", "#familyfood", "#georgia", "#laplapla"],
  "gradient_from": "#fff7d6",
  "gradient_to": "#b8efe2",
  "translations": {
    "en": {
      "title": "Pan Khachapuri",
      "description": "A simplified family recipe from Georgia for a cozy Friday.",
      "country": "Georgia",
      "ingredients": ["flatbread or dough", "cheese", "egg", "yogurt", "herbs"],
      "fact": "Different regions of Georgia make khachapuri in their own way.",
      "raccoon_caption": "The raccoon already smells cheese!",
      "cooking_time": "20 minutes",
      "cooking_steps": [
        { "order": 1, "text": "Mix cheese, egg, and a little yogurt." },
        { "order": 2, "text": "Place the filling inside the dough or flatbread." },
        { "order": 3, "text": "Toast it in a pan on both sides." }
      ],
      "raccoon_advice": "If the cheese is salty, add more herbs.",
      "serving_instructions": "Serve warm with vegetables and a tiny story about Georgia.",
      "laplapla_interaction_caption": "Save this recipe and find more family ideas on LapLapLa.com",
      "pinterest_description": "Easy Friday recipe for kids: pan khachapuri from Georgia.",
      "hashtags": ["#kidsrecipes", "#familyfood", "#georgia", "#laplapla"]
    },
    "he": {
      "title": "חצ'פורי במחבת",
      "description": "מתכון משפחתי פשוט מגאורגיה לשישי נעים.",
      "country": "גאורגיה",
      "ingredients": ["פיתה או בצק", "גבינה", "ביצה", "יוגורט", "עשבי תיבול"],
      "fact": "באזורים שונים בגאורגיה מכינים חצ'פורי בסגנונות שונים.",
      "raccoon_caption": "הדביבון כבר מריח גבינה!",
      "cooking_time": "20 דקות",
      "cooking_steps": [
        { "order": 1, "text": "מערבבים גבינה, ביצה וקצת יוגורט." },
        { "order": 2, "text": "מניחים את המילוי בתוך הבצק או הפיתה." },
        { "order": 3, "text": "קולים במחבת משני הצדדים." }
      ],
      "raccoon_advice": "אם הגבינה מלוחה, הוסיפו יותר ירק.",
      "serving_instructions": "מגישים חם עם ירקות וסיפור קטן על גאורגיה.",
      "laplapla_interaction_caption": "שמרו את המתכון ומצאו עוד רעיונות משפחתיים ב-LapLapLa.com",
      "pinterest_description": "מתכון שישי קל לילדים: חצ'פורי במחבת מגאורגיה.",
      "hashtags": ["#kidsrecipes", "#familyfood", "#georgia", "#laplapla"]
    }
  }
}`;

const recipeAiPrompt = `Ты создаешь JSON для раздела "Рецепт пятницы" на LapLapLa.

Верни только валидный JSON. Базовый язык - русский, обязательные переводы - en и he.
Рецепт должен быть простым, семейным, культурным, Pinterest-friendly.

Поля:
slug, title, description, image_url, country, ingredients, fact, raccoon_caption, cooking_time,
cooking_steps [{ order, text }], raccoon_advice, serving_instructions,
laplapla_interaction_caption, publish_date, pinterest_status, pinterest_description, hashtags,
gradient_from, gradient_to, translations.en, translations.he.

Тон: уютный, короткий, детский, без сложных техник.`;

function recipeToPinterestText(recipe: RecipeRecord, language: "ru" | "en" | "he") {
  const translation = language === "ru" ? null : recipe.translations[language];
  const description = translation?.pinterest_description ?? recipe.pinterest_description ?? recipe.description ?? "";
  const hashtags = translation?.hashtags?.length ? translation.hashtags : recipe.hashtags;
  return [description, hashtags.join(" ")].filter(Boolean).join("\n\n");
}

function RecipePreview({ recipe, language }: { recipe: RecipeRecord; language: "ru" | "en" | "he" }) {
  const translation = language === "ru" ? null : recipe.translations[language];
  const title = translation?.title ?? recipe.title;
  const country = translation?.country ?? recipe.country;
  const ingredients = translation?.ingredients?.length ? translation.ingredients : recipe.ingredients;
  const steps = translation?.cooking_steps?.length ? translation.cooking_steps : recipe.cooking_steps;
  const gradientFrom = recipe.gradient_from || "#fff4cf";
  const gradientTo = recipe.gradient_to || "#b9efe4";

  return (
    <div
      className="recipe-preview"
      dir={language === "he" ? "rtl" : "ltr"}
      style={{ background: `linear-gradient(155deg, ${gradientFrom}, ${gradientTo})` }}
    >
      <div className="recipe-preview__brand">LapLapLa</div>
      <div className="recipe-preview__country">{country || "Страна"}</div>
      <h3>{title}</h3>
      {recipe.image_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={recipe.image_url} alt="" className="recipe-preview__image" />
      ) : (
        <div className="recipe-preview__image recipe-preview__image--empty">recipe image</div>
      )}
      <div className="recipe-preview__bubble">{translation?.raccoon_caption ?? recipe.raccoon_caption ?? "Енотик советует попробовать!"}</div>
      <div className="recipe-preview__section">
        <strong>{language === "en" ? "Time" : language === "he" ? "זמן" : "Время"}</strong>
        <span>{translation?.cooking_time ?? recipe.cooking_time ?? "—"}</span>
      </div>
      <div className="recipe-preview__section">
        <strong>{language === "en" ? "Ingredients" : language === "he" ? "מצרכים" : "Ингредиенты"}</strong>
        <p>{ingredients.slice(0, 7).join(", ")}</p>
      </div>
      <div className="recipe-preview__section">
        <strong>{language === "en" ? "How to cook" : language === "he" ? "איך מכינים" : "Как приготовить"}</strong>
        <ol>
          {steps.slice(0, 5).map((step) => (
            <li key={step.order}>{step.text}</li>
          ))}
        </ol>
      </div>
      <div className="recipe-preview__footer">
        {translation?.laplapla_interaction_caption ?? recipe.laplapla_interaction_caption ?? "Сохрани на будущее"}
      </div>
    </div>
  );
}

export default function RecipesAdminPage() {
  const router = useRouter();
  const supabase = createClientComponentClient();

  const [sessionChecked, setSessionChecked] = useState(false);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [recipes, setRecipes] = useState<RecipeListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [jsonImportValue, setJsonImportValue] = useState("");
  const [selectedRecipe, setSelectedRecipe] = useState<RecipeRecord | null>(null);
  const [previewLanguage, setPreviewLanguage] = useState<"ru" | "en" | "he">("ru");
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) {
        router.replace("/login");
        return;
      }
      setSessionChecked(true);
    });
  }, [router, supabase]);

  const listUrl = useMemo(() => {
    const params = new URLSearchParams();
    params.set("page", String(page));
    params.set("limit", "10");
    if (search.trim()) {
      params.set("q", search.trim());
    }
    return `/api/admin/recipes?${params.toString()}`;
  }, [page, search]);

  const loadRecipes = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchJson<RecipesResponse>(listUrl);
      setRecipes(data.recipes);
      setTotal(data.total);
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : String(fetchError));
    } finally {
      setLoading(false);
    }
  }, [listUrl]);

  useEffect(() => {
    if (!sessionChecked) {
      return;
    }
    void loadRecipes();
  }, [sessionChecked, loadRecipes]);

  const importRecipe = async () => {
    setImporting(true);
    setError(null);
    setSuccess(null);
    try {
      const data = await fetchJson<{ recipe: RecipeRecord }>("/api/admin/recipes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ json: jsonImportValue }),
      });
      setJsonImportValue("");
      setSuccess(`Рецепт создан: ${data.recipe.title}`);
      setSelectedRecipe(data.recipe);
      await loadRecipes();
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : String(fetchError));
    } finally {
      setImporting(false);
    }
  };

  const openPreview = async (recipeId: string) => {
    setPreviewLoading(true);
    setError(null);
    try {
      const data = await fetchJson<{ recipe: RecipeRecord }>(`/api/admin/recipes/${recipeId}`);
      setSelectedRecipe(data.recipe);
      setPreviewLanguage("ru");
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : String(fetchError));
    } finally {
      setPreviewLoading(false);
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / 10));

  if (!sessionChecked) {
    return <p style={{ padding: 24 }}>Checking session...</p>;
  }

  return (
    <div className="books-admin-page recipes-admin-page">
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
          <h1 className="books-admin-title">Рецепты</h1>
          <p className="books-admin-subtitle">
            Первый слой Recipe Studio: база рецептов, пятничное расписание, переводы в `content_translations` и preview Pinterest-карточки.
          </p>
        </div>
      </header>

      {error && <div className="books-alert books-alert--error">{error}</div>}
      {success && <div className="books-alert books-alert--success">{success}</div>}

      <section className="books-panel">
        <div className="books-section-head">
          <div>
            <h2 className="books-panel__title">Импорт рецепта JSON</h2>
            <p className="books-section-help">
              Русский текст сохраняется в `recipes`, английский и иврит сохраняются отдельно в `content_translations`.
            </p>
          </div>
          <div className="books-actions">
            <button
              type="button"
              className="books-button books-button--secondary"
              onClick={() => {
                void copyTextToClipboard(emptyRecipeJsonTemplate);
                setSuccess("Пример JSON скопирован.");
              }}
            >
              Скопировать пример JSON
            </button>
            <button
              type="button"
              className="books-button books-button--secondary"
              onClick={() => {
                void copyTextToClipboard(recipeAiPrompt);
                setSuccess("Промпт для ИИ скопирован.");
              }}
            >
              Скопировать промпт
            </button>
            <button
              type="button"
              className="books-button books-button--primary"
              disabled={importing || !jsonImportValue.trim()}
              onClick={() => {
                void importRecipe();
              }}
            >
              {importing ? "Импорт..." : "Импортировать"}
            </button>
          </div>
        </div>
        <label className="books-field">
          <span className="books-field__label">JSON рецепта</span>
          <textarea
            className="books-input books-input--textarea books-input--json"
            value={jsonImportValue}
            onChange={(event) => setJsonImportValue(event.target.value)}
            placeholder={emptyRecipeJsonTemplate}
          />
        </label>
      </section>

      <section className="books-panel">
        <div className="books-section-head">
          <div>
            <h2 className="books-panel__title">Существующие рецепты</h2>
            <p className="books-section-help">Показывается по 10 рецептов. Поиск работает по slug, названию и стране.</p>
          </div>
          <label className="books-field cat-questions-search">
            <span className="books-field__label">Поиск</span>
            <input
              className="books-input"
              value={search}
              onChange={(event) => {
                setPage(1);
                setSearch(event.target.value);
              }}
              placeholder="khachapuri или Грузия"
            />
          </label>
        </div>

        <div className="artworks-table-wrap">
          <table className="artworks-table">
            <thead>
              <tr>
                <th>Дата</th>
                <th>Название</th>
                <th>Страна</th>
                <th>Pinterest</th>
                <th>Статус</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} className="artworks-table__empty-row">Загрузка...</td>
                </tr>
              ) : recipes.length === 0 ? (
                <tr>
                  <td colSpan={6} className="artworks-table__empty-row">Рецептов пока нет.</td>
                </tr>
              ) : (
                recipes.map((recipe) => (
                  <tr key={recipe.id}>
                    <td>{recipe.publish_date ? new Date(recipe.publish_date).toLocaleDateString("ru-RU") : "—"}</td>
                    <td>
                      <strong>{recipe.title}</strong>
                      <br />
                      <small>{recipe.slug}</small>
                    </td>
                    <td>{recipe.country || "—"}</td>
                    <td>{recipe.pinterest_status}</td>
                    <td>{recipe.is_active ? "active" : "inactive"}</td>
                    <td>
                      <Link href={`/admin/recipes/${recipe.id}`} className="books-button books-button--secondary">
                        Открыть
                      </Link>
                      <button
                        type="button"
                        className="books-button books-button--ghost"
                        disabled={previewLoading}
                        onClick={() => {
                          void openPreview(recipe.id);
                        }}
                      >
                        Preview
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="books-actions cat-questions-pagination">
          <button
            type="button"
            className="books-button books-button--ghost"
            disabled={page <= 1 || loading}
            onClick={() => setPage((current) => Math.max(1, current - 1))}
          >
            Назад
          </button>
          <span className="books-field__help">
            Страница {page} из {totalPages}, всего {total}
          </span>
          <button
            type="button"
            className="books-button books-button--ghost"
            disabled={page >= totalPages || loading}
            onClick={() => setPage((current) => current + 1)}
          >
            Вперед
          </button>
        </div>
      </section>

      {selectedRecipe ? (
        <section className="books-panel">
          <div className="books-section-head">
            <div>
              <h2 className="books-panel__title">Pinterest preview</h2>
              <p className="books-section-help">
                Это не финальная drag-studio, а первая рабочая карточка и проверка структуры данных перед экспортом.
              </p>
            </div>
            <div className="books-actions">
              {(["ru", "en", "he"] as const).map((language) => (
                <button
                  key={language}
                  type="button"
                  className={previewLanguage === language ? "books-button books-button--primary" : "books-button books-button--ghost"}
                  onClick={() => setPreviewLanguage(language)}
                >
                  {language.toUpperCase()}
                </button>
              ))}
              <button
                type="button"
                className="books-button books-button--secondary"
                onClick={() => {
                  void copyTextToClipboard(recipeToPinterestText(selectedRecipe, previewLanguage));
                  setSuccess("Описание и хештеги скопированы.");
                }}
              >
                Скопировать Pinterest text
              </button>
            </div>
          </div>
          <div className="recipe-preview-wrap">
            <RecipePreview recipe={selectedRecipe} language={previewLanguage} />
          </div>
        </section>
      ) : null}
    </div>
  );
}
