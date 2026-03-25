/* eslint-disable @next/next/no-img-element */
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRef } from "react";
import { useRouter } from "next/router";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { AdminLogout } from "../AdminLogout";
import { AdminTabs } from "../AdminTabs";
import { estimateArtistDescriptionCost, estimateArtistNameCandidatesCost } from "../../lib/ai/artworkGenerationProfile";
import {
  ARTWORK_CATEGORY_OPTIONS,
  normalizeArtworkSlug,
  parseArtworkTags,
  type ArtworkEditorInput,
  type ArtworkRecord,
} from "../../lib/artworks/types";

type Props = {
  artworkId?: string;
  isNew?: boolean;
};

type UploadImage = {
  id: string;
  file: File;
  previewUrl: string;
};

async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, options);
  const raw = await response.text();
  const contentType = response.headers.get("content-type") ?? "";

  if (!contentType.includes("application/json")) {
    console.error("[artworks.fetchJson] non-json response", {
      url,
      status: response.status,
      contentType,
      bodyPreview: raw.slice(0, 300),
    });
    throw new Error(raw.slice(0, 300) || `Request failed with status ${response.status}.`);
  }

  let data: (T & { error?: string }) | null = null;
  try {
    data = JSON.parse(raw) as T & { error?: string };
  } catch (error) {
    console.error("[artworks.fetchJson] json parse failed", {
      url,
      status: response.status,
      contentType,
      bodyPreview: raw.slice(0, 300),
      error,
    });
    throw new Error(`Invalid JSON response from ${url}.`);
  }

  if (!response.ok) {
    throw new Error(data?.error ?? "Request failed.");
  }
  return data as T;
}

function formatMoney(value: number, suffix: string) {
  return `${value.toFixed(4)} ${suffix}`;
}

async function blobToWebpFile(blob: Blob, name: string) {
  const imageUrl = URL.createObjectURL(blob);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const nextImage = new Image();
      nextImage.onload = () => resolve(nextImage);
      nextImage.onerror = () => reject(new Error("Failed to process image."));
      nextImage.src = imageUrl;
    });

    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;

    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error("Canvas is not available.");
    }

    context.drawImage(image, 0, 0);

    const webpBlob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((result) => {
        if (!result) {
          reject(new Error("Failed to convert image to webp."));
          return;
        }
        resolve(result);
      }, "image/webp", 0.8);
    });

    return new File([webpBlob], `${name}.webp`, { type: "image/webp" });
  } finally {
    URL.revokeObjectURL(imageUrl);
  }
}

async function fileToWebp(file: File, index: number) {
  return blobToWebpFile(file, `${index}`);
}

export function ArtworkEditor({ artworkId = "", isNew = false }: Props) {
  const router = useRouter();
  const supabase = createClientComponentClient();

  const [sessionChecked, setSessionChecked] = useState(false);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [generatingNames, setGeneratingNames] = useState(false);
  const [generatingDescription, setGeneratingDescription] = useState(false);
  const [artistNameCandidates, setArtistNameCandidates] = useState<string[]>([]);
  const [isArtistManuallyEdited, setIsArtistManuallyEdited] = useState(false);
  const [originalArtist, setOriginalArtist] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [form, setForm] = useState<ArtworkEditorInput>({
    title: "",
    artist: "",
    description: "",
    category_slug: "cartoon-characters",
    tags: [],
    image_url: [],
  });
  const [tagsInput, setTagsInput] = useState("");
  const [existingImages, setExistingImages] = useState<string[]>([]);
  const [newImages, setNewImages] = useState<UploadImage[]>([]);
  const newImagesRef = useRef<UploadImage[]>([]);

  useEffect(() => {
    newImagesRef.current = newImages;
  }, [newImages]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) {
        router.replace("/login");
        return;
      }
      setSessionChecked(true);
    });
  }, [router, supabase]);

  useEffect(() => {
    if (!sessionChecked || isNew || !artworkId) {
      return;
    }

    let isMounted = true;
    setLoading(true);
    setError(null);

    fetchJson<ArtworkRecord>(`/api/admin/artworks/${artworkId}`)
      .then((data) => {
        if (!isMounted) {
          return;
        }
        setForm({
          title: data.title,
          artist: data.artist,
          description: data.description ?? "",
          category_slug: data.category_slug,
          tags: data.tags,
          image_url: data.image_url,
        });
        setTagsInput(data.tags.join(", "));
        setExistingImages(data.image_url);
        setOriginalArtist(data.artist);
        setIsArtistManuallyEdited(data.artist !== normalizeArtworkSlug(data.title));
      })
      .catch((loadError) => {
        if (!isMounted) {
          return;
        }
        setError(loadError instanceof Error ? loadError.message : String(loadError));
      })
      .finally(() => {
        if (isMounted) {
          setLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [artworkId, isNew, sessionChecked]);

  useEffect(() => {
    return () => {
      for (const image of newImagesRef.current) {
        URL.revokeObjectURL(image.previewUrl);
      }
    };
  }, []);

  const nameEstimate = useMemo(() => estimateArtistNameCandidatesCost(), []);
  const descriptionEstimate = useMemo(
    () => estimateArtistDescriptionCost(form.title || "Художник"),
    [form.title],
  );

  const setField = <K extends keyof ArtworkEditorInput>(key: K, value: ArtworkEditorInput[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const handleTitleChange = (value: string) => {
    setForm((current) => ({
      ...current,
      title: value,
      artist: isArtistManuallyEdited ? current.artist : normalizeArtworkSlug(value),
    }));
  };

  const handleSlugChange = (value: string) => {
    setIsArtistManuallyEdited(true);
    setField("artist", normalizeArtworkSlug(value));
  };

  const handleTagsChange = (value: string) => {
    setTagsInput(value);
    setField("tags", parseArtworkTags(value));
  };

  const handleImageSelection = async (files: FileList | null) => {
    if (!files || files.length === 0) {
      return;
    }

    setError(null);
    const selectedFiles = Array.from(files);
    const invalidFile = selectedFiles.find(
      (file) => file.type !== "image/jpeg" && file.type !== "image/png",
    );

    if (invalidFile) {
      setError("Можно загружать только jpeg и png.");
      return;
    }

    const processed = await Promise.all(
      selectedFiles.map(async (file, index) => {
        const converted = await fileToWebp(file, Date.now() + index);
        return {
          id: crypto.randomUUID(),
          file: converted,
          previewUrl: URL.createObjectURL(converted),
        };
      }),
    );

    setNewImages((current) => [...current, ...processed]);
  };

  const removeExistingImage = (url: string) => {
    setExistingImages((current) => current.filter((item) => item !== url));
  };

  const removeNewImage = (imageId: string) => {
    setNewImages((current) => {
      const target = current.find((item) => item.id === imageId);
      if (target) {
        URL.revokeObjectURL(target.previewUrl);
      }
      return current.filter((item) => item.id !== imageId);
    });
  };

  const uploadPreparedImages = async (artist: string, files: File[]) => {
    const uploadedUrls: string[] = [];

    for (let index = 0; index < files.length; index += 1) {
      const file = files[index];
      const path = `${artist}/${index + 1}.webp`;
      const { error: uploadError } = await supabase.storage.from("artworks").upload(path, file, {
        cacheControl: "3600",
        upsert: true,
        contentType: "image/webp",
      });

      if (uploadError) {
        throw new Error(uploadError.message);
      }

      const { data } = supabase.storage.from("artworks").getPublicUrl(path);
      uploadedUrls.push(data.publicUrl);
    }

    return uploadedUrls;
  };

  const prepareExistingImageFiles = async () => {
    return Promise.all(
      existingImages.map(async (url, index) => {
        const response = await fetch(url);
        if (!response.ok) {
          throw new Error(`Не удалось загрузить существующее изображение ${index + 1}.`);
        }
        const blob = await response.blob();
        return blobToWebpFile(blob, `existing-${index + 1}`);
      }),
    );
  };

  const cleanupFolders = async (artists: string[]) => {
    const normalized = Array.from(new Set(artists.map((item) => normalizeArtworkSlug(item)).filter(Boolean)));
    if (normalized.length === 0) {
      return;
    }

    await fetchJson<{ ok: true }>("/api/admin/artworks/storage-folder", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ artists: normalized }),
    });
  };

  const handleSave = async () => {
    const title = form.title.trim();
    if (!title) {
      setError("Название художника обязательно.");
      return;
    }

    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const artist = normalizeArtworkSlug(form.artist || title);
      const retainedFiles = await prepareExistingImageFiles();
      const newFiles = newImages.map((item) => item.file);
      const uploadFiles = [...retainedFiles, ...newFiles];

      await cleanupFolders([
        artist,
        originalArtist,
      ]);

      const uploadedUrls = await uploadPreparedImages(artist, uploadFiles);

      const payload: ArtworkEditorInput = {
        title,
        artist,
        description: (form.description ?? "").trim(),
        category_slug: form.category_slug,
        tags: parseArtworkTags(tagsInput),
        image_url: uploadedUrls,
      };

      if (isNew) {
        const created = await fetchJson<ArtworkRecord>("/api/admin/artworks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        for (const image of newImagesRef.current) {
          URL.revokeObjectURL(image.previewUrl);
        }
        setNewImages([]);
        setSuccess("Художник создан.");
        await router.replace(`/admin/artworks/${created.id}`);
        return;
      }

      const updated = await fetchJson<ArtworkRecord>(`/api/admin/artworks/${artworkId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      setForm({
        title: updated.title,
        artist: updated.artist,
        description: updated.description ?? "",
        category_slug: updated.category_slug,
        tags: updated.tags,
        image_url: updated.image_url,
      });
      setTagsInput(updated.tags.join(", "));
      setExistingImages(updated.image_url);
      for (const image of newImagesRef.current) {
        URL.revokeObjectURL(image.previewUrl);
      }
      setNewImages([]);
      setOriginalArtist(updated.artist);
      setSuccess("Изменения сохранены.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : String(saveError));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!artworkId || !window.confirm("Удалить художника и все изображения?")) {
      return;
    }

    setDeleting(true);
    setError(null);
    setSuccess(null);
    try {
      await fetchJson<{ ok: true }>(`/api/admin/artworks/${artworkId}`, {
        method: "DELETE",
      });
      await router.push("/admin/artworks");
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : String(deleteError));
    } finally {
      setDeleting(false);
    }
  };

  const handleGenerateNames = async () => {
    setGeneratingNames(true);
    setError(null);
    try {
      const result = await fetchJson<{ candidates: string[] }>("/api/admin/artworks/generate-name", {
        method: "POST",
      });
      setArtistNameCandidates(result.candidates);
    } catch (generationError) {
      setError(generationError instanceof Error ? generationError.message : String(generationError));
    } finally {
      setGeneratingNames(false);
    }
  };

  const handleGenerateDescription = async () => {
    if (!form.title.trim()) {
      setError("Сначала выберите имя художника.");
      return;
    }

    setGeneratingDescription(true);
    setError(null);
    try {
      const result = await fetchJson<{ description: string }>("/api/admin/artworks/generate-description", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: form.title }),
      });
      setField("description", result.description);
    } catch (generationError) {
      setError(generationError instanceof Error ? generationError.message : String(generationError));
    } finally {
      setGeneratingDescription(false);
    }
  };

  if (!sessionChecked || loading) {
    return <p style={{ padding: 24 }}>Loading...</p>;
  }

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
          <h1 className="books-admin-title">{isNew ? "Новый художник" : "Редактор художника"}</h1>
          <p className="books-admin-subtitle">
            Управляйте карточкой художника, изображениями и AI-генерацией внутри таблицы `artworks`.
          </p>
        </div>
      </header>

      {error ? <div className="books-panel books-panel--error">{error}</div> : null}
      {success ? <div className="books-panel books-panel--success">{success}</div> : null}

      <section className="books-panel">
        <div className="books-section-head">
          <div>
            <h2 className="books-panel__title">Основные данные</h2>
            <p className="books-section-help">Slug обновляется автоматически, пока вы не измените его вручную.</p>
          </div>
          <div className="books-actions">
            <button type="button" className="books-button books-button--secondary" onClick={() => router.push("/admin/artworks")}>
              К списку
            </button>
            {!isNew ? (
              <button type="button" className="books-button books-button--danger" onClick={handleDelete} disabled={deleting}>
                {deleting ? "Удаляем..." : "Удалить"}
              </button>
            ) : null}
            <button type="button" className="books-button books-button--primary" onClick={handleSave} disabled={saving}>
              {saving ? "Сохраняем..." : "Сохранить"}
            </button>
          </div>
        </div>

        <div className="books-grid books-grid--2">
          <label className="books-field">
            <span className="books-field__label">Artist name</span>
            <input
              className="books-input"
              value={form.title}
              onChange={(event) => handleTitleChange(event.target.value)}
              placeholder="Джакомо Балла"
            />
          </label>

          <label className="books-field">
            <span className="books-field__label">Slug</span>
            <input
              className="books-input"
              value={form.artist}
              onChange={(event) => handleSlugChange(event.target.value)}
              placeholder="dzhakomo-balla"
            />
          </label>

          <label className="books-field books-field--wide">
            <span className="books-field__label">Description</span>
            <textarea
              className="books-input books-input--textarea"
              value={form.description ?? ""}
              onChange={(event) => setField("description", event.target.value)}
              placeholder="Короткое детское описание художника."
            />
          </label>

          <label className="books-field">
            <span className="books-field__label">Category</span>
            <select
              className="books-input"
              value={form.category_slug}
              onChange={(event) => setField("category_slug", event.target.value as ArtworkEditorInput["category_slug"])}
            >
              {ARTWORK_CATEGORY_OPTIONS.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>

          <label className="books-field">
            <span className="books-field__label">Tags</span>
            <input
              className="books-input"
              value={tagsInput}
              onChange={(event) => handleTagsChange(event.target.value)}
              placeholder="futurism, color, movement"
            />
          </label>
        </div>
      </section>

      <section className="books-panel">
        <div className="books-section-head">
          <div>
            <h2 className="books-panel__title">AI генерация</h2>
            <p className="books-section-help">Перед запуском показывается расчёт токенов и стоимости через общие util-функции.</p>
          </div>
        </div>

        <div className="books-grid books-grid--2">
          <div className="books-subpanel">
            <h3 className="books-subpanel__title">Имя художника</h3>
            <p className="books-section-help">
              {nameEstimate.inputTokens} input / {nameEstimate.outputTokens} output tokens
              {" · "}
              {formatMoney(nameEstimate.usd, "USD")}
              {" · "}
              {formatMoney(nameEstimate.ils, "ILS")}
            </p>
            <div className="books-actions">
              <button type="button" className="books-button books-button--secondary" onClick={handleGenerateNames} disabled={generatingNames}>
                {generatingNames ? "Генерируем..." : "Сгенерировать идеи художников"}
              </button>
            </div>
            {artistNameCandidates.length > 0 ? (
              <div className="artworks-candidates">
                {artistNameCandidates.map((candidate) => (
                  <button
                    key={candidate}
                    type="button"
                    className="artworks-chip"
                    onClick={() => {
                      setArtistNameCandidates([]);
                      setIsArtistManuallyEdited(false);
                      handleTitleChange(candidate);
                    }}
                  >
                    {candidate}
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          <div className="books-subpanel">
            <h3 className="books-subpanel__title">Описание</h3>
            <p className="books-section-help">
              {descriptionEstimate.inputTokens} input / {descriptionEstimate.outputTokens} output tokens
              {" · "}
              {formatMoney(descriptionEstimate.usd, "USD")}
              {" · "}
              {formatMoney(descriptionEstimate.ils, "ILS")}
            </p>
            <div className="books-actions">
              <button type="button" className="books-button books-button--secondary" onClick={handleGenerateDescription} disabled={generatingDescription}>
                {generatingDescription ? "Генерируем..." : "✨ Сгенерировать описание"}
              </button>
            </div>
          </div>
        </div>
      </section>

      <section className="books-panel">
        <div className="books-section-head">
          <div>
            <h2 className="books-panel__title">Изображения</h2>
            <p className="books-section-help">Поддерживаются `jpeg/png`, перед загрузкой всё конвертируется в `webp` с quality 0.8.</p>
          </div>
        </div>

        <label className="books-field">
          <span className="books-field__label">Image upload (multiple)</span>
          <input
            className="books-input"
            type="file"
            accept="image/jpeg,image/png"
            multiple
            onChange={(event) => void handleImageSelection(event.target.files)}
          />
        </label>

        <div className="artworks-image-grid">
          {existingImages.map((url) => (
            <div key={url} className="artworks-image-card">
              <img src={url} alt={form.title || "Artwork"} className="artworks-image-preview" />
              <button type="button" className="books-button books-button--ghost" onClick={() => removeExistingImage(url)}>
                Удалить
              </button>
            </div>
          ))}
          {newImages.map((image) => (
            <div key={image.id} className="artworks-image-card">
              <img src={image.previewUrl} alt="Preview" className="artworks-image-preview" />
              <button type="button" className="books-button books-button--ghost" onClick={() => removeNewImage(image.id)}>
                Удалить
              </button>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
