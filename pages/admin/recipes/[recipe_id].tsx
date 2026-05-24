"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/router";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { AdminLogout } from "../../../components/AdminLogout";
import { AdminTabs } from "../../../components/AdminTabs";
import type { RecipeRecord } from "../../../lib/recipes/types";

type RecipeLayoutElement = {
  id: string;
  kind: "title" | "country" | "image" | "text" | "list" | "steps";
  label: string;
  source:
    | "title"
    | "country"
    | "image_url"
    | "raccoon_caption"
    | "cooking_time"
    | "ingredients"
    | "cooking_steps"
    | "fact"
    | "raccoon_advice"
    | "serving_instructions"
    | "laplapla_interaction_caption";
  x: number;
  y: number;
  width: number;
  height?: number;
  fontSize: number;
  rotation: number;
  align: "left" | "center" | "right";
  visible: boolean;
};

type RecipeLayout = {
  canvas: {
    width: number;
    height: number;
  };
  elements: RecipeLayoutElement[];
};

type DragState = {
  id: string;
  startClientX: number;
  startClientY: number;
  startX: number;
  startY: number;
};

type RecipeStudioLanguage = "ru" | "en" | "he";
type RecipeMediaKind = "dish" | "recipe_asset_sheet" | "raccoon_sticker_sheet";
type RecipeCropMode = "recipe_asset" | "raccoon_sticker";

type CropRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type CropInteraction = {
  action: "move" | "resize";
  startClientX: number;
  startClientY: number;
  startRect: CropRect;
};

async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, options);
  const data = (await response.json()) as T & { error?: string };
  if (!response.ok) {
    throw new Error(data.error ?? "Request failed.");
  }
  return data;
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
      } else {
        reject(new Error("Failed to read image blob."));
      }
    };
    reader.onerror = () => reject(new Error("Failed to read image blob."));
    reader.readAsDataURL(blob);
  });
}

function loadCanvasImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = src;
  });
}

function roundedRectPath(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  const safeRadius = Math.min(radius, width / 2, height / 2);
  context.beginPath();
  context.moveTo(x + safeRadius, y);
  context.lineTo(x + width - safeRadius, y);
  context.quadraticCurveTo(x + width, y, x + width, y + safeRadius);
  context.lineTo(x + width, y + height - safeRadius);
  context.quadraticCurveTo(x + width, y + height, x + width - safeRadius, y + height);
  context.lineTo(x + safeRadius, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - safeRadius);
  context.lineTo(x, y + safeRadius);
  context.quadraticCurveTo(x, y, x + safeRadius, y);
  context.closePath();
}

function wrapText(context: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (context.measureText(candidate).width <= maxWidth || !current) {
      current = candidate;
    } else {
      lines.push(current);
      current = word;
    }
  }

  if (current) {
    lines.push(current);
  }

  return lines.length > 0 ? lines : [""];
}

function drawWrappedText(
  context: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
) {
  const lines = wrapText(context, text, maxWidth);
  lines.forEach((line, index) => {
    context.fillText(line, x, y + index * lineHeight);
  });
}

function publicR2Url(path: string) {
  const base = (process.env.NEXT_PUBLIC_R2_PUBLIC_URL || "https://media.laplapla.com").replace(/\/+$/, "");
  return `${base}/${path.split("/").map((segment) => encodeURIComponent(segment)).join("/")}`;
}

function withCacheBuster(url: string | null | undefined, key: string | number | null | undefined) {
  if (!url) {
    return "";
  }
  if (!key) {
    return url;
  }
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}v=${encodeURIComponent(String(key))}`;
}

function defaultLayout(): RecipeLayout {
  return {
    canvas: { width: 1000, height: 1500 },
    elements: [
      { id: "brand", kind: "text", label: "Логотип", source: "laplapla_interaction_caption", x: 7, y: 4, width: 30, fontSize: 18, rotation: 0, align: "left", visible: true },
      { id: "country", kind: "country", label: "Страна", source: "country", x: 7, y: 9, width: 48, fontSize: 18, rotation: 0, align: "left", visible: true },
      { id: "title", kind: "title", label: "Название", source: "title", x: 7, y: 13, width: 72, fontSize: 48, rotation: 0, align: "left", visible: true },
      { id: "image", kind: "image", label: "Картинка блюда", source: "image_url", x: 18, y: 24, width: 64, height: 19, fontSize: 16, rotation: -2, align: "center", visible: true },
      { id: "caption", kind: "text", label: "Фраза енотика", source: "raccoon_caption", x: 47, y: 42, width: 42, fontSize: 22, rotation: 2, align: "center", visible: true },
      { id: "time", kind: "text", label: "Время", source: "cooking_time", x: 7, y: 45, width: 34, fontSize: 20, rotation: 0, align: "center", visible: true },
      { id: "ingredients", kind: "list", label: "Ингредиенты", source: "ingredients", x: 7, y: 52, width: 38, fontSize: 18, rotation: 0, align: "left", visible: true },
      { id: "steps", kind: "steps", label: "Шаги", source: "cooking_steps", x: 48, y: 52, width: 44, fontSize: 17, rotation: 0, align: "left", visible: true },
      { id: "fact", kind: "text", label: "Факт", source: "fact", x: 8, y: 76, width: 84, fontSize: 17, rotation: 0, align: "center", visible: true },
      { id: "advice", kind: "text", label: "Совет", source: "raccoon_advice", x: 8, y: 84, width: 40, fontSize: 17, rotation: -1, align: "left", visible: true },
      { id: "serving", kind: "text", label: "Подача", source: "serving_instructions", x: 53, y: 84, width: 39, fontSize: 17, rotation: 1, align: "left", visible: true },
      { id: "interaction", kind: "text", label: "CTA", source: "laplapla_interaction_caption", x: 12, y: 94, width: 76, fontSize: 18, rotation: 0, align: "center", visible: true },
    ],
  };
}

function normalizeLayout(value: unknown): RecipeLayout {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return defaultLayout();
  }

  const record = value as { canvas?: unknown; elements?: unknown };
  if (!Array.isArray(record.elements)) {
    return defaultLayout();
  }

  const fallback = defaultLayout();
  const elements = record.elements
    .map((item): RecipeLayoutElement | null => {
      if (!item || typeof item !== "object") {
        return null;
      }
      const element = item as Partial<RecipeLayoutElement>;
      const fallbackElement = fallback.elements.find((candidate) => candidate.id === element.id);
      if (!element.id || !element.source || !fallbackElement) {
        return null;
      }
      const normalizedElement: RecipeLayoutElement = {
        ...fallbackElement,
        ...element,
        x: Number(element.x ?? fallbackElement.x),
        y: Number(element.y ?? fallbackElement.y),
        width: Number(element.width ?? fallbackElement.width),
        height: element.height === undefined ? fallbackElement.height : Number(element.height),
        fontSize: Number(element.fontSize ?? fallbackElement.fontSize),
        rotation: Number(element.rotation ?? fallbackElement.rotation),
        visible: element.visible !== false,
      };
      return normalizedElement;
    })
    .filter((item): item is RecipeLayoutElement => item !== null);

  const merged = [
    ...elements,
    ...fallback.elements.filter((item) => !elements.some((existing) => existing.id === item.id)),
  ];

  return {
    canvas: fallback.canvas,
    elements: merged,
  };
}

function recipeToEditableJson(recipe: RecipeRecord): string {
  const {
    id,
    created_at,
    updated_at,
    ...payload
  } = recipe;
  void id;
  void created_at;
  void updated_at;
  return JSON.stringify(payload, null, 2);
}

function recipePayload(recipe: RecipeRecord, layout: RecipeLayout) {
  const {
    id,
    created_at,
    updated_at,
    ...payload
  } = recipe;
  void id;
  void created_at;
  void updated_at;
  return {
    ...payload,
    layout_json: layout,
  };
}

function recipeTextForLanguage(
  recipe: RecipeRecord,
  language: RecipeStudioLanguage,
  key: Exclude<RecipeLayoutElement["source"], "image_url">,
): string | string[] {
  const translation = language === "ru" ? null : recipe.translations[language];

  switch (key) {
    case "title":
      return translation?.title ?? recipe.title;
    case "country":
      return translation?.country ?? recipe.country ?? "Страна";
    case "raccoon_caption":
      return translation?.raccoon_caption ?? recipe.raccoon_caption ?? "Енотик советует попробовать!";
    case "cooking_time": {
      const label = language === "en" ? "Time" : language === "he" ? "זמן" : "Время";
      const cookingTime = translation?.cooking_time ?? recipe.cooking_time;
      return cookingTime ? `${label}: ${cookingTime}` : label;
    }
    case "ingredients":
      return translation?.ingredients?.length ? translation.ingredients : recipe.ingredients;
    case "cooking_steps":
      return (translation?.cooking_steps?.length ? translation.cooking_steps : recipe.cooking_steps)
        .map((step) => `${step.order}. ${step.text}`);
    case "fact":
      return translation?.fact ?? recipe.fact ?? "";
    case "raccoon_advice":
      return translation?.raccoon_advice ?? recipe.raccoon_advice ?? "";
    case "serving_instructions":
      return translation?.serving_instructions ?? recipe.serving_instructions ?? "";
    case "laplapla_interaction_caption":
      return translation?.laplapla_interaction_caption ?? recipe.laplapla_interaction_caption ?? "Сохрани рецепт на будущее";
    default:
      return "";
  }
}

function valueForElement(
  recipe: RecipeRecord,
  element: RecipeLayoutElement,
  language: RecipeStudioLanguage,
): string | string[] {
  if (element.id === "brand") {
    return "LapLapLa";
  }

  if (element.source === "image_url") {
    return withCacheBuster(recipe.image_url, recipe.updated_at);
  }

  return recipeTextForLanguage(recipe, language, element.source);
}

async function renderRecipeToPngBlob(
  recipe: RecipeRecord,
  layout: RecipeLayout,
  language: RecipeStudioLanguage,
): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = layout.canvas.width;
  canvas.height = layout.canvas.height;
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Canvas is not available in this browser.");
  }

  const gradient = context.createLinearGradient(0, 0, canvas.width, canvas.height);
  gradient.addColorStop(0, recipe.gradient_from || "#fff4cf");
  gradient.addColorStop(1, recipe.gradient_to || "#b9efe4");
  context.fillStyle = gradient;
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.textBaseline = "top";

  for (const element of layout.elements.filter((item) => item.visible)) {
    const x = (element.x / 100) * canvas.width;
    const y = (element.y / 100) * canvas.height;
    const width = (element.width / 100) * canvas.width;
    const height = element.height ? (element.height / 100) * canvas.height : undefined;
    const value = valueForElement(recipe, element, language);
    const padding = 20;

    context.save();
    context.translate(x + width / 2, y + (height ?? element.fontSize * 3) / 2);
    context.rotate((element.rotation * Math.PI) / 180);
    context.translate(-width / 2, -(height ?? element.fontSize * 3) / 2);

    if (element.kind === "image") {
      const imageHeight = height ?? 285;
      roundedRectPath(context, 0, 0, width, imageHeight, 24);
      context.fillStyle = "rgba(255, 255, 255, 0.42)";
      context.fill();

      if (typeof value === "string" && value) {
        const image = await loadCanvasImage(value);
        if (image) {
          const imageRatio = image.width / image.height;
          const boxRatio = width / imageHeight;
          const drawWidth = imageRatio > boxRatio ? width : imageHeight * imageRatio;
          const drawHeight = imageRatio > boxRatio ? width / imageRatio : imageHeight;
          context.save();
          roundedRectPath(context, 0, 0, width, imageHeight, 24);
          context.clip();
          context.drawImage(image, (width - drawWidth) / 2, (imageHeight - drawHeight) / 2, drawWidth, drawHeight);
          context.restore();
        } else {
          context.fillStyle = "#68778c";
          context.font = "700 34px Arial, sans-serif";
          context.textAlign = "center";
          context.fillText("dish image", width / 2, imageHeight / 2 - 18);
        }
      }

      context.restore();
      continue;
    }

    if (element.kind !== "title" && element.kind !== "country") {
      const blockHeight = Math.max(height ?? 0, element.fontSize * (Array.isArray(value) ? value.length + 1.4 : 3.2));
      roundedRectPath(context, 0, 0, width, blockHeight, 20);
      context.fillStyle = "rgba(255, 255, 255, 0.62)";
      context.fill();
    }

    context.fillStyle = "#18202d";
    context.font = `${element.kind === "title" || element.kind === "country" ? 900 : 700} ${element.fontSize}px Arial, sans-serif`;
    context.textAlign = element.align;
    context.direction = language === "he" ? "rtl" : "ltr";

    const textX = element.align === "center" ? width / 2 : element.align === "right" ? width - padding : padding;
    const textY = element.kind === "title" || element.kind === "country" ? 0 : padding;
    const lineHeight = element.fontSize * 1.22;
    const maxTextWidth = Math.max(20, width - padding * 2);

    if (Array.isArray(value)) {
      let offsetY = textY;
      for (const item of value) {
        drawWrappedText(context, item, textX, offsetY, maxTextWidth, lineHeight);
        offsetY += wrapText(context, item, maxTextWidth).length * lineHeight + lineHeight * 0.3;
      }
    } else {
      drawWrappedText(context, value, textX, textY, maxTextWidth, lineHeight);
    }

    context.restore();
  }

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
      } else {
        reject(new Error("Failed to export PNG."));
      }
    }, "image/png");
  });
}

export default function RecipeEditorPage() {
  const router = useRouter();
  const supabase = createClientComponentClient();
  const recipeId = typeof router.query.recipe_id === "string" ? router.query.recipe_id : "";
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const dragStateRef = useRef<DragState | null>(null);
  const cropStageRef = useRef<HTMLDivElement | null>(null);
  const cropBoxRef = useRef<HTMLDivElement | null>(null);
  const cropInteractionRef = useRef<CropInteraction | null>(null);

  const [sessionChecked, setSessionChecked] = useState(false);
  const [recipe, setRecipe] = useState<RecipeRecord | null>(null);
  const [layout, setLayout] = useState<RecipeLayout>(defaultLayout);
  const [selectedId, setSelectedId] = useState("title");
  const [jsonValue, setJsonValue] = useState("");
  const [studioLanguage, setStudioLanguage] = useState<RecipeStudioLanguage>("ru");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [uploadingExport, setUploadingExport] = useState(false);
  const [uploadingMedia, setUploadingMedia] = useState<RecipeMediaKind | null>(null);
  const [assetSetName, setAssetSetName] = useState("");
  const [stickerSetName, setStickerSetName] = useState("");
  const [cropMode, setCropMode] = useState<RecipeCropMode>("recipe_asset");
  const [cropRect, setCropRect] = useState<CropRect>({ x: 12, y: 12, width: 28, height: 28 });
  const [cropNaturalSize, setCropNaturalSize] = useState({ width: 0, height: 0 });
  const [assetCropIndex, setAssetCropIndex] = useState(1);
  const [stickerCropIndex, setStickerCropIndex] = useState(1);
  const [savingCrop, setSavingCrop] = useState(false);
  const [savedCropUrls, setSavedCropUrls] = useState<Array<{ label: string; url: string }>>([]);
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
    if (!sessionChecked || !recipeId) {
      return;
    }

    setLoading(true);
    setError(null);
    fetchJson<{ recipe: RecipeRecord }>(`/api/admin/recipes/${recipeId}`)
      .then((data) => {
        const loadedLayout = normalizeLayout(data.recipe.layout_json);
        setRecipe(data.recipe);
        setLayout(loadedLayout);
        setJsonValue(recipeToEditableJson(data.recipe));
        setAssetSetName(data.recipe.asset_set_key ?? "");
        setStickerSetName(data.recipe.sticker_set_key ?? "");
        setSelectedId(loadedLayout.elements[0]?.id ?? "title");
      })
      .catch((fetchError) => setError(fetchError instanceof Error ? fetchError.message : String(fetchError)))
      .finally(() => setLoading(false));
  }, [recipeId, sessionChecked]);

  const selectedElement = useMemo(
    () => layout.elements.find((element) => element.id === selectedId) ?? layout.elements[0],
    [layout.elements, selectedId],
  );

  const activeCropSetKey =
    cropMode === "recipe_asset"
      ? assetSetName || recipe?.asset_set_key || ""
      : stickerSetName || recipe?.sticker_set_key || "";
  const activeCropIndex = cropMode === "recipe_asset" ? assetCropIndex : stickerCropIndex;
  const activeCropSourceUrl =
    activeCropSetKey.trim()
      ? withCacheBuster(
          publicR2Url(
            cropMode === "recipe_asset"
              ? `recipes/assets/${activeCropSetKey.trim()}/source.webp`
              : `stickers/raccoon-stickers/${activeCropSetKey.trim()}/source.webp`,
          ),
          recipe?.updated_at,
        )
      : "";

  const updateElement = (id: string, patch: Partial<RecipeLayoutElement>) => {
    setLayout((current) => ({
      ...current,
      elements: current.elements.map((element) => (
        element.id === id ? { ...element, ...patch } : element
      )),
    }));
  };

  const saveRecipe = async (nextRecipe: RecipeRecord, nextLayout: RecipeLayout) => {
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const data = await fetchJson<{ recipe: RecipeRecord }>(`/api/admin/recipes/${nextRecipe.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipe: recipePayload(nextRecipe, nextLayout) }),
      });
      const savedLayout = normalizeLayout(data.recipe.layout_json);
      setRecipe(data.recipe);
      setLayout(savedLayout);
      setJsonValue(recipeToEditableJson(data.recipe));
      setSuccess("Рецепт сохранен.");
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : String(fetchError));
    } finally {
      setSaving(false);
    }
  };

  const saveFromJson = async () => {
    if (!recipe) {
      return;
    }

    try {
      const parsed = JSON.parse(jsonValue) as Omit<RecipeRecord, "id">;
      const nextRecipe = { ...recipe, ...parsed, id: recipe.id };
      const nextLayout = normalizeLayout(parsed.layout_json ?? layout);
      await saveRecipe(nextRecipe, nextLayout);
    } catch (parseError) {
      setError(parseError instanceof Error ? parseError.message : "JSON не удалось прочитать.");
    }
  };

  const startDrag = (event: React.PointerEvent<HTMLDivElement>, element: RecipeLayoutElement) => {
    if (!canvasRef.current) {
      return;
    }
    event.currentTarget.setPointerCapture(event.pointerId);
    dragStateRef.current = {
      id: element.id,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startX: element.x,
      startY: element.y,
    };
    setSelectedId(element.id);
  };

  const moveDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragStateRef.current;
    const canvas = canvasRef.current;
    if (!drag || !canvas) {
      return;
    }

    const rect = canvas.getBoundingClientRect();
    const dx = ((event.clientX - drag.startClientX) / rect.width) * 100;
    const dy = ((event.clientY - drag.startClientY) / rect.height) * 100;
    updateElement(drag.id, {
      x: Math.max(0, Math.min(95, drag.startX + dx)),
      y: Math.max(0, Math.min(96, drag.startY + dy)),
    });
  };

  const endDrag = () => {
    dragStateRef.current = null;
  };

  const startCropInteraction = (
    event: React.PointerEvent<HTMLElement>,
    action: CropInteraction["action"],
  ) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    cropInteractionRef.current = {
      action,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startRect: cropRect,
    };
  };

  const moveCropInteraction = (event: React.PointerEvent<HTMLDivElement>) => {
    const interaction = cropInteractionRef.current;
    const stage = cropStageRef.current;
    if (!interaction || !stage) {
      return;
    }

    const rect = stage.getBoundingClientRect();
    const dx = ((event.clientX - interaction.startClientX) / rect.width) * 100;
    const dy = ((event.clientY - interaction.startClientY) / rect.height) * 100;

    if (interaction.action === "move") {
      setCropRect({
        ...interaction.startRect,
        x: Math.max(0, Math.min(100 - interaction.startRect.width, interaction.startRect.x + dx)),
        y: Math.max(0, Math.min(100 - interaction.startRect.height, interaction.startRect.y + dy)),
      });
      return;
    }

    setCropRect({
      ...interaction.startRect,
      width: Math.max(4, Math.min(100 - interaction.startRect.x, interaction.startRect.width + dx)),
      height: Math.max(4, Math.min(100 - interaction.startRect.y, interaction.startRect.height + dy)),
    });
  };

  const endCropInteraction = () => {
    cropInteractionRef.current = null;
  };

  const exportPng = async (languages: RecipeStudioLanguage[]) => {
    if (!recipe) {
      return;
    }

    setExporting(true);
    setError(null);
    setSuccess(null);
    try {
      for (const language of languages) {
        const blob = await renderRecipeToPngBlob(recipe, layout, language);
        downloadBlob(blob, `${recipe.slug || "recipe"}-${language}-pinterest.png`);
      }
      await saveRecipe(recipe, layout);
      setSuccess(`PNG экспортирован: ${languages.map((language) => language.toUpperCase()).join(", ")}.`);
    } catch (exportError) {
      setError(exportError instanceof Error ? exportError.message : String(exportError));
    } finally {
      setExporting(false);
    }
  };

  const uploadPng = async (languages: RecipeStudioLanguage[]) => {
    if (!recipe) {
      return;
    }

    setUploadingExport(true);
    setError(null);
    setSuccess(null);
    try {
      let currentRecipe = recipe;
      await saveRecipe(currentRecipe, layout);

      for (const language of languages) {
        const blob = await renderRecipeToPngBlob(currentRecipe, layout, language);
        const imageBase64 = await blobToDataUrl(blob);
        const response = await fetchJson<{
          publicUrl: string;
          recipe: RecipeRecord;
        }>(`/api/admin/recipes/${currentRecipe.id}/export`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            language,
            contentType: "image/png",
            imageBase64,
          }),
        });
        currentRecipe = response.recipe;
        setRecipe(response.recipe);
        setJsonValue(recipeToEditableJson(response.recipe));
      }

      setSuccess(`PNG загружен в storage: ${languages.map((language) => language.toUpperCase()).join(", ")}.`);
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : String(uploadError));
    } finally {
      setUploadingExport(false);
    }
  };

  const uploadMedia = async (kind: RecipeMediaKind, file: File | null) => {
    if (!recipe || !file) {
      return;
    }

    if (!file.type.startsWith("image/")) {
      setError("Можно загружать только изображения.");
      return;
    }

    setUploadingMedia(kind);
    setError(null);
    setSuccess(null);
    try {
      const imageBase64 = await blobToDataUrl(file);
      const response = await fetchJson<{
        publicUrl: string;
        recipe: RecipeRecord;
        setKey?: string;
      }>(`/api/admin/recipes/${recipe.id}/media`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind,
          imageBase64,
          fileName: file.name,
          setName: kind === "recipe_asset_sheet" ? assetSetName : kind === "raccoon_sticker_sheet" ? stickerSetName : undefined,
          removeWhite: true,
        }),
      });

      setRecipe(response.recipe);
      setJsonValue(recipeToEditableJson(response.recipe));
      setAssetSetName(response.recipe.asset_set_key ?? "");
      setStickerSetName(response.recipe.sticker_set_key ?? "");
      setSuccess(`Медиа обработано и загружено: ${response.publicUrl}`);
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : String(uploadError));
    } finally {
      setUploadingMedia(null);
    }
  };

  const saveCropDetail = async () => {
    if (!recipe) {
      return;
    }
    const setKey = activeCropSetKey.trim();
    if (!setKey) {
      setError("Сначала укажите и загрузите набор ассетов или стикеров.");
      return;
    }
    const stageImage = cropStageRef.current?.querySelector("img");
    const imageRect = stageImage?.getBoundingClientRect();
    const boxRect = cropBoxRef.current?.getBoundingClientRect();
    if (!cropNaturalSize.width || !cropNaturalSize.height || !imageRect || !boxRect) {
      setError("Source image еще не загрузился.");
      return;
    }

    setSavingCrop(true);
    setError(null);
    setSuccess(null);
    try {
      const crop = {
        x: Math.round(((boxRect.left - imageRect.left) / imageRect.width) * cropNaturalSize.width),
        y: Math.round(((boxRect.top - imageRect.top) / imageRect.height) * cropNaturalSize.height),
        width: Math.round((boxRect.width / imageRect.width) * cropNaturalSize.width),
        height: Math.round((boxRect.height / imageRect.height) * cropNaturalSize.height),
      };
      const response = await fetchJson<{
        publicUrl: string;
        index: number;
      }>(`/api/admin/recipes/${recipe.id}/crop`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: cropMode,
          setKey,
          index: activeCropIndex,
          crop,
        }),
      });

      setSavedCropUrls((current) => [
        { label: `${cropMode === "recipe_asset" ? "asset" : "sticker"} ${response.index}`, url: response.publicUrl },
        ...current,
      ]);
      if (cropMode === "recipe_asset") {
        setAssetCropIndex((current) => current + 1);
      } else {
        setStickerCropIndex((current) => current + 1);
      }
      setSuccess(`Деталь сохранена: ${response.publicUrl}`);
    } catch (cropError) {
      setError(cropError instanceof Error ? cropError.message : String(cropError));
    } finally {
      setSavingCrop(false);
    }
  };

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
          <h1 className="books-admin-title">{recipe?.title ?? "Recipe Studio"}</h1>
          <p className="books-admin-subtitle">
            Редактирование JSON и первая раскладка Pinterest-карточки. Позиции блоков сохраняются в `layout_json`.
          </p>
        </div>
        <div className="books-actions">
          <button
            type="button"
            className="books-button books-button--ghost"
            onClick={() => {
              void router.push("/admin/recipes");
            }}
          >
            К списку
          </button>
          <button
            type="button"
            className="books-button books-button--primary"
            disabled={!recipe || saving || exporting || uploadingExport}
            onClick={() => {
              if (recipe) {
                void saveRecipe(recipe, layout);
              }
            }}
          >
            {saving ? "Сохранение..." : "Сохранить layout"}
          </button>
          <button
            type="button"
            className="books-button books-button--secondary"
            disabled={!recipe || exporting || uploadingExport}
            onClick={() => {
              void exportPng([studioLanguage]);
            }}
          >
            {exporting ? "Экспорт..." : "Скачать PNG"}
          </button>
          <button
            type="button"
            className="books-button books-button--success"
            disabled={!recipe || exporting || uploadingExport}
            onClick={() => {
              void uploadPng([studioLanguage]);
            }}
          >
            {uploadingExport ? "Загрузка..." : "Загрузить PNG"}
          </button>
        </div>
      </header>

      {error && <div className="books-alert books-alert--error">{error}</div>}
      {success && <div className="books-alert books-alert--success">{success}</div>}
      {loading && <div className="books-panel">Загрузка...</div>}

      {recipe ? (
        <>
          <section className="books-panel recipe-media-panel">
            <div className="books-section-head">
              <div>
                <h2 className="books-panel__title">Медиа для рецепта</h2>
                <p className="books-section-help">
                  Загружаем PNG/JPEG на белом фоне, сервер удаляет белый фон, конвертирует в WebP и сохраняет в R2.
                </p>
              </div>
            </div>
            <div className="recipe-media-grid">
              <label className="recipe-media-card">
                <span className="recipe-media-card__title">Картинка блюда</span>
                <small>R2: recipes/recipes-pics/{recipe.slug}.webp</small>
                {recipe.image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={withCacheBuster(recipe.image_url, recipe.updated_at)} alt="" className="recipe-media-card__preview" />
                ) : null}
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  disabled={uploadingMedia !== null}
                  onChange={(event) => {
                    void uploadMedia("dish", event.target.files?.[0] ?? null);
                    event.currentTarget.value = "";
                  }}
                />
              </label>

              <label className="recipe-media-card">
                <span className="recipe-media-card__title">Набор ассетов</span>
                <small>R2: recipes/assets/[set]/source.webp</small>
                <input
                  className="books-input"
                  value={assetSetName}
                  onChange={(event) => setAssetSetName(event.target.value)}
                  placeholder="khachapuri-assets"
                />
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  disabled={uploadingMedia !== null}
                  onChange={(event) => {
                    void uploadMedia("recipe_asset_sheet", event.target.files?.[0] ?? null);
                    event.currentTarget.value = "";
                  }}
                />
              </label>

              <label className="recipe-media-card">
                <span className="recipe-media-card__title">Стикеры енотика</span>
                <small>R2: stickers/raccoon-stickers/[set]/source.webp</small>
                <input
                  className="books-input"
                  value={stickerSetName}
                  onChange={(event) => setStickerSetName(event.target.value)}
                  placeholder="raccoon-kitchen-01"
                />
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  disabled={uploadingMedia !== null}
                  onChange={(event) => {
                    void uploadMedia("raccoon_sticker_sheet", event.target.files?.[0] ?? null);
                    event.currentTarget.value = "";
                  }}
                />
              </label>
            </div>
            {uploadingMedia ? (
              <div className="books-alert books-alert--success">Обработка медиа...</div>
            ) : null}
          </section>

          <section className="books-panel recipe-crop-panel">
            <div className="books-section-head">
              <div>
                <h2 className="books-panel__title">Нарезка деталей</h2>
                <p className="books-section-help">
                  Выберите набор, перетащите рамку на нужную деталь, растяните нижний правый угол и сохраните crop как отдельный WebP.
                </p>
              </div>
              <div className="books-actions">
                <button
                  type="button"
                  className={cropMode === "recipe_asset" ? "books-button books-button--primary" : "books-button books-button--ghost"}
                  onClick={() => setCropMode("recipe_asset")}
                >
                  Ассеты
                </button>
                <button
                  type="button"
                  className={cropMode === "raccoon_sticker" ? "books-button books-button--primary" : "books-button books-button--ghost"}
                  onClick={() => setCropMode("raccoon_sticker")}
                >
                  Стикеры
                </button>
              </div>
            </div>

            <div className="recipe-crop-shell">
              <div className="recipe-crop-stage-wrap">
                {activeCropSourceUrl ? (
                  <div
                    ref={cropStageRef}
                    className="recipe-crop-stage"
                    onPointerMove={moveCropInteraction}
                    onPointerUp={endCropInteraction}
                    onPointerCancel={endCropInteraction}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={activeCropSourceUrl}
                      alt=""
                      onLoad={(event) => {
                        setCropNaturalSize({
                          width: event.currentTarget.naturalWidth,
                          height: event.currentTarget.naturalHeight,
                        });
                      }}
                    />
                    <div
                      ref={cropBoxRef}
                      className="recipe-crop-box"
                      style={{
                        left: `${cropRect.x}%`,
                        top: `${cropRect.y}%`,
                        width: `${cropRect.width}%`,
                        height: `${cropRect.height}%`,
                      }}
                      onPointerDown={(event) => startCropInteraction(event, "move")}
                    >
                      <span className="recipe-crop-box__label">
                        {Math.round((cropRect.width / 100) * cropNaturalSize.width)} x {Math.round((cropRect.height / 100) * cropNaturalSize.height)}
                      </span>
                      <span
                        className="recipe-crop-box__handle"
                        onPointerDown={(event) => {
                          event.stopPropagation();
                          startCropInteraction(event, "resize");
                        }}
                      />
                    </div>
                  </div>
                ) : (
                  <div className="recipe-crop-empty">
                    {activeCropSetKey.trim()
                      ? "Не удалось собрать URL source sheet."
                      : "Загрузите source sheet и укажите имя набора."}
                  </div>
                )}
              </div>

              <aside className="recipe-crop-controls">
                <label className="books-field">
                  <span className="books-field__label">Набор</span>
                  <input
                    className="books-input"
                    value={activeCropSetKey}
                    onChange={(event) => {
                      if (cropMode === "recipe_asset") {
                        setAssetSetName(event.target.value);
                      } else {
                        setStickerSetName(event.target.value);
                      }
                    }}
                  />
                  {activeCropSourceUrl ? (
                    <span className="books-field__help">
                      Source: <a href={activeCropSourceUrl} target="_blank" rel="noreferrer">{activeCropSourceUrl}</a>
                    </span>
                  ) : null}
                </label>
                <label className="books-field">
                  <span className="books-field__label">Порядковый номер</span>
                  <input
                    className="books-input"
                    type="number"
                    min={1}
                    value={activeCropIndex}
                    onChange={(event) => {
                      const next = Math.max(1, Number(event.target.value) || 1);
                      if (cropMode === "recipe_asset") {
                        setAssetCropIndex(next);
                      } else {
                        setStickerCropIndex(next);
                      }
                    }}
                  />
                </label>
                <div className="books-grid books-grid--2">
                  <label className="books-field">
                    <span className="books-field__label">X %</span>
                    <input className="books-input" type="number" value={Math.round(cropRect.x)} onChange={(event) => setCropRect((current) => ({ ...current, x: Number(event.target.value) }))} />
                  </label>
                  <label className="books-field">
                    <span className="books-field__label">Y %</span>
                    <input className="books-input" type="number" value={Math.round(cropRect.y)} onChange={(event) => setCropRect((current) => ({ ...current, y: Number(event.target.value) }))} />
                  </label>
                  <label className="books-field">
                    <span className="books-field__label">W %</span>
                    <input className="books-input" type="number" value={Math.round(cropRect.width)} onChange={(event) => setCropRect((current) => ({ ...current, width: Number(event.target.value) }))} />
                  </label>
                  <label className="books-field">
                    <span className="books-field__label">H %</span>
                    <input className="books-input" type="number" value={Math.round(cropRect.height)} onChange={(event) => setCropRect((current) => ({ ...current, height: Number(event.target.value) }))} />
                  </label>
                </div>
                <button
                  type="button"
                  className="books-button books-button--success"
                  disabled={savingCrop || !activeCropSourceUrl}
                  onClick={() => {
                    void saveCropDetail();
                  }}
                >
                  {savingCrop ? "Сохранение..." : "Сохранить деталь"}
                </button>
                {savedCropUrls.length > 0 ? (
                  <div className="recipe-export-links">
                    {savedCropUrls.map((item) => (
                      <a key={item.url} href={item.url} target="_blank" rel="noreferrer">
                        {item.label}
                      </a>
                    ))}
                  </div>
                ) : null}
              </aside>
            </div>
          </section>

          <section className="books-panel recipe-studio-panel">
            <div className="recipe-studio-toolbar">
              <div className="books-actions">
                {(["ru", "en", "he"] as const).map((language) => (
                  <button
                    key={language}
                    type="button"
                    className={studioLanguage === language ? "books-button books-button--primary" : "books-button books-button--ghost"}
                    onClick={() => setStudioLanguage(language)}
                  >
                    {language.toUpperCase()}
                  </button>
                ))}
              </div>
              <div className="books-actions">
                <button
                  type="button"
                  className="books-button books-button--secondary"
                  disabled={exporting || uploadingExport}
                  onClick={() => {
                    void exportPng(["ru", "en", "he"]);
                  }}
                >
                  Скачать 3 PNG
                </button>
                <button
                  type="button"
                  className="books-button books-button--success"
                  disabled={exporting || uploadingExport}
                  onClick={() => {
                    void uploadPng(["ru", "en", "he"]);
                  }}
                >
                  Загрузить 3 PNG
                </button>
              </div>
            </div>
            {Object.keys(recipe.exported_image_urls).length > 0 ? (
              <div className="recipe-export-links">
                {(["ru", "en", "he"] as const).map((language) => (
                  recipe.exported_image_urls[language] ? (
                    <a key={language} href={recipe.exported_image_urls[language]} target="_blank" rel="noreferrer">
                      {language.toUpperCase()} export
                    </a>
                  ) : null
                ))}
              </div>
            ) : null}
            <div className="recipe-studio-shell">
              <div className="recipe-studio-canvas-wrap">
                <div
                  ref={canvasRef}
                  className="recipe-studio-canvas"
                  style={{
                    background: `linear-gradient(155deg, ${recipe.gradient_from || "#fff4cf"}, ${recipe.gradient_to || "#b9efe4"})`,
                  }}
                >
                  {layout.elements.filter((element) => element.visible).map((element) => {
                    const value = valueForElement(recipe, element, studioLanguage);
                    const isSelected = selectedId === element.id;
                    return (
                      <div
                        key={element.id}
                        className={`recipe-studio-element ${isSelected ? "recipe-studio-element--selected" : ""} recipe-studio-element--${element.kind}`}
                        style={{
                          left: `${element.x}%`,
                          top: `${element.y}%`,
                          width: `${element.width}%`,
                          minHeight: element.height ? `${element.height}%` : undefined,
                          fontSize: `${element.fontSize}px`,
                          textAlign: element.align,
                          transform: `rotate(${element.rotation}deg)`,
                        }}
                        onPointerDown={(event) => startDrag(event, element)}
                        onPointerMove={moveDrag}
                        onPointerUp={endDrag}
                        onPointerCancel={endDrag}
                      >
                        {element.kind === "image" ? (
                          typeof value === "string" && value ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={value} alt="" />
                          ) : (
                            <span>dish image</span>
                          )
                        ) : Array.isArray(value) ? (
                          <ul>
                            {value.map((item, index) => (
                              <li key={`${element.id}-${index}`}>{item}</li>
                            ))}
                          </ul>
                        ) : (
                          <span>{value}</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              <aside className="recipe-studio-sidebar">
                <h2 className="books-panel__title">Элементы</h2>
                <div className="recipe-studio-elements">
                  {layout.elements.map((element) => (
                    <button
                      type="button"
                      key={element.id}
                      className={selectedId === element.id ? "recipe-studio-list-button recipe-studio-list-button--active" : "recipe-studio-list-button"}
                      onClick={() => setSelectedId(element.id)}
                    >
                      <span>{element.label}</span>
                      <small>{element.visible ? "visible" : "hidden"}</small>
                    </button>
                  ))}
                </div>

                {selectedElement ? (
                  <div className="recipe-studio-controls">
                    <label className="books-checkbox books-checkbox--inline">
                      <input
                        type="checkbox"
                        checked={selectedElement.visible}
                        onChange={(event) => updateElement(selectedElement.id, { visible: event.target.checked })}
                      />
                      <span>Показывать элемент</span>
                    </label>

                    <div className="books-grid books-grid--2">
                      <label className="books-field">
                        <span className="books-field__label">X</span>
                        <input className="books-input" type="number" value={Math.round(selectedElement.x)} onChange={(event) => updateElement(selectedElement.id, { x: Number(event.target.value) })} />
                      </label>
                      <label className="books-field">
                        <span className="books-field__label">Y</span>
                        <input className="books-input" type="number" value={Math.round(selectedElement.y)} onChange={(event) => updateElement(selectedElement.id, { y: Number(event.target.value) })} />
                      </label>
                      <label className="books-field">
                        <span className="books-field__label">Ширина</span>
                        <input className="books-input" type="number" value={Math.round(selectedElement.width)} onChange={(event) => updateElement(selectedElement.id, { width: Number(event.target.value) })} />
                      </label>
                      <label className="books-field">
                        <span className="books-field__label">Шрифт</span>
                        <input className="books-input" type="number" value={Math.round(selectedElement.fontSize)} onChange={(event) => updateElement(selectedElement.id, { fontSize: Number(event.target.value) })} />
                      </label>
                      <label className="books-field">
                        <span className="books-field__label">Поворот</span>
                        <input className="books-input" type="number" value={Math.round(selectedElement.rotation)} onChange={(event) => updateElement(selectedElement.id, { rotation: Number(event.target.value) })} />
                      </label>
                      <label className="books-field">
                        <span className="books-field__label">Выравнивание</span>
                        <select
                          className="books-input"
                          value={selectedElement.align}
                          onChange={(event) => updateElement(selectedElement.id, { align: event.target.value as RecipeLayoutElement["align"] })}
                        >
                          <option value="left">left</option>
                          <option value="center">center</option>
                          <option value="right">right</option>
                        </select>
                      </label>
                    </div>
                  </div>
                ) : null}
              </aside>
            </div>
          </section>

          <section className="books-panel">
            <div className="books-section-head">
              <div>
                <h2 className="books-panel__title">JSON рецепта</h2>
                <p className="books-section-help">
                  Можно быстро поправить текстовые поля. `layout_json` лучше менять через студию выше.
                </p>
              </div>
              <button
                type="button"
                className="books-button books-button--secondary"
                disabled={saving}
                onClick={() => {
                  void saveFromJson();
                }}
              >
                Сохранить JSON
              </button>
            </div>
            <textarea
              className="books-input books-input--textarea books-input--json recipe-json-editor"
              value={jsonValue}
              onChange={(event) => setJsonValue(event.target.value)}
            />
          </section>
        </>
      ) : null}
    </div>
  );
}
