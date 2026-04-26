"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { AdminLogout } from "../AdminLogout";
import { AdminTabs } from "../AdminTabs";
import { parrotMusicStylePayloadSchema } from "../../lib/parrot-music-styles/types";
import type {
  ParrotMusicStyleMediaType,
  ParrotMusicStylePayload,
  ParrotMusicStylePresetInput,
  ParrotMusicStyleRecord,
  ParrotMusicStyleSlideInput,
  ParrotMusicStyleTranslationPayload,
  ParrotMusicStyleVariantInput,
} from "../../lib/parrot-music-styles/types";

type Props = {
  styleId?: string;
};

const PARROT_STYLE_MEDIA_BUCKET = "parrot-style-media";
const PARROT_AUDIO_BUCKET = "parrot-audio";

const sampleJson = `{
  "slug": "bossa",
  "title": "Bossa nova",
  "description": "Warm Brazilian music...",
  "icon_url": "",
  "search_artist": "Antonio Carlos Jobim",
  "search_genre": "bossa nova",
  "is_active": true,
  "sort_order": 10,
  "presets": [
    {
      "preset_key": "guitar",
      "title": "Guitar",
      "icon_url": "",
      "sort_order": 1,
      "default_on": true,
      "default_variant_key": "guitar_01",
      "variants": [
        {
          "variant_key": "guitar_01",
          "title": "Guitar 1",
          "audio_url": "https://example.com/audio.mp3",
          "sort_order": 1
        }
      ]
    }
  ],
  "slides": [
    {
      "slide_order": 1,
      "text": "..."
    }
  ],
  "translations": {
    "en": {
      "title": "Bossa nova",
      "description": "Warm Brazilian music...",
      "slides": [
        { "order": 1, "text": "..." }
      ]
    },
    "he": {
      "title": "...",
      "description": "...",
      "slides": [
        { "order": 1, "text": "..." }
      ]
    }
  }
}`;

const emptyJsonTemplate = `{
  "slug": "",
  "title": "",
  "description": "",
  "icon_url": "",
  "search_artist": "",
  "search_genre": "",
  "is_active": true,
  "sort_order": null,
  "presets": [
    {
      "preset_key": "",
      "title": "",
      "icon_url": "",
      "sort_order": 1,
      "default_on": false,
      "default_variant_key": "",
      "variants": [
        {
          "variant_key": "",
          "title": "",
          "audio_url": "",
          "sort_order": 1
        }
      ]
    }
  ],
  "slides": [
    {
      "slide_order": 1,
      "text": ""
    }
  ],
  "translations": {
    "en": {
      "title": "",
      "description": "",
      "slides": [
        { "order": 1, "text": "" }
      ]
    },
    "he": {
      "title": "",
      "description": "",
      "slides": [
        { "order": 1, "text": "" }
      ]
    }
  }
}`;

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

async function imageFileToWebp(file: File, name: string) {
  return blobToWebpFile(file, name);
}

function sanitizeStorageSegment(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function createEmptyVariant(): ParrotMusicStyleVariantInput {
  return {
    variant_key: "",
    title: "",
    audio_url: "",
    sort_order: null,
  };
}

function createEmptyPreset(): ParrotMusicStylePresetInput {
  return {
    preset_key: "",
    title: "",
    icon_url: "",
    sort_order: null,
    default_on: false,
    default_variant_key: null,
    variants: [createEmptyVariant()],
  };
}

function createEmptySlide(order: number): ParrotMusicStyleSlideInput {
  return {
    slide_order: order,
    text: "",
    media_url: null,
    media_type: null,
  };
}

function createEmptyTranslation(): ParrotMusicStyleTranslationPayload {
  return {
    title: "",
    description: "",
    slides: [],
  };
}

function createEmptyState(): ParrotMusicStylePayload {
  return {
    slug: "",
    title: "",
    description: "",
    icon_url: "",
    search_artist: "",
    search_genre: "",
    is_active: true,
    sort_order: null,
    presets: [createEmptyPreset()],
    slides: [createEmptySlide(1)],
    translations: {},
  };
}

function toEditableState(style: ParrotMusicStyleRecord | ParrotMusicStylePayload): ParrotMusicStylePayload {
  return {
    slug: style.slug,
    title: style.title,
    description: style.description ?? "",
    icon_url: style.icon_url ?? "",
    search_artist: style.search_artist ?? "",
    search_genre: style.search_genre ?? "",
    is_active: style.is_active,
    sort_order: style.sort_order,
    presets: style.presets.map((preset) => ({
      preset_key: preset.preset_key,
      title: preset.title,
      icon_url: preset.icon_url ?? "",
      sort_order: preset.sort_order,
      default_on: preset.default_on,
      default_variant_key: preset.default_variant_key ?? "",
      variants: preset.variants.map((variant) => ({
        variant_key: variant.variant_key,
        title: variant.title ?? "",
        audio_url: variant.audio_url,
        sort_order: variant.sort_order,
      })),
    })),
    slides: style.slides.map((slide) => ({
      slide_order: slide.slide_order,
      text: slide.text,
      media_url: slide.media_url ?? null,
      media_type: slide.media_type ?? null,
    })),
    translations: {
      ...(style.translations.en
        ? {
            en: {
              title: style.translations.en.title ?? "",
              description: style.translations.en.description ?? "",
              slides: style.translations.en.slides ?? [],
            },
          }
        : {}),
      ...(style.translations.he
        ? {
            he: {
              title: style.translations.he.title ?? "",
              description: style.translations.he.description ?? "",
              slides: style.translations.he.slides ?? [],
            },
          }
        : {}),
    },
  };
}

function normalizeStateForSave(state: ParrotMusicStylePayload): ParrotMusicStylePayload {
  return {
    ...state,
    slug: state.slug.trim(),
    title: state.title.trim(),
    description: state.description?.trim() || null,
    icon_url: state.icon_url?.trim() || null,
    search_artist: state.search_artist?.trim() || null,
    search_genre: state.search_genre?.trim() || null,
    presets: state.presets.map((preset, presetIndex) => ({
      ...preset,
      preset_key: preset.preset_key.trim(),
      title: preset.title.trim(),
      icon_url: preset.icon_url?.trim() || null,
      sort_order: preset.sort_order ?? presetIndex,
      default_variant_key: preset.default_variant_key?.trim() || null,
      variants: preset.variants.map((variant, variantIndex) => ({
        ...variant,
        variant_key: variant.variant_key.trim(),
        title: variant.title?.trim() || null,
        audio_url: variant.audio_url.trim(),
        sort_order: variant.sort_order ?? variantIndex,
      })),
    })),
    slides: state.slides.map((slide, index) => ({
      ...slide,
      slide_order: index + 1,
      text: slide.text.trim(),
      media_url: slide.media_url?.trim() || null,
      media_type: slide.media_type ?? null,
    })),
    translations: {
      ...(state.translations.en
        ? {
            en: {
              title: state.translations.en.title?.trim() || undefined,
              description: state.translations.en.description?.trim() || undefined,
              slides: (state.translations.en.slides ?? [])
                .map((slide) => ({
                  order: slide.order,
                  text: slide.text.trim(),
                }))
                .filter((slide) => slide.text.length > 0),
            },
          }
        : {}),
      ...(state.translations.he
        ? {
            he: {
              title: state.translations.he.title?.trim() || undefined,
              description: state.translations.he.description?.trim() || undefined,
              slides: (state.translations.he.slides ?? [])
                .map((slide) => ({
                  order: slide.order,
                  text: slide.text.trim(),
                }))
                .filter((slide) => slide.text.length > 0),
            },
          }
        : {}),
    },
  };
}

function validateState(state: ParrotMusicStylePayload): string | null {
  if (!state.slug.trim()) {
    return "Slug is required.";
  }
  if (!state.title.trim()) {
    return "Title is required.";
  }
  if (state.presets.length === 0) {
    return "At least one preset is required.";
  }
  for (const preset of state.presets) {
    if (!preset.preset_key.trim()) {
      return "Each preset must have a preset_key.";
    }
    if (preset.variants.length === 0) {
      return `Preset "${preset.preset_key || preset.title || "unnamed"}" must have at least one variant.`;
    }
    for (const variant of preset.variants) {
      if (!variant.variant_key.trim()) {
        return `Preset "${preset.preset_key || preset.title || "unnamed"}" has a variant without variant_key.`;
      }
      if (!variant.audio_url.trim()) {
        return `Variant "${variant.variant_key}" must have audio_url.`;
      }
    }
    if (
      preset.default_variant_key?.trim() &&
      !preset.variants.some((variant) => variant.variant_key.trim() === preset.default_variant_key?.trim())
    ) {
      return `Preset "${preset.preset_key}" references missing default_variant_key.`;
    }
  }
  if (!state.slides.some((slide) => slide.text.trim().length > 0)) {
    return "At least one base slide with text is required.";
  }
  for (const slide of state.slides) {
    if ((slide.media_url && !slide.media_type) || (!slide.media_url && slide.media_type)) {
      return "Each slide media block must include both media URL and media type.";
    }
  }
  for (const language of ["en", "he"] as const) {
    const translation = state.translations[language];
    if (!translation) {
      continue;
    }
    if ((translation.slides ?? []).some((slide) => !slide.text.trim())) {
      return `Translation ${language} contains an empty slide text.`;
    }
  }
  return null;
}

export function ParrotMusicStyleEditor({ styleId }: Props) {
  const router = useRouter();
  const supabase = createClientComponentClient();
  const isNew = !styleId;

  const [sessionChecked, setSessionChecked] = useState(false);
  const [style, setStyle] = useState<ParrotMusicStylePayload | null>(isNew ? createEmptyState() : null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [importingJson, setImportingJson] = useState(false);
  const [jsonImportValue, setJsonImportValue] = useState("");
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

  useEffect(() => {
    if (!sessionChecked || !styleId) {
      return;
    }

    setLoading(true);
    setError(null);
    fetchJson<{ style: ParrotMusicStyleRecord }>(`/api/admin/parrot-music-styles/${styleId}`)
      .then(({ style: loadedStyle }) => setStyle(toEditableState(loadedStyle)))
      .catch((loadError) => setError(loadError instanceof Error ? loadError.message : String(loadError)))
      .finally(() => setLoading(false));
  }, [sessionChecked, styleId]);

  const updateStyle = (patch: Partial<ParrotMusicStylePayload>) => {
    setStyle((current) => (current ? { ...current, ...patch } : current));
  };

  const updatePreset = (presetIndex: number, patch: Partial<ParrotMusicStylePresetInput>) => {
    setStyle((current) => {
      if (!current) {
        return current;
      }
      return {
        ...current,
        presets: current.presets.map((preset, index) => (index === presetIndex ? { ...preset, ...patch } : preset)),
      };
    });
  };

  const updateVariant = (
    presetIndex: number,
    variantIndex: number,
    patch: Partial<ParrotMusicStyleVariantInput>,
  ) => {
    setStyle((current) => {
      if (!current) {
        return current;
      }
      return {
        ...current,
        presets: current.presets.map((preset, index) => {
          if (index !== presetIndex) {
            return preset;
          }
          return {
            ...preset,
            variants: preset.variants.map((variant, index2) => (
              index2 === variantIndex ? { ...variant, ...patch } : variant
            )),
          };
        }),
      };
    });
  };

  const addPreset = () => {
    setStyle((current) => (
      current
        ? { ...current, presets: [...current.presets, createEmptyPreset()] }
        : current
    ));
  };

  const removePreset = (presetIndex: number) => {
    setStyle((current) => {
      if (!current) {
        return current;
      }
      return {
        ...current,
        presets: current.presets.filter((_, index) => index !== presetIndex),
      };
    });
  };

  const addVariant = (presetIndex: number) => {
    setStyle((current) => {
      if (!current) {
        return current;
      }
      return {
        ...current,
        presets: current.presets.map((preset, index) => (
          index === presetIndex
            ? { ...preset, variants: [...preset.variants, createEmptyVariant()] }
            : preset
        )),
      };
    });
  };

  const removeVariant = (presetIndex: number, variantIndex: number) => {
    setStyle((current) => {
      if (!current) {
        return current;
      }
      return {
        ...current,
        presets: current.presets.map((preset, index) => (
          index === presetIndex
            ? {
                ...preset,
                variants: preset.variants.filter((_, itemIndex) => itemIndex !== variantIndex),
              }
            : preset
        )),
      };
    });
  };

  const updateSlide = (slideIndex: number, patch: Partial<ParrotMusicStyleSlideInput>) => {
    setStyle((current) => {
      if (!current) {
        return current;
      }
      return {
        ...current,
        slides: current.slides.map((slide, index) => (
          index === slideIndex ? { ...slide, ...patch } : slide
        )),
      };
    });
  };

  const addSlide = () => {
    setStyle((current) => (
      current
        ? { ...current, slides: [...current.slides, createEmptySlide(current.slides.length + 1)] }
        : current
    ));
  };

  const removeSlide = (slideIndex: number) => {
    setStyle((current) => {
      if (!current) {
        return current;
      }
      return {
        ...current,
        slides: current.slides
          .filter((_, index) => index !== slideIndex)
          .map((slide, index) => ({ ...slide, slide_order: index + 1 })),
      };
    });
  };

  const ensureTranslation = (language: "en" | "he") => {
    setStyle((current) => {
      if (!current) {
        return current;
      }
      return {
        ...current,
        translations: {
          ...current.translations,
          [language]: current.translations[language] ?? createEmptyTranslation(),
        },
      };
    });
  };

  const updateTranslation = (language: "en" | "he", patch: Partial<ParrotMusicStyleTranslationPayload>) => {
    ensureTranslation(language);
    setStyle((current) => {
      if (!current) {
        return current;
      }
      const existing = current.translations[language] ?? createEmptyTranslation();
      return {
        ...current,
        translations: {
          ...current.translations,
          [language]: { ...existing, ...patch },
        },
      };
    });
  };

  const addTranslationSlide = (language: "en" | "he") => {
    ensureTranslation(language);
    setStyle((current) => {
      if (!current) {
        return current;
      }
      const existing = current.translations[language] ?? createEmptyTranslation();
      return {
        ...current,
        translations: {
          ...current.translations,
          [language]: {
            ...existing,
            slides: [...(existing.slides ?? []), { order: (existing.slides?.length ?? 0) + 1, text: "" }],
          },
        },
      };
    });
  };

  const updateTranslationSlide = (
    language: "en" | "he",
    slideIndex: number,
    patch: { order?: number; text?: string },
  ) => {
    ensureTranslation(language);
    setStyle((current) => {
      if (!current) {
        return current;
      }
      const existing = current.translations[language] ?? createEmptyTranslation();
      return {
        ...current,
        translations: {
          ...current.translations,
          [language]: {
            ...existing,
            slides: (existing.slides ?? []).map((slide, index) => (
              index === slideIndex ? { ...slide, ...patch } : slide
            )),
          },
        },
      };
    });
  };

  const removeTranslationSlide = (language: "en" | "he", slideIndex: number) => {
    setStyle((current) => {
      if (!current) {
        return current;
      }
      const existing = current.translations[language];
      if (!existing) {
        return current;
      }
      return {
        ...current,
        translations: {
          ...current.translations,
          [language]: {
            ...existing,
            slides: (existing.slides ?? [])
              .filter((_, index) => index !== slideIndex)
              .map((slide, index) => ({ ...slide, order: index + 1 })),
          },
        },
      };
    });
  };

  const copyJsonTemplate = async () => {
    setError(null);
    setSuccess(null);
    try {
      await copyTextToClipboard(emptyJsonTemplate);
      setSuccess("Пример JSON скопирован в буфер обмена.");
    } catch (copyError) {
      setError(copyError instanceof Error ? copyError.message : "Не удалось скопировать JSON.");
    }
  };

  const importStyleJson = async () => {
    setImportingJson(true);
    setError(null);
    setSuccess(null);
    try {
      const parsed = parrotMusicStylePayloadSchema.parse(JSON.parse(jsonImportValue) as unknown);
      setStyle(toEditableState(parsed));
      setSuccess("JSON импортирован в форму. Проверьте данные и сохраните стиль.");
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : String(importError));
    } finally {
      setImportingJson(false);
    }
  };

  const uploadStyleIcon = async (file: File) => {
    if (!style) {
      return;
    }
    const slug = sanitizeStorageSegment(style.slug);
    if (!slug) {
      setError("Сначала заполните slug стиля, потом загружайте иконку.");
      return;
    }
    if (file.type !== "image/png" && file.type !== "image/jpeg") {
      setError("Можно загружать только png или jpeg для иконок.");
      return;
    }

    setError(null);
    setSuccess(null);
    try {
      const converted = await imageFileToWebp(file, "style-icon");
      const storagePath = `styles/${slug}/style-icon.webp`;
      const { error: uploadError } = await supabase.storage.from(PARROT_STYLE_MEDIA_BUCKET).upload(storagePath, converted, {
        cacheControl: "3600",
        upsert: true,
        contentType: "image/webp",
      });
      if (uploadError) {
        throw new Error(uploadError.message);
      }
      const { data } = supabase.storage.from(PARROT_STYLE_MEDIA_BUCKET).getPublicUrl(storagePath);
      updateStyle({ icon_url: data.publicUrl });
      setSuccess("Иконка стиля загружена.");
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : String(uploadError));
    }
  };

  const uploadPresetIcon = async (presetIndex: number, file: File) => {
    if (!style) {
      return;
    }
    const slug = sanitizeStorageSegment(style.slug);
    const presetKey = sanitizeStorageSegment(style.presets[presetIndex]?.preset_key ?? "");
    if (!slug) {
      setError("Сначала заполните slug стиля, потом загружайте иконку инструмента.");
      return;
    }
    if (!presetKey) {
      setError("Сначала заполните preset_key, потом загружайте иконку инструмента.");
      return;
    }
    if (file.type !== "image/png" && file.type !== "image/jpeg") {
      setError("Можно загружать только png или jpeg для иконок.");
      return;
    }

    setError(null);
    setSuccess(null);
    try {
      const converted = await imageFileToWebp(file, presetKey);
      const storagePath = `styles/${slug}/presets/${presetKey}.webp`;
      const { error: uploadError } = await supabase.storage.from(PARROT_STYLE_MEDIA_BUCKET).upload(storagePath, converted, {
        cacheControl: "3600",
        upsert: true,
        contentType: "image/webp",
      });
      if (uploadError) {
        throw new Error(uploadError.message);
      }
      const { data } = supabase.storage.from(PARROT_STYLE_MEDIA_BUCKET).getPublicUrl(storagePath);
      updatePreset(presetIndex, { icon_url: data.publicUrl });
      setSuccess(`Иконка инструмента "${style.presets[presetIndex]?.title || style.presets[presetIndex]?.preset_key}" загружена.`);
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : String(uploadError));
    }
  };

  const uploadVariantAudio = async (presetIndex: number, variantIndex: number, file: File) => {
    if (!style) {
      return;
    }
    const slug = sanitizeStorageSegment(style.slug);
    const presetKey = sanitizeStorageSegment(style.presets[presetIndex]?.preset_key ?? "");
    if (!slug) {
      setError("Сначала заполните slug стиля, потом загружайте mp3.");
      return;
    }
    if (!presetKey) {
      setError("Сначала заполните preset_key, потом загружайте mp3.");
      return;
    }
    const fileName = sanitizeStorageSegment(file.name.replace(/\.[^/.]+$/, ""));
    if (!fileName) {
      setError("Не удалось собрать имя файла для mp3.");
      return;
    }
    if (file.type && file.type !== "audio/mpeg" && file.type !== "audio/mp3") {
      setError("Загружайте mp3 файл.");
      return;
    }

    setError(null);
    setSuccess(null);
    try {
      const storagePath = `parrots/${slug}/${presetKey}/${fileName}.mp3`;
      const { error: uploadError } = await supabase.storage.from(PARROT_AUDIO_BUCKET).upload(storagePath, file, {
        cacheControl: "3600",
        upsert: true,
        contentType: "audio/mpeg",
      });
      if (uploadError) {
        throw new Error(uploadError.message);
      }
      const { data } = supabase.storage.from(PARROT_AUDIO_BUCKET).getPublicUrl(storagePath);
      updateVariant(presetIndex, variantIndex, { audio_url: data.publicUrl });
      setSuccess("Аудио загружено и подставлено в variant.");
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : String(uploadError));
    }
  };

  const saveStyle = async () => {
    if (!style) {
      return;
    }

    const validationError = validateState(style);
    if (validationError) {
      setError(validationError);
      return;
    }

    const payload = normalizeStateForSave(style);
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      if (isNew) {
        const response = await fetchJson<{ style: ParrotMusicStyleRecord }>("/api/admin/parrot-music-styles", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ style: payload }),
        });
        setSuccess("Style created.");
        await router.replace(`/admin/parrot-music-styles/${response.style.id}`);
        return;
      }

      const response = await fetchJson<{ style: ParrotMusicStyleRecord }>(
        `/api/admin/parrot-music-styles/${styleId}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ style: payload }),
        },
      );
      setSuccess("Style saved.");
      setStyle(toEditableState(response.style));
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : String(saveError));
    } finally {
      setSaving(false);
    }
  };

  const deleteStyle = async () => {
    if (!styleId || !style) {
      return;
    }
    if (!window.confirm(`Delete "${style.title || style.slug}"?`)) {
      return;
    }

    setDeleting(true);
    setError(null);
    setSuccess(null);
    try {
      await fetchJson<{ ok: true }>(`/api/admin/parrot-music-styles/${styleId}`, { method: "DELETE" });
      await router.push("/admin/parrot-music-styles");
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : String(deleteError));
    } finally {
      setDeleting(false);
    }
  };

  if (!sessionChecked) {
    return <p style={{ padding: 24 }}>Checking session...</p>;
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
          <h1 className="books-admin-title">
            {isNew ? "Новый стиль музыки" : style?.title || style?.slug || "Музыка"}
          </h1>
          <p className="books-admin-subtitle">
            Единый редактор для метаданных, инструментов, аудио, слайдов истории и переводов.
          </p>
        </div>
        <div className="books-actions">
          <button
            type="button"
            className="books-button books-button--ghost"
            onClick={() => {
              void router.push("/admin/parrot-music-styles");
            }}
          >
            К списку
          </button>
          {!isNew ? (
            <button
              type="button"
              className="books-button books-button--danger"
              onClick={() => {
                void deleteStyle();
              }}
              disabled={deleting}
            >
              {deleting ? "Удаляем..." : "Удалить"}
            </button>
          ) : null}
          <button
            type="button"
            className="books-button books-button--primary"
            onClick={() => {
              void saveStyle();
            }}
            disabled={saving || loading || !style}
          >
            {saving ? "Сохраняем..." : "Сохранить"}
          </button>
        </div>
      </header>

      {error ? <div className="books-alert books-alert--error">{error}</div> : null}
      {success ? <div className="books-alert books-alert--success">{success}</div> : null}
      {loading ? <div className="books-panel">Loading...</div> : null}

      {style ? (
        <>
          <section className="books-panel">
            <div className="books-section-head">
              <div>
                <h2 className="books-panel__title">Импорт готового JSON</h2>
                <p className="books-section-help">
                  Вставьте стиль целиком. JSON проходит ту же схему данных, что и обычное сохранение формы.
                </p>
              </div>
              <div className="books-actions">
                <button
                  type="button"
                  className="books-button books-button--secondary"
                  onClick={() => {
                    void copyJsonTemplate();
                  }}
                >
                  Скопировать пример JSON
                </button>
                <button
                  type="button"
                  className="books-button books-button--primary"
                  disabled={importingJson || !jsonImportValue.trim()}
                  onClick={() => {
                    void importStyleJson();
                  }}
                >
                  {importingJson ? "Импорт..." : "Импортировать"}
                </button>
              </div>
            </div>

            <label className="books-field">
              <span className="books-field__label">JSON стиля</span>
              <textarea
                className="books-input books-input--textarea books-input--json"
                value={jsonImportValue}
                onChange={(event) => setJsonImportValue(event.target.value)}
                placeholder={sampleJson}
              />
            </label>
          </section>

          <section className="books-panel">
            <div className="books-section-head">
              <div>
                <h2 className="books-panel__title">Стиль</h2>
                <p className="books-section-help">
                  Стабильный slug, видимые метаданные, загрузка иконки и поисковые поля.
                </p>
              </div>
            </div>
            <div className="books-grid books-grid--3">
              <label className="books-field">
                <span className="books-field__label">Slug</span>
                <input
                  className="books-input"
                  value={style.slug}
                  onChange={(event) => updateStyle({ slug: event.target.value })}
                  placeholder="lofi"
                />
              </label>
              <label className="books-field">
                <span className="books-field__label">Название</span>
                <input
                  className="books-input"
                  value={style.title}
                  onChange={(event) => updateStyle({ title: event.target.value })}
                />
              </label>
              <label className="books-field">
                <span className="books-field__label">Порядок</span>
                <input
                  className="books-input"
                  type="number"
                  value={style.sort_order ?? ""}
                  onChange={(event) =>
                    updateStyle({
                      sort_order: event.target.value === "" ? null : Number(event.target.value),
                    })}
                />
              </label>
              <label className="books-field books-field--wide">
                <span className="books-field__label">Описание</span>
                <textarea
                  className="books-input books-input--textarea"
                  value={style.description ?? ""}
                  onChange={(event) => updateStyle({ description: event.target.value })}
                />
              </label>
              <label className="books-field">
                <span className="books-field__label">Icon URL</span>
                <input
                  className="books-input"
                  value={style.icon_url ?? ""}
                  onChange={(event) => updateStyle({ icon_url: event.target.value })}
                />
                <span className="books-field__help">Можно вставить URL вручную или загрузить png/jpeg в bucket `parrot-style-media`.</span>
                <input
                  className="books-input"
                  type="file"
                  accept="image/png,image/jpeg"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) {
                      void uploadStyleIcon(file);
                    }
                    event.currentTarget.value = "";
                  }}
                />
              </label>
              <label className="books-field">
                <span className="books-field__label">Search artist</span>
                <input
                  className="books-input"
                  value={style.search_artist ?? ""}
                  onChange={(event) => updateStyle({ search_artist: event.target.value })}
                />
              </label>
              <label className="books-field">
                <span className="books-field__label">Search genre</span>
                <input
                  className="books-input"
                  value={style.search_genre ?? ""}
                  onChange={(event) => updateStyle({ search_genre: event.target.value })}
                />
              </label>
            </div>
            <label className="books-checkbox books-checkbox--inline">
              <input
                type="checkbox"
                checked={style.is_active}
                onChange={(event) => updateStyle({ is_active: event.target.checked })}
              />
              <span>
                <strong>Активен</strong>
                <small>Неактивные стили остаются в админке, но исчезают из публичного runtime.</small>
              </span>
            </label>
          </section>

          <section className="books-panel">
            <div className="books-section-head">
              <div>
                <h2 className="books-panel__title">Инструменты</h2>
                <p className="books-section-help">
                  `preset_key` должен совпадать с папкой инструмента в storage. Здесь же загружаются иконки инструментов и mp3 вариантов.
                </p>
              </div>
              <div className="books-actions">
                <button type="button" className="books-button books-button--secondary" onClick={addPreset}>
                  Добавить инструмент
                </button>
              </div>
            </div>
            {style.presets.map((preset, presetIndex) => (
              <div className="books-subpanel" key={`preset-${presetIndex}`}>
                <div className="books-section-head">
                  <div>
                    <h3 className="books-subpanel__title">
                      {preset.title || preset.preset_key || `Инструмент ${presetIndex + 1}`}
                    </h3>
                    <p className="books-section-help">Один инструмент содержит свою иконку, дефолтный variant и список mp3-вариантов.</p>
                  </div>
                  <div className="books-actions">
                    <button
                      type="button"
                      className="books-button books-button--ghost"
                      onClick={() => removePreset(presetIndex)}
                    >
                      Удалить инструмент
                    </button>
                  </div>
                </div>
                <div className="books-grid books-grid--3">
                  <label className="books-field">
                    <span className="books-field__label">Preset key</span>
                    <input
                      className="books-input"
                      value={preset.preset_key}
                      onChange={(event) => updatePreset(presetIndex, { preset_key: event.target.value })}
                      placeholder="bells"
                    />
                  </label>
                  <label className="books-field">
                    <span className="books-field__label">Название</span>
                    <input
                      className="books-input"
                      value={preset.title}
                      onChange={(event) => updatePreset(presetIndex, { title: event.target.value })}
                    />
                  </label>
                  <label className="books-field">
                    <span className="books-field__label">Порядок</span>
                    <input
                      className="books-input"
                      type="number"
                      value={preset.sort_order ?? ""}
                      onChange={(event) =>
                        updatePreset(presetIndex, {
                          sort_order: event.target.value === "" ? null : Number(event.target.value),
                        })}
                    />
                  </label>
                  <label className="books-field books-field--wide">
                    <span className="books-field__label">Icon URL</span>
                    <input
                      className="books-input"
                      value={preset.icon_url ?? ""}
                      onChange={(event) => updatePreset(presetIndex, { icon_url: event.target.value })}
                    />
                    <span className="books-field__help">Загрузка сохраняет png/jpeg как webp в `parrot-style-media`.</span>
                    <input
                      className="books-input"
                      type="file"
                      accept="image/png,image/jpeg"
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (file) {
                          void uploadPresetIcon(presetIndex, file);
                        }
                        event.currentTarget.value = "";
                      }}
                    />
                  </label>
                  <label className="books-field">
                    <span className="books-field__label">Default variant key</span>
                    <input
                      className="books-input"
                      value={preset.default_variant_key ?? ""}
                      onChange={(event) => updatePreset(presetIndex, { default_variant_key: event.target.value })}
                      placeholder="bells_01"
                    />
                  </label>
                </div>
                <label className="books-checkbox books-checkbox--inline">
                  <input
                    type="checkbox"
                    checked={preset.default_on}
                    onChange={(event) => updatePreset(presetIndex, { default_on: event.target.checked })}
                  />
                  <span>
                    <strong>Включён по умолчанию</strong>
                    <small>Инструмент будет сразу активен при открытии студии.</small>
                  </span>
                </label>

                <div className="books-section-head">
                  <div>
                    <h4 className="books-subpanel__title">Варианты</h4>
                    <p className="books-section-help">Можно вставить `audio_url` вручную или загрузить mp3 прямо в bucket `parrot-audio`.</p>
                  </div>
                  <div className="books-actions">
                    <button
                      type="button"
                      className="books-button books-button--secondary"
                      onClick={() => addVariant(presetIndex)}
                    >
                      Добавить вариант
                    </button>
                  </div>
                </div>
                {preset.variants.map((variant, variantIndex) => (
                  <div className="books-question" key={`preset-${presetIndex}-variant-${variantIndex}`}>
                    <div className="books-actions books-actions--compact">
                      <button
                        type="button"
                        className="books-button books-button--ghost"
                        onClick={() => removeVariant(presetIndex, variantIndex)}
                      >
                        Удалить вариант
                      </button>
                    </div>
                    <div className="books-grid books-grid--3">
                      <label className="books-field">
                        <span className="books-field__label">Variant key</span>
                        <input
                          className="books-input"
                          value={variant.variant_key}
                          onChange={(event) =>
                            updateVariant(presetIndex, variantIndex, { variant_key: event.target.value })}
                          placeholder="bells_01"
                        />
                      </label>
                      <label className="books-field">
                        <span className="books-field__label">Название</span>
                        <input
                          className="books-input"
                          value={variant.title ?? ""}
                          onChange={(event) =>
                            updateVariant(presetIndex, variantIndex, { title: event.target.value })}
                        />
                      </label>
                      <label className="books-field">
                        <span className="books-field__label">Порядок</span>
                        <input
                          className="books-input"
                          type="number"
                          value={variant.sort_order ?? ""}
                          onChange={(event) =>
                            updateVariant(presetIndex, variantIndex, {
                              sort_order: event.target.value === "" ? null : Number(event.target.value),
                            })}
                        />
                      </label>
                      <label className="books-field books-field--wide">
                        <span className="books-field__label">Audio URL</span>
                        <input
                          className="books-input"
                          value={variant.audio_url}
                          onChange={(event) =>
                            updateVariant(presetIndex, variantIndex, { audio_url: event.target.value })}
                          placeholder="https://.../parrots/afroperc/bells/afroperc_bells_01.mp3"
                        />
                        <span className="books-field__help">Upload path: <code>parrots/{`{style.slug}`}/{`{preset_key}`}/filename.mp3</code></span>
                        <input
                          className="books-input"
                          type="file"
                          accept=".mp3,audio/mpeg"
                          onChange={(event) => {
                            const file = event.target.files?.[0];
                            if (file) {
                              void uploadVariantAudio(presetIndex, variantIndex, file);
                            }
                            event.currentTarget.value = "";
                          }}
                        />
                      </label>
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </section>

          <section className="books-panel">
            <div className="books-section-head">
              <div>
                <h2 className="books-panel__title">Слайды</h2>
                <p className="books-section-help">Базовые русские слайды истории хранятся прямо в `parrot_music_style_slides`.</p>
              </div>
              <div className="books-actions">
                <button type="button" className="books-button books-button--secondary" onClick={addSlide}>
                  Добавить слайд
                </button>
              </div>
            </div>
            {style.slides.map((slide, slideIndex) => (
              <div className="books-question" key={`slide-${slideIndex}`}>
                <div className="books-actions books-actions--compact">
                  <button
                    type="button"
                    className="books-button books-button--ghost"
                    onClick={() => removeSlide(slideIndex)}
                  >
                    Удалить слайд
                  </button>
                </div>
                <div className="books-grid books-grid--3">
                  <label className="books-field">
                    <span className="books-field__label">Порядок</span>
                    <input className="books-input" type="number" value={slideIndex + 1} readOnly />
                  </label>
                  <label className="books-field">
                    <span className="books-field__label">Тип медиа</span>
                    <select
                      className="books-input"
                      value={slide.media_type ?? ""}
                      onChange={(event) =>
                        updateSlide(slideIndex, {
                          media_type: (event.target.value || null) as ParrotMusicStyleMediaType | null,
                        })}
                    >
                      <option value="">None</option>
                      <option value="gif">gif</option>
                      <option value="image">image</option>
                      <option value="video">video</option>
                    </select>
                  </label>
                  <label className="books-field books-field--wide">
                    <span className="books-field__label">Текст</span>
                    <textarea
                      className="books-input books-input--small-textarea"
                      value={slide.text}
                      onChange={(event) => updateSlide(slideIndex, { text: event.target.value })}
                    />
                  </label>
                  <label className="books-field books-field--wide">
                    <span className="books-field__label">Media URL</span>
                    <input
                      className="books-input"
                      value={slide.media_url ?? ""}
                      onChange={(event) => updateSlide(slideIndex, { media_url: event.target.value })}
                    />
                  </label>
                </div>
              </div>
            ))}
          </section>

          <section className="books-panel">
            <div className="books-section-head">
              <div>
                <h2 className="books-panel__title">Переводы</h2>
                <p className="books-section-help">
                  Необязательные `en` и `he` payloads хранятся в `content_translations` с `content_type = parrot_music_style`.
                </p>
              </div>
            </div>
            {(["en", "he"] as const).map((language) => {
              const translation = style.translations[language] ?? createEmptyTranslation();
              return (
                <div className="books-subpanel" key={language}>
                  <div className="books-section-head">
                    <div>
                      <h3 className="books-subpanel__title">{language.toUpperCase()}</h3>
                      <p className="books-section-help">
                        Перевод может быть неполным, но все переданные поля должны быть структурно валидны.
                      </p>
                    </div>
                    <div className="books-actions">
                      <button
                        type="button"
                        className="books-button books-button--secondary"
                        onClick={() => addTranslationSlide(language)}
                      >
                        Добавить переведённый слайд
                      </button>
                    </div>
                  </div>
                  <div className="books-grid books-grid--2">
                    <label className="books-field">
                      <span className="books-field__label">Название</span>
                      <input
                        className="books-input"
                        value={translation.title ?? ""}
                        onChange={(event) => updateTranslation(language, { title: event.target.value })}
                      />
                    </label>
                    <label className="books-field">
                      <span className="books-field__label">Описание</span>
                      <textarea
                        className="books-input books-input--small-textarea"
                        value={translation.description ?? ""}
                        onChange={(event) => updateTranslation(language, { description: event.target.value })}
                      />
                    </label>
                  </div>
                  {(translation.slides ?? []).map((slide, slideIndex) => (
                    <div className="books-question" key={`${language}-slide-${slideIndex}`}>
                      <div className="books-actions books-actions--compact">
                        <button
                          type="button"
                          className="books-button books-button--ghost"
                          onClick={() => removeTranslationSlide(language, slideIndex)}
                        >
                          Удалить переведённый слайд
                        </button>
                      </div>
                      <div className="books-grid books-grid--2">
                        <label className="books-field">
                          <span className="books-field__label">Порядок</span>
                          <input
                            className="books-input"
                            type="number"
                            value={slide.order}
                            onChange={(event) =>
                              updateTranslationSlide(language, slideIndex, {
                                order: Number(event.target.value) || slide.order,
                              })}
                          />
                        </label>
                        <label className="books-field">
                          <span className="books-field__label">Текст</span>
                          <textarea
                            className="books-input books-input--small-textarea"
                            value={slide.text}
                            onChange={(event) =>
                              updateTranslationSlide(language, slideIndex, { text: event.target.value })}
                          />
                        </label>
                      </div>
                    </div>
                  ))}
                </div>
              );
            })}
          </section>
        </>
      ) : null}
    </div>
  );
}
