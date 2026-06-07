"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/router";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { AdminLogout } from "../../components/AdminLogout";
import { AdminTabs } from "../../components/AdminTabs";

type CropRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type CropSelectionMode = "rect" | "lasso";

type CropPoint = {
  x: number;
  y: number;
};

type CropInteraction = {
  action: "move" | "resize";
  startClientX: number;
  startClientY: number;
  startRect: CropRect;
};

type StickerAssetRecord = {
  id: string;
  title: string;
  tags: string[];
  storage_path: string;
  public_url: string;
  set_key: string | null;
  updated_at: string | null;
};

type AnimatedStickerRecord = {
  id: string;
  title: string;
  tags: string[];
  animation_url: string;
  preview_url: string | null;
  storage_path: string | null;
  preview_storage_path: string | null;
  format: string | null;
  updated_at: string | null;
};

type MediaLibraryObject = {
  key: string;
  size: number;
  lastModified: string | null;
  publicUrl: string;
};

type MediaLibraryResponse = {
  prefix: string;
  folders: string[];
  objects: MediaLibraryObject[];
  nextContinuationToken: string | null;
};

type MediaTreeNode = {
  prefix: string;
  label: string;
  children: MediaTreeNode[];
};

const STICKER_TAGS = [
  { label: "sticker", value: "sticker" },
  { label: "food", value: "food" },
  { label: "decor", value: "decor" },
  { label: "label", value: "label" },
  { label: "star", value: "star" },
  { label: "ribbon", value: "ribbon" },
];

const ROOT_MEDIA_FOLDERS = ["bedtime_story/", "recipes/", "stickers/"];
const KNOWN_MEDIA_FOLDERS_BY_PREFIX: Record<string, string[]> = {
  "recipes/": ["recipes/assets/", "recipes/exports/", "recipes/recipes-pics/"],
  "stickers/": ["stickers/capybara-stickers/", "stickers/raccoon-stickers/"],
};

async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, options);
  const data = (await response.json()) as T & { error?: string };
  if (!response.ok) {
    throw new Error(data.error ?? "Request failed.");
  }
  return data;
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

function publicR2Url(path: string) {
  const base = (process.env.NEXT_PUBLIC_R2_PUBLIC_URL || "https://media.laplapla.com").replace(/\/+$/, "");
  return `${base}/${path.split("/").map((segment) => encodeURIComponent(segment)).join("/")}`;
}

function withCacheBuster(url: string, key: string | number | null | undefined) {
  if (!key) {
    return url;
  }
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}v=${encodeURIComponent(String(key))}`;
}

function mediaLabelFromKey(key: string) {
  const fileName = key.split("/").filter(Boolean).pop() ?? key;
  return fileName.replace(/\.[a-z0-9]+$/i, "");
}

function tagsToText(tags: string[] | null | undefined) {
  return (tags ?? []).join(", ");
}

function isWebpPath(path: string | null | undefined) {
  return /\.webp$/i.test(path ?? "");
}

function mediaFoldersForPrefix(prefix: string, folders: string[]) {
  const requiredFolders = prefix ? KNOWN_MEDIA_FOLDERS_BY_PREFIX[prefix] ?? [] : ROOT_MEDIA_FOLDERS;
  return Array.from(new Set([...requiredFolders, ...folders]))
    .filter((folder) => folder !== prefix)
    .sort((left, right) => left.localeCompare(right));
}

function mediaBreadcrumbs(prefix: string) {
  const parts = prefix.split("/").filter(Boolean);
  return parts.map((part, index) => ({
    label: part,
    prefix: `${parts.slice(0, index + 1).join("/")}/`,
  }));
}

function fallbackMediaTree(): MediaTreeNode {
  return {
    prefix: "",
    label: "laplapla-public-media",
    children: ROOT_MEDIA_FOLDERS.map((rootFolder) => ({
      prefix: rootFolder,
      label: rootFolder.replace(/\/$/, ""),
      children: (KNOWN_MEDIA_FOLDERS_BY_PREFIX[rootFolder] ?? []).map((childFolder) => ({
        prefix: childFolder,
        label: childFolder.split("/").filter(Boolean).pop() ?? childFolder,
        children: [],
      })),
    })),
  };
}

function parentPrefix(prefix: string) {
  const parts = prefix.split("/").filter(Boolean);
  return parts.slice(0, -1).join("/") + (parts.length > 1 ? "/" : "");
}

const emptyAnimatedForm = {
  title: "",
  animationUrl: "",
  previewUrl: "",
  storagePath: "",
  previewStoragePath: "",
  format: "",
  tags: "",
};

export default function AdminMediaPage() {
  const router = useRouter();
  const supabase = createClientComponentClient();
  const cropStageRef = useRef<HTMLDivElement | null>(null);
  const cropBoxRef = useRef<HTMLDivElement | null>(null);
  const cropInteractionRef = useRef<CropInteraction | null>(null);

  const [sessionChecked, setSessionChecked] = useState(false);
  const [setName, setSetName] = useState("");
  const [setKey, setSetKey] = useState("");
  const [sourceVersion, setSourceVersion] = useState<number | null>(null);
  const [uploading, setUploading] = useState(false);
  const [savingCrop, setSavingCrop] = useState(false);
  const [syncingAssets, setSyncingAssets] = useState(false);
  const [renamingFolder, setRenamingFolder] = useState(false);
  const [cropSelectionMode, setCropSelectionMode] = useState<CropSelectionMode>("rect");
  const [cropRect, setCropRect] = useState<CropRect>({ x: 12, y: 12, width: 28, height: 28 });
  const [cropNaturalSize, setCropNaturalSize] = useState({ width: 0, height: 0 });
  const [cropLassoPoints, setCropLassoPoints] = useState<CropPoint[]>([]);
  const [cropLassoDrawing, setCropLassoDrawing] = useState(false);
  const [cropIndex, setCropIndex] = useState(1);
  const [stickerName, setStickerName] = useState("");
  const [stickerTag, setStickerTag] = useState("sticker");
  const [searchTags, setSearchTags] = useState("");
  const [savedCropUrls, setSavedCropUrls] = useState<Array<{ label: string; url: string }>>([]);
  const [assetSearch, setAssetSearch] = useState("");
  const [stickerAssets, setStickerAssets] = useState<StickerAssetRecord[]>([]);
  const [assetDrafts, setAssetDrafts] = useState<Record<string, { title: string; tags: string }>>({});
  const [loadingAssets, setLoadingAssets] = useState(false);
  const [assetActionId, setAssetActionId] = useState<string | null>(null);
  const [animatedSearch, setAnimatedSearch] = useState("");
  const [animatedStickers, setAnimatedStickers] = useState<AnimatedStickerRecord[]>([]);
  const [animatedDrafts, setAnimatedDrafts] = useState<Record<string, typeof emptyAnimatedForm>>({});
  const [animatedForm, setAnimatedForm] = useState(emptyAnimatedForm);
  const [loadingAnimated, setLoadingAnimated] = useState(false);
  const [animatedActionId, setAnimatedActionId] = useState<string | null>(null);
  const [creatingAnimated, setCreatingAnimated] = useState(false);
  const [mediaPrefix, setMediaPrefix] = useState("");
  const [mediaLibrary, setMediaLibrary] = useState<MediaLibraryResponse | null>(null);
  const [mediaTree, setMediaTree] = useState<MediaTreeNode>(fallbackMediaTree);
  const [mediaLoading, setMediaLoading] = useState(false);
  const [mediaTreeLoading, setMediaTreeLoading] = useState(false);
  const [mediaActionLoading, setMediaActionLoading] = useState(false);
  const [mediaRefreshKey, setMediaRefreshKey] = useState(0);
  const [newFolderName, setNewFolderName] = useState("");
  const [selectedFolderPrefix, setSelectedFolderPrefix] = useState("");
  const [selectedFileKeys, setSelectedFileKeys] = useState<string[]>([]);
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

  const activeSetKey = setName.trim() || setKey;
  const sourceUrl = useMemo(
    () => activeSetKey ? withCacheBuster(publicR2Url(`stickers/${activeSetKey}/source.webp`), sourceVersion) : "",
    [activeSetKey, sourceVersion],
  );
  const mediaFolders = useMemo(
    () => mediaFoldersForPrefix(mediaPrefix, mediaLibrary?.folders ?? []),
    [mediaLibrary?.folders, mediaPrefix],
  );
  const mediaCrumbs = useMemo(() => mediaBreadcrumbs(mediaPrefix), [mediaPrefix]);
  const visibleFileKeys = useMemo(() => mediaLibrary?.objects.map((object) => object.key) ?? [], [mediaLibrary?.objects]);
  const allVisibleFilesSelected = visibleFileKeys.length > 0 && visibleFileKeys.every((key) => selectedFileKeys.includes(key));

  const loadStickerAssets = async (query = assetSearch) => {
    setLoadingAssets(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (query.trim()) params.set("q", query.trim());
      params.set("limit", "120");
      const response = await fetchJson<{ stickers: StickerAssetRecord[] }>(`/api/admin/media/sticker-assets?${params.toString()}`);
      setStickerAssets(response.stickers);
      setAssetDrafts((current) => {
        const next = { ...current };
        for (const sticker of response.stickers) {
          next[sticker.id] = next[sticker.id] ?? {
            title: sticker.title,
            tags: tagsToText(sticker.tags),
          };
        }
        return next;
      });
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : String(loadError));
    } finally {
      setLoadingAssets(false);
    }
  };

  const loadAnimatedStickers = async (query = animatedSearch) => {
    setLoadingAnimated(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (query.trim()) params.set("q", query.trim());
      params.set("limit", "120");
      const response = await fetchJson<{ stickers: AnimatedStickerRecord[] }>(`/api/admin/media/animated-stickers?${params.toString()}`);
      setAnimatedStickers(response.stickers);
      setAnimatedDrafts((current) => {
        const next = { ...current };
        for (const sticker of response.stickers) {
          next[sticker.id] = next[sticker.id] ?? {
            title: sticker.title,
            animationUrl: sticker.animation_url,
            previewUrl: sticker.preview_url ?? "",
            storagePath: sticker.storage_path ?? "",
            previewStoragePath: sticker.preview_storage_path ?? "",
            format: sticker.format ?? "",
            tags: tagsToText(sticker.tags),
          };
        }
        return next;
      });
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : String(loadError));
    } finally {
      setLoadingAnimated(false);
    }
  };

  const refreshMediaLibrary = () => {
    setMediaRefreshKey((current) => current + 1);
  };

  const createMediaFolder = async () => {
    const name = newFolderName.trim();
    if (!name) {
      setError("Укажите имя новой папки.");
      return;
    }

    setMediaActionLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const response = await fetchJson<{ prefix: string }>("/api/admin/media/folders/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          parentPrefix: mediaPrefix,
          name,
        }),
      });
      setNewFolderName("");
      setMediaPrefix(response.prefix);
      refreshMediaLibrary();
      setSuccess(`Папка создана: ${response.prefix}`);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : String(createError));
    } finally {
      setMediaActionLoading(false);
    }
  };

  const moveMediaFolder = async (sourcePrefix: string, targetParentPrefix: string) => {
    if (!sourcePrefix) {
      setError("Выберите папку для переноса.");
      return;
    }
    if (targetParentPrefix.startsWith(sourcePrefix)) {
      setError("Нельзя перенести папку внутрь самой себя.");
      return;
    }

    setMediaActionLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const response = await fetchJson<{ targetPrefix: string; moved: number }>("/api/admin/media/folders/move", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourcePrefix,
          targetParentPrefix,
        }),
      });
      setSelectedFolderPrefix("");
      setMediaPrefix(response.targetPrefix);
      refreshMediaLibrary();
      void loadStickerAssets();
      void loadAnimatedStickers();
      setSuccess(`Папка перенесена: ${response.targetPrefix}. Объектов: ${response.moved}.`);
    } catch (moveError) {
      setError(moveError instanceof Error ? moveError.message : String(moveError));
    } finally {
      setMediaActionLoading(false);
    }
  };

  const toggleSelectedFile = (key: string) => {
    setSelectedFileKeys((current) =>
      current.includes(key)
        ? current.filter((item) => item !== key)
        : [...current, key],
    );
  };

  const toggleVisibleFiles = () => {
    setSelectedFileKeys((current) => {
      if (allVisibleFilesSelected) {
        return current.filter((key) => !visibleFileKeys.includes(key));
      }
      return Array.from(new Set([...current, ...visibleFileKeys]));
    });
  };

  const moveSelectedFiles = async () => {
    if (selectedFileKeys.length === 0) {
      setError("Выберите файлы для переноса.");
      return;
    }

    setMediaActionLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const response = await fetchJson<{ moved: number; skipped: number }>("/api/admin/media/files/move", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          keys: selectedFileKeys,
          targetPrefix: mediaPrefix,
        }),
      });
      setSelectedFileKeys([]);
      refreshMediaLibrary();
      void loadStickerAssets();
      void loadAnimatedStickers();
      setSuccess(`Файлы перенесены в ${mediaPrefix || "laplapla-public-media/"}: ${response.moved}. Пропущено: ${response.skipped}.`);
    } catch (moveError) {
      setError(moveError instanceof Error ? moveError.message : String(moveError));
    } finally {
      setMediaActionLoading(false);
    }
  };

  useEffect(() => {
    if (!sessionChecked) {
      return;
    }
    void loadStickerAssets("");
    void loadAnimatedStickers("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionChecked]);

  useEffect(() => {
    if (!sessionChecked) {
      return;
    }

    setMediaLoading(true);
    setError(null);
    fetchJson<MediaLibraryResponse>(`/api/admin/recipes/media-library?prefix=${encodeURIComponent(mediaPrefix)}`)
      .then((response) => setMediaLibrary(response))
      .catch((loadError) => setError(loadError instanceof Error ? loadError.message : String(loadError)))
      .finally(() => setMediaLoading(false));
  }, [mediaPrefix, mediaRefreshKey, sessionChecked]);

  useEffect(() => {
    if (!sessionChecked) {
      return;
    }

    setMediaTreeLoading(true);
    fetchJson<{ tree: MediaTreeNode }>("/api/admin/recipes/media-tree?depth=8")
      .then((response) => setMediaTree(response.tree))
      .catch((loadError) => setError(loadError instanceof Error ? loadError.message : String(loadError)))
      .finally(() => setMediaTreeLoading(false));
  }, [mediaRefreshKey, sessionChecked]);

  const startCropInteraction = (
    event: React.PointerEvent<HTMLElement>,
    action: CropInteraction["action"],
  ) => {
    event.preventDefault();
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

  const cropPointerToNaturalPoint = (event: React.PointerEvent<HTMLElement>): CropPoint | null => {
    const stageImage = cropStageRef.current?.querySelector("img");
    const imageRect = stageImage?.getBoundingClientRect();
    if (!cropNaturalSize.width || !cropNaturalSize.height || !imageRect) {
      return null;
    }

    return {
      x: Math.max(0, Math.min(cropNaturalSize.width, Math.round(((event.clientX - imageRect.left) / imageRect.width) * cropNaturalSize.width))),
      y: Math.max(0, Math.min(cropNaturalSize.height, Math.round(((event.clientY - imageRect.top) / imageRect.height) * cropNaturalSize.height))),
    };
  };

  const cropLassoContinuationThreshold = () => {
    const stageImage = cropStageRef.current?.querySelector("img");
    const imageRect = stageImage?.getBoundingClientRect();
    if (!cropNaturalSize.width || !imageRect?.width) {
      return 24;
    }
    return Math.max(12, (24 / imageRect.width) * cropNaturalSize.width);
  };

  const startCropLasso = (event: React.PointerEvent<HTMLDivElement>) => {
    if (cropSelectionMode !== "lasso") {
      return;
    }
    event.preventDefault();
    const point = cropPointerToNaturalPoint(event);
    if (!point) {
      return;
    }
    event.currentTarget.setPointerCapture(event.pointerId);
    setCropLassoDrawing(true);
    setCropLassoPoints((current) => {
      if (current.length < 2) {
        return [point];
      }

      const threshold = cropLassoContinuationThreshold();
      const first = current[0];
      const last = current.at(-1);
      if (last && Math.hypot(last.x - point.x, last.y - point.y) <= threshold) {
        return current;
      }
      if (first && Math.hypot(first.x - point.x, first.y - point.y) <= threshold) {
        return [...current].reverse();
      }
      return [point];
    });
  };

  const moveCropLasso = (event: React.PointerEvent<HTMLDivElement>) => {
    if (cropSelectionMode !== "lasso" || !cropLassoDrawing) {
      return;
    }
    event.preventDefault();
    const point = cropPointerToNaturalPoint(event);
    if (!point) {
      return;
    }
    setCropLassoPoints((current) => {
      const previous = current.at(-1);
      if (previous && Math.hypot(previous.x - point.x, previous.y - point.y) < 8) {
        return current;
      }
      return [...current, point].slice(-600);
    });
  };

  const endCropLasso = () => {
    setCropLassoDrawing(false);
  };

  const cropLassoBounds = () => {
    if (cropLassoPoints.length < 3) {
      return null;
    }
    const xs = cropLassoPoints.map((point) => point.x);
    const ys = cropLassoPoints.map((point) => point.y);
    const left = Math.max(0, Math.min(...xs));
    const top = Math.max(0, Math.min(...ys));
    const right = Math.min(cropNaturalSize.width, Math.max(...xs));
    const bottom = Math.min(cropNaturalSize.height, Math.max(...ys));
    return {
      x: Math.round(left),
      y: Math.round(top),
      width: Math.max(1, Math.round(right - left)),
      height: Math.max(1, Math.round(bottom - top)),
    };
  };

  const uploadStickerSheet = async (file: File | null) => {
    if (!file) {
      return;
    }

    if (!file.type.startsWith("image/")) {
      setError("Можно загружать только изображения.");
      return;
    }

    setUploading(true);
    setError(null);
    setSuccess(null);
    try {
      const imageBase64 = await blobToDataUrl(file);
      const response = await fetchJson<{ setKey: string; publicUrl: string }>("/api/admin/media/sticker-sheet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageBase64,
          fileName: file.name,
          setName,
          removeWhite: true,
        }),
      });

      if (!response.setKey?.trim()) {
        throw new Error("Source sheet загрузился без имени набора. Укажите латинский set key и повторите загрузку.");
      }
      setSetKey(response.setKey);
      setSetName(response.setKey);
      setSourceVersion(Date.now());
      setSuccess(`Source sheet загружен: ${response.publicUrl}`);
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : String(uploadError));
    } finally {
      setUploading(false);
    }
  };

  const syncStickerAssets = async () => {
    setSyncingAssets(true);
    setError(null);
    setSuccess(null);
    try {
      const response = await fetchJson<{ deleted: number; inserted: number; scannedR2Objects: number }>("/api/admin/media/sync-sticker-assets", {
        method: "POST",
      });
      await loadStickerAssets();
      setSuccess(`Синхронизация завершена: добавлено ${response.inserted}, удалено ${response.deleted}, объектов R2 проверено ${response.scannedR2Objects}.`);
    } catch (syncError) {
      setError(syncError instanceof Error ? syncError.message : String(syncError));
    } finally {
      setSyncingAssets(false);
    }
  };

  const renameStickerFolder = async () => {
    const oldSetKey = setKey.trim();
    const newSetKey = setName.trim();
    if (!oldSetKey || !newSetKey || oldSetKey === newSetKey) {
      return;
    }

    setRenamingFolder(true);
    setError(null);
    setSuccess(null);
    try {
      const response = await fetchJson<{ newSetKey: string; moved: number }>("/api/admin/media/sticker-folder/rename", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          oldSetKey,
          newSetKey,
          basePrefix: "stickers",
        }),
      });
      setSetKey(response.newSetKey);
      setSetName(response.newSetKey);
      setSourceVersion(Date.now());
      await loadStickerAssets();
      setSuccess(`Папка переименована: ${response.newSetKey}. Перенесено файлов: ${response.moved}.`);
    } catch (renameError) {
      setError(renameError instanceof Error ? renameError.message : String(renameError));
    } finally {
      setRenamingFolder(false);
    }
  };

  const updateStickerAsset = async (sticker: StickerAssetRecord) => {
    const draft = assetDrafts[sticker.id];
    if (!draft) {
      return;
    }

    setAssetActionId(sticker.id);
    setError(null);
    setSuccess(null);
    try {
      await fetchJson<{ sticker: StickerAssetRecord }>(`/api/admin/media/sticker-assets/${sticker.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      await loadStickerAssets();
      setSuccess("Стикер обновлен.");
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : String(updateError));
    } finally {
      setAssetActionId(null);
    }
  };

  const deleteStickerAsset = async (sticker: StickerAssetRecord) => {
    if (!window.confirm(`Удалить стикер ${sticker.title}? Файл в R2 тоже будет удален.`)) {
      return;
    }

    setAssetActionId(sticker.id);
    setError(null);
    setSuccess(null);
    try {
      await fetchJson<{ ok: true }>(`/api/admin/media/sticker-assets/${sticker.id}`, {
        method: "DELETE",
      });
      await loadStickerAssets();
      setSuccess("Стикер удален из R2 и базы.");
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : String(deleteError));
    } finally {
      setAssetActionId(null);
    }
  };

  const convertStickerAssetToWebp = async (sticker: StickerAssetRecord) => {
    setAssetActionId(sticker.id);
    setError(null);
    setSuccess(null);
    try {
      const response = await fetchJson<{ converted: boolean }>(`/api/admin/media/sticker-assets/${sticker.id}/convert-webp`, {
        method: "POST",
      });
      await loadStickerAssets();
      setSuccess(response.converted ? "Стикер пересохранен в WebP." : "Стикер уже был в WebP.");
    } catch (convertError) {
      setError(convertError instanceof Error ? convertError.message : String(convertError));
    } finally {
      setAssetActionId(null);
    }
  };

  const createAnimatedSticker = async () => {
    setCreatingAnimated(true);
    setError(null);
    setSuccess(null);
    try {
      await fetchJson<{ sticker: AnimatedStickerRecord }>("/api/admin/media/animated-stickers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(animatedForm),
      });
      setAnimatedForm(emptyAnimatedForm);
      await loadAnimatedStickers();
      setSuccess("Анимированный стикер добавлен.");
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : String(createError));
    } finally {
      setCreatingAnimated(false);
    }
  };

  const updateAnimatedSticker = async (sticker: AnimatedStickerRecord) => {
    const draft = animatedDrafts[sticker.id];
    if (!draft) {
      return;
    }

    setAnimatedActionId(sticker.id);
    setError(null);
    setSuccess(null);
    try {
      await fetchJson<{ sticker: AnimatedStickerRecord }>(`/api/admin/media/animated-stickers/${sticker.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      await loadAnimatedStickers();
      setSuccess("Анимированный стикер обновлен.");
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : String(updateError));
    } finally {
      setAnimatedActionId(null);
    }
  };

  const deleteAnimatedSticker = async (sticker: AnimatedStickerRecord) => {
    if (!window.confirm(`Удалить запись ${sticker.title}? Файл в R2 не будет удален.`)) {
      return;
    }

    setAnimatedActionId(sticker.id);
    setError(null);
    setSuccess(null);
    try {
      await fetchJson<{ ok: true }>(`/api/admin/media/animated-stickers/${sticker.id}`, {
        method: "DELETE",
      });
      await loadAnimatedStickers();
      setSuccess("Запись анимированного стикера удалена.");
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : String(deleteError));
    } finally {
      setAnimatedActionId(null);
    }
  };

  const saveCropDetail = async () => {
    const cleanSetKey = activeSetKey.trim();
    if (!cleanSetKey) {
      setError("Сначала укажите или загрузите набор стикеров.");
      return;
    }

    const stageImage = cropStageRef.current?.querySelector("img");
    const imageRect = stageImage?.getBoundingClientRect();
    const boxRect = cropBoxRef.current?.getBoundingClientRect();
    const lassoCrop = cropSelectionMode === "lasso" ? cropLassoBounds() : null;
    if (!cropNaturalSize.width || !cropNaturalSize.height || !imageRect || (!lassoCrop && !boxRect)) {
      setError("Source image еще не загрузился.");
      return;
    }
    if (cropSelectionMode === "lasso" && !lassoCrop) {
      setError("Нарисуйте замкнутый контур лассо вокруг детали.");
      return;
    }

    setSavingCrop(true);
    setError(null);
    setSuccess(null);
    try {
      const crop = lassoCrop ?? {
        x: Math.round((((boxRect as DOMRect).left - imageRect.left) / imageRect.width) * cropNaturalSize.width),
        y: Math.round((((boxRect as DOMRect).top - imageRect.top) / imageRect.height) * cropNaturalSize.height),
        width: Math.round(((boxRect as DOMRect).width / imageRect.width) * cropNaturalSize.width),
        height: Math.round(((boxRect as DOMRect).height / imageRect.height) * cropNaturalSize.height),
      };
      const response = await fetchJson<{ publicUrl: string; path: string; index: number }>("/api/admin/media/sticker-crop", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          setKey: cleanSetKey,
          index: cropIndex,
          assetName: stickerName,
          assetTag: stickerTag,
          searchTags,
          crop,
          mask: cropSelectionMode === "lasso" ? { points: cropLassoPoints } : undefined,
        }),
      });

      const label = mediaLabelFromKey(response.path);
      setSavedCropUrls((current) => [
        { label, url: withCacheBuster(response.publicUrl, Date.now()) },
        ...current,
      ]);
      setCropIndex((current) => current + 1);
      setSuccess(`Стикер сохранен: ${response.publicUrl}`);
    } catch (cropError) {
      setError(cropError instanceof Error ? cropError.message : String(cropError));
    } finally {
      setSavingCrop(false);
    }
  };

  const renderMediaTreeNode = (node: MediaTreeNode, depth = 0) => (
    <div key={node.prefix || "root"} className="recipe-media-tree-node">
      <button
        type="button"
        className={mediaPrefix === node.prefix ? "recipe-media-tree-button recipe-media-tree-button--active" : "recipe-media-tree-button"}
        style={{ paddingLeft: `${10 + depth * 14}px` }}
        onClick={() => setMediaPrefix(node.prefix)}
        onDragOver={(event) => {
          if (event.dataTransfer.types.includes("application/x-laplapla-folder-prefix")) {
            event.preventDefault();
          }
        }}
        onDrop={(event) => {
          const sourcePrefix = event.dataTransfer.getData("application/x-laplapla-folder-prefix");
          if (sourcePrefix) {
            event.preventDefault();
            void moveMediaFolder(sourcePrefix, node.prefix);
          }
        }}
      >
        <span>{node.children.length > 0 ? "v" : "-"}</span>
        <strong>{node.label}</strong>
      </button>
      {node.children.length > 0 ? (
        <div className="recipe-media-tree-children">
          {node.children.map((child) => renderMediaTreeNode(child, depth + 1))}
        </div>
      ) : null}
    </div>
  );

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
          <h1 className="books-admin-title">Медиа</h1>
          <p className="books-admin-subtitle">Нарезка стикеров из R2 source sheets и сохранение поисковых тегов.</p>
        </div>
        <button
          type="button"
          className="books-button books-button--secondary"
          disabled={syncingAssets}
          onClick={() => {
            void syncStickerAssets();
          }}
        >
          {syncingAssets ? "Синхронизация..." : "Синхронизировать с R2"}
        </button>
      </header>

      {error ? <div className="books-alert books-alert--error">{error}</div> : null}
      {success ? <div className="books-alert books-alert--success">{success}</div> : null}

      <section className="books-panel recipe-media-panel">
        <div className="books-section-head">
          <div>
            <h2 className="books-panel__title">R2 папки</h2>
            <p className="books-section-help">Просмотр, создание и перенос папок в laplapla-public-media.</p>
          </div>
          <button
            type="button"
            className="books-button books-button--secondary"
            disabled={mediaActionLoading || mediaLoading || mediaTreeLoading}
            onClick={refreshMediaLibrary}
          >
            Обновить R2
          </button>
        </div>

        <div className="recipe-media-library">
          <div className="recipe-media-library__head">
            <div>
              <strong>{mediaPrefix || "laplapla-public-media/"}</strong>
              <span>{mediaTreeLoading ? "Дерево обновляется..." : "Перетащите папку на папку назначения или выберите папку и перенесите в текущую."}</span>
            </div>
          </div>

          <div className="recipe-media-library__crumbs">
            <button
              type="button"
              className={!mediaPrefix ? "recipe-crumb-button recipe-crumb-button--active" : "recipe-crumb-button"}
              onClick={() => setMediaPrefix("")}
            >
              Корень
            </button>
            {mediaCrumbs.map((crumb) => (
              <button
                type="button"
                key={crumb.prefix}
                className={mediaPrefix === crumb.prefix ? "recipe-crumb-button recipe-crumb-button--active" : "recipe-crumb-button"}
                onClick={() => setMediaPrefix(crumb.prefix)}
              >
                {crumb.label}
              </button>
            ))}
          </div>

          <div className="media-folder-actions">
            <label className="books-field">
              <span className="books-field__label">Новая папка в текущей папке</span>
              <input
                className="books-input"
                value={newFolderName}
                onChange={(event) => setNewFolderName(event.target.value)}
                placeholder="stickers-2026"
              />
            </label>
            <button
              type="button"
              className="books-button books-button--success"
              disabled={mediaActionLoading || !newFolderName.trim()}
              onClick={() => {
                void createMediaFolder();
              }}
            >
              {mediaActionLoading ? "Операция..." : "Создать папку"}
            </button>
            {selectedFolderPrefix ? (
              <div className="media-folder-selection">
                <span>Выбрана: {selectedFolderPrefix}</span>
                <button
                  type="button"
                  className="books-button books-button--secondary"
                  disabled={mediaActionLoading || mediaPrefix.startsWith(selectedFolderPrefix)}
                  onClick={() => {
                    void moveMediaFolder(selectedFolderPrefix, mediaPrefix);
                  }}
                >
                  Перенести сюда
                </button>
                <button
                  type="button"
                  className="books-button books-button--ghost"
                  onClick={() => setSelectedFolderPrefix("")}
                >
                  Снять выбор
                </button>
              </div>
            ) : null}
            {selectedFileKeys.length > 0 ? (
              <div className="media-folder-selection">
                <span>Файлы выбраны: {selectedFileKeys.length}</span>
                <button
                  type="button"
                  className="books-button books-button--secondary"
                  disabled={mediaActionLoading}
                  onClick={() => {
                    void moveSelectedFiles();
                  }}
                >
                  Перенести выбранные сюда
                </button>
                <button
                  type="button"
                  className="books-button books-button--ghost"
                  onClick={() => setSelectedFileKeys([])}
                >
                  Снять выбор
                </button>
              </div>
            ) : null}
          </div>

          <div className="recipe-media-browser">
            <aside className="recipe-media-tree">
              <div className="recipe-media-tree__title">
                <span>Все папки</span>
                {mediaTreeLoading ? <small>загрузка...</small> : null}
              </div>
              {renderMediaTreeNode(mediaTree)}
            </aside>

            <div
              className="recipe-media-window"
              onDragOver={(event) => {
                if (event.dataTransfer.types.includes("application/x-laplapla-folder-prefix")) {
                  event.preventDefault();
                }
              }}
              onDrop={(event) => {
                const sourcePrefix = event.dataTransfer.getData("application/x-laplapla-folder-prefix");
                if (sourcePrefix) {
                  event.preventDefault();
                  void moveMediaFolder(sourcePrefix, mediaPrefix);
                }
              }}
            >
              <div className="recipe-media-window__bar">
                <strong>{mediaPrefix || "laplapla-public-media/"}</strong>
                <div className="books-actions">
                  {visibleFileKeys.length > 0 ? (
                    <button
                      type="button"
                      className="recipe-folder-button"
                      onClick={toggleVisibleFiles}
                    >
                      {allVisibleFilesSelected ? "Снять файлы" : "Выбрать файлы"}
                    </button>
                  ) : null}
                  {mediaPrefix ? (
                    <button
                      type="button"
                      className="recipe-folder-button"
                      onClick={() => setMediaPrefix(parentPrefix(mediaPrefix))}
                    >
                      На уровень выше
                    </button>
                  ) : null}
                </div>
              </div>

              {mediaLoading ? <div className="books-section-help">Загрузка R2...</div> : null}

              <div className="recipe-media-library__folders">
                {mediaFolders.map((folder) => {
                  const folderLabel = folder.slice(mediaPrefix.length).replace(/\/$/, "");
                  const selected = selectedFolderPrefix === folder;
                  return (
                    <button
                      type="button"
                      key={folder}
                      className={selected ? "recipe-folder-tile media-folder-tile--selected" : "recipe-folder-tile"}
                      draggable
                      onDragStart={(event) => {
                        event.dataTransfer.setData("application/x-laplapla-folder-prefix", folder);
                        event.dataTransfer.effectAllowed = "move";
                      }}
                      onClick={() => setSelectedFolderPrefix(folder)}
                      onDoubleClick={() => setMediaPrefix(folder)}
                    >
                      <span>folder</span>
                      <strong>{folderLabel}</strong>
                      <small>{folder}</small>
                    </button>
                  );
                })}
              </div>

              <div className="recipe-media-library__assets">
                {mediaLibrary?.objects.map((object) => {
                  const selected = selectedFileKeys.includes(object.key);
                  return (
                    <article key={object.key} className={selected ? "media-file-tile media-file-tile--selected" : "media-file-tile"}>
                      <label className="media-file-check">
                        <input
                          type="checkbox"
                          checked={selected}
                          onChange={() => toggleSelectedFile(object.key)}
                        />
                        <span>выбрать</span>
                      </label>
                      <a
                        href={object.publicUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="recipe-asset-thumb"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={object.publicUrl} alt="" />
                        <span>{mediaLabelFromKey(object.key)}</span>
                      </a>
                    </article>
                  );
                })}
                {!mediaLoading && mediaLibrary?.objects.length === 0 && mediaFolders.length === 0 ? (
                  <div className="recipe-media-empty">В этой папке пока нет изображений или подпапок.</div>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="books-panel recipe-media-panel">
        <div className="books-section-head">
          <div>
            <h2 className="books-panel__title">Source sheet</h2>
            <p className="books-section-help">Загрузите PNG/JPEG/WebP или укажите существующий set key из stickers.</p>
          </div>
        </div>
        <div className="recipe-media-grid">
          <label className="recipe-media-card">
            <span className="recipe-media-card__title">Набор стикеров</span>
            <small>R2: stickers/[set]/source.webp</small>
            <input
              className="books-input"
              value={setName}
              onChange={(event) => setSetName(event.target.value)}
              placeholder="raccoon-kitchen-01"
            />
            {setKey && setName.trim() && setName.trim() !== setKey ? (
              <button
                type="button"
                className="books-button books-button--secondary"
                disabled={renamingFolder}
                onClick={(event) => {
                  event.preventDefault();
                  void renameStickerFolder();
                }}
              >
                {renamingFolder ? "Переименование..." : "Переименовать папку"}
              </button>
            ) : null}
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              disabled={uploading}
              onChange={(event) => {
                void uploadStickerSheet(event.target.files?.[0] ?? null);
                event.currentTarget.value = "";
              }}
            />
          </label>
        </div>
        {uploading ? <div className="books-alert books-alert--success">Обработка source sheet...</div> : null}
      </section>

      <section className="books-panel recipe-crop-panel">
        <div className="books-section-head">
          <div>
            <h2 className="books-panel__title">Нарезка стикеров</h2>
            <p className="books-section-help">Перетащите рамку или обведите деталь лассо, задайте название и поисковые теги, затем сохраните WebP.</p>
          </div>
          <div className="books-actions">
            <button
              type="button"
              className={cropSelectionMode === "rect" ? "books-button books-button--primary" : "books-button books-button--ghost"}
              onClick={() => setCropSelectionMode("rect")}
            >
              Прямоугольник
            </button>
            <button
              type="button"
              className={cropSelectionMode === "lasso" ? "books-button books-button--primary" : "books-button books-button--ghost"}
              onClick={() => setCropSelectionMode("lasso")}
            >
              Лассо
            </button>
          </div>
        </div>

        <div className="recipe-crop-shell">
          <div className="recipe-crop-stage-wrap">
            {sourceUrl ? (
              <div
                ref={cropStageRef}
                className="recipe-crop-stage"
                onPointerMove={(event) => {
                  moveCropInteraction(event);
                  moveCropLasso(event);
                }}
                onPointerDown={startCropLasso}
                onPointerUp={() => {
                  cropInteractionRef.current = null;
                  endCropLasso();
                }}
                onPointerCancel={() => {
                  cropInteractionRef.current = null;
                  endCropLasso();
                }}
                onPointerLeave={endCropLasso}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={sourceUrl}
                  alt=""
                  draggable={false}
                  onDragStart={(event) => event.preventDefault()}
                  onLoad={(event) => {
                    setCropNaturalSize({
                      width: event.currentTarget.naturalWidth,
                      height: event.currentTarget.naturalHeight,
                    });
                  }}
                />
                {cropSelectionMode === "rect" ? (
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
                ) : (
                  <svg
                    className="recipe-crop-lasso"
                    viewBox={`0 0 ${cropNaturalSize.width || 1} ${cropNaturalSize.height || 1}`}
                    preserveAspectRatio="none"
                    aria-hidden="true"
                  >
                    {cropLassoPoints.length > 1 ? (
                      <polyline
                        points={cropLassoPoints.map((point) => `${point.x},${point.y}`).join(" ")}
                        className="recipe-crop-lasso__line"
                      />
                    ) : null}
                    {cropLassoPoints.length > 2 && !cropLassoDrawing ? (
                      <polygon
                        points={cropLassoPoints.map((point) => `${point.x},${point.y}`).join(" ")}
                        className="recipe-crop-lasso__fill"
                      />
                    ) : null}
                    {cropLassoPoints.length > 0 ? (
                      <>
                        <circle
                          cx={cropLassoPoints[0].x}
                          cy={cropLassoPoints[0].y}
                          r={5}
                          className="recipe-crop-lasso__endpoint"
                        />
                        <circle
                          cx={cropLassoPoints.at(-1)?.x}
                          cy={cropLassoPoints.at(-1)?.y}
                          r={5}
                          className="recipe-crop-lasso__endpoint recipe-crop-lasso__endpoint--end"
                        />
                      </>
                    ) : null}
                  </svg>
                )}
              </div>
            ) : (
              <div className="recipe-crop-empty">Загрузите source sheet или укажите имя набора.</div>
            )}
          </div>

          <aside className="recipe-crop-controls">
            <label className="books-field">
              <span className="books-field__label">Режим выделения</span>
              <div className="books-actions">
                <button
                  type="button"
                  className={cropSelectionMode === "rect" ? "books-button books-button--primary" : "books-button books-button--ghost"}
                  onClick={() => setCropSelectionMode("rect")}
                >
                  Прямоугольник
                </button>
                <button
                  type="button"
                  className={cropSelectionMode === "lasso" ? "books-button books-button--primary" : "books-button books-button--ghost"}
                  onClick={() => setCropSelectionMode("lasso")}
                >
                  Лассо
                </button>
              </div>
              {cropSelectionMode === "lasso" ? (
                <span className="books-field__help">Проведите по картинке вокруг детали. Отпустите указатель, чтобы замкнуть контур.</span>
              ) : null}
            </label>
            {cropSelectionMode === "lasso" ? (
              <button
                type="button"
                className="books-button books-button--secondary"
                onClick={() => setCropLassoPoints([])}
              >
                Очистить лассо
              </button>
            ) : null}
            <label className="books-field">
              <span className="books-field__label">Набор</span>
              <input className="books-input" value={activeSetKey} onChange={(event) => setSetName(event.target.value)} />
              {sourceUrl ? (
                <span className="books-field__help">
                  Source: <a href={sourceUrl} target="_blank" rel="noreferrer">{sourceUrl}</a>
                </span>
              ) : null}
            </label>
            <label className="books-field">
              <span className="books-field__label">Порядковый номер</span>
              <input
                className="books-input"
                type="number"
                min={1}
                value={cropIndex}
                onChange={(event) => setCropIndex(Math.max(1, Number(event.target.value) || 1))}
              />
            </label>
            <div className="books-grid books-grid--2">
              <label className="books-field">
                <span className="books-field__label">Тип детали</span>
                <select className="books-input" value={stickerTag} onChange={(event) => setStickerTag(event.target.value)}>
                  {STICKER_TAGS.map((tag) => (
                    <option key={tag.value} value={tag.value}>{tag.label}</option>
                  ))}
                </select>
              </label>
              <label className="books-field">
                <span className="books-field__label">Название детали</span>
                <input
                  className="books-input"
                  value={stickerName}
                  onChange={(event) => setStickerName(event.target.value)}
                  placeholder="cheese-raccoon"
                />
              </label>
            </div>
            <label className="books-field">
              <span className="books-field__label">Поисковые теги</span>
              <textarea
                className="books-input"
                value={searchTags}
                onChange={(event) => setSearchTags(event.target.value)}
                placeholder="еда, кухня, сыр, грузия"
                rows={3}
              />
              <span className="books-field__help">Через запятую, точку с запятой или с новой строки.</span>
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
              disabled={savingCrop || !sourceUrl}
              onClick={() => {
                void saveCropDetail();
              }}
            >
              {savingCrop ? "Сохранение..." : "Сохранить стикер"}
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

      <section className="books-panel recipe-media-panel">
        <div className="books-section-head">
          <div>
            <h2 className="books-panel__title">Сохраненные стикеры</h2>
            <p className="books-section-help">Редактирование тегов, удаление из R2 и базы, пересохранение PNG/JPG в WebP.</p>
          </div>
          <div className="books-actions">
            <input
              className="books-input"
              value={assetSearch}
              onChange={(event) => setAssetSearch(event.target.value)}
              placeholder="поиск по названию или папке"
            />
            <button
              type="button"
              className="books-button books-button--secondary"
              disabled={loadingAssets}
              onClick={() => {
                void loadStickerAssets();
              }}
            >
              {loadingAssets ? "Загрузка..." : "Обновить"}
            </button>
          </div>
        </div>
        <div className="media-sticker-grid">
          {stickerAssets.map((sticker) => {
            const draft = assetDrafts[sticker.id] ?? { title: sticker.title, tags: tagsToText(sticker.tags) };
            const busy = assetActionId === sticker.id;
            return (
              <article key={sticker.id} className="media-sticker-card">
                <a href={sticker.public_url} target="_blank" rel="noreferrer" className="media-sticker-card__preview">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={withCacheBuster(sticker.public_url, sticker.updated_at)} alt="" />
                </a>
                <label className="books-field">
                  <span className="books-field__label">Название</span>
                  <input
                    className="books-input"
                    value={draft.title}
                    onChange={(event) => setAssetDrafts((current) => ({
                      ...current,
                      [sticker.id]: { ...draft, title: event.target.value },
                    }))}
                  />
                </label>
                <label className="books-field">
                  <span className="books-field__label">Теги</span>
                  <textarea
                    className="books-input"
                    value={draft.tags}
                    rows={3}
                    onChange={(event) => setAssetDrafts((current) => ({
                      ...current,
                      [sticker.id]: { ...draft, tags: event.target.value },
                    }))}
                  />
                </label>
                <small>{sticker.storage_path}</small>
                <div className="books-actions">
                  <button
                    type="button"
                    className="books-button books-button--primary"
                    disabled={busy}
                    onClick={() => {
                      void updateStickerAsset(sticker);
                    }}
                  >
                    Сохранить
                  </button>
                  {!isWebpPath(sticker.storage_path) ? (
                    <button
                      type="button"
                      className="books-button books-button--secondary"
                      disabled={busy}
                      onClick={() => {
                        void convertStickerAssetToWebp(sticker);
                      }}
                    >
                      В WebP
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="books-button books-button--danger"
                    disabled={busy}
                    onClick={() => {
                      void deleteStickerAsset(sticker);
                    }}
                  >
                    Удалить
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <section className="books-panel recipe-media-panel">
        <div className="books-section-head">
          <div>
            <h2 className="books-panel__title">Анимированные стикеры</h2>
            <p className="books-section-help">Ручная регистрация анимированных файлов с preview и тегами. Файлы R2 не удаляются при удалении записи.</p>
          </div>
          <div className="books-actions">
            <input
              className="books-input"
              value={animatedSearch}
              onChange={(event) => setAnimatedSearch(event.target.value)}
              placeholder="поиск по названию или URL"
            />
            <button
              type="button"
              className="books-button books-button--secondary"
              disabled={loadingAnimated}
              onClick={() => {
                void loadAnimatedStickers();
              }}
            >
              {loadingAnimated ? "Загрузка..." : "Обновить"}
            </button>
          </div>
        </div>

        <div className="media-animated-form">
          <input className="books-input" value={animatedForm.title} onChange={(event) => setAnimatedForm((current) => ({ ...current, title: event.target.value }))} placeholder="Название" />
          <input className="books-input" value={animatedForm.animationUrl} onChange={(event) => setAnimatedForm((current) => ({ ...current, animationUrl: event.target.value }))} placeholder="URL анимации" />
          <input className="books-input" value={animatedForm.previewUrl} onChange={(event) => setAnimatedForm((current) => ({ ...current, previewUrl: event.target.value }))} placeholder="URL preview" />
          <input className="books-input" value={animatedForm.storagePath} onChange={(event) => setAnimatedForm((current) => ({ ...current, storagePath: event.target.value }))} placeholder="storage_path, если есть" />
          <input className="books-input" value={animatedForm.format} onChange={(event) => setAnimatedForm((current) => ({ ...current, format: event.target.value }))} placeholder="gif / webp / lottie" />
          <input className="books-input" value={animatedForm.tags} onChange={(event) => setAnimatedForm((current) => ({ ...current, tags: event.target.value }))} placeholder="теги" />
          <button
            type="button"
            className="books-button books-button--success"
            disabled={creatingAnimated}
            onClick={() => {
              void createAnimatedSticker();
            }}
          >
            {creatingAnimated ? "Добавление..." : "Добавить"}
          </button>
        </div>

        <div className="media-sticker-grid">
          {animatedStickers.map((sticker) => {
            const draft = animatedDrafts[sticker.id] ?? {
              title: sticker.title,
              animationUrl: sticker.animation_url,
              previewUrl: sticker.preview_url ?? "",
              storagePath: sticker.storage_path ?? "",
              previewStoragePath: sticker.preview_storage_path ?? "",
              format: sticker.format ?? "",
              tags: tagsToText(sticker.tags),
            };
            const busy = animatedActionId === sticker.id;
            return (
              <article key={sticker.id} className="media-sticker-card">
                <a href={sticker.animation_url} target="_blank" rel="noreferrer" className="media-sticker-card__preview">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={sticker.preview_url || sticker.animation_url} alt="" />
                </a>
                <input className="books-input" value={draft.title} onChange={(event) => setAnimatedDrafts((current) => ({ ...current, [sticker.id]: { ...draft, title: event.target.value } }))} />
                <input className="books-input" value={draft.animationUrl} onChange={(event) => setAnimatedDrafts((current) => ({ ...current, [sticker.id]: { ...draft, animationUrl: event.target.value } }))} />
                <input className="books-input" value={draft.previewUrl} onChange={(event) => setAnimatedDrafts((current) => ({ ...current, [sticker.id]: { ...draft, previewUrl: event.target.value } }))} />
                <input className="books-input" value={draft.format} onChange={(event) => setAnimatedDrafts((current) => ({ ...current, [sticker.id]: { ...draft, format: event.target.value } }))} />
                <textarea className="books-input" rows={3} value={draft.tags} onChange={(event) => setAnimatedDrafts((current) => ({ ...current, [sticker.id]: { ...draft, tags: event.target.value } }))} />
                <div className="books-actions">
                  <button type="button" className="books-button books-button--primary" disabled={busy} onClick={() => { void updateAnimatedSticker(sticker); }}>
                    Сохранить
                  </button>
                  <button type="button" className="books-button books-button--danger" disabled={busy} onClick={() => { void deleteAnimatedSticker(sticker); }}>
                    Удалить запись
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}
