export const MAX_RECIPE_UPLOAD_BLOB_BYTES = 3 * 1024 * 1024; // 3 MB

export type PrepareImageOptions = {
  maxBytes?: number;
  minWidth?: number;
  minHeight?: number;
  maxAttempts?: number;
};

export type OptimizationResult = {
  blob: Blob;
  wasOptimized: boolean;
  originalSize: number;
  optimizedSize: number;
  originalDimensions?: { width: number; height: number };
  optimizedDimensions?: { width: number; height: number };
};

/**
 * Loads a Blob/File into an HTMLImageElement (client-side browser environment).
 */
function loadImageElement(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Не удалось декодировать файл изображения для оптимизации."));
    };
    img.src = url;
  });
}

/**
 * Converts HTMLCanvasElement to a Blob with specified MIME type.
 */
function canvasToBlob(canvas: HTMLCanvasElement, mimeType: string): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error("Не удалось сформировать Blob из Canvas."));
        }
      },
      mimeType,
      0.92
    );
  });
}

/**
 * Calculates downscaled dimensions while strictly maintaining original aspect ratio.
 */
export function calculateTargetDimensions(
  currentWidth: number,
  currentHeight: number,
  scaleFactor: number,
  minWidth: number,
  minHeight: number
): { width: number; height: number; hitMin: boolean } {
  const origRatio = currentWidth / currentHeight;
  let targetWidth = Math.round(currentWidth * scaleFactor);
  let targetHeight = Math.round(targetWidth / origRatio);

  let hitMin = false;
  if (targetWidth < minWidth || targetHeight < minHeight) {
    hitMin = true;
    const widthScale = minWidth / currentWidth;
    const heightScale = minHeight / currentHeight;
    const clampScale = Math.max(widthScale, heightScale);

    targetWidth = Math.max(minWidth, Math.round(currentWidth * clampScale));
    targetHeight = Math.max(minHeight, Math.round(targetWidth / origRatio));
  }

  return { width: targetWidth, height: targetHeight, hitMin };
}

/**
 * Prepares a recipe image for upload:
 * - If size <= 3MB, returns input unchanged.
 * - If size > 3MB, downsizes iteratively using HTMLCanvasElement, preserving aspect ratio and MIME type.
 * - Throws a readable error if image cannot be reduced below 3MB without going below minimum dimensions.
 */
export async function prepareRecipeImageForUpload(
  input: Blob | File,
  options: PrepareImageOptions = {}
): Promise<OptimizationResult> {
  const maxBytes = options.maxBytes ?? MAX_RECIPE_UPLOAD_BLOB_BYTES;
  const originalSize = input.size;

  // 1. Return unchanged if already <= 3 MB
  if (originalSize <= maxBytes) {
    return {
      blob: input,
      wasOptimized: false,
      originalSize,
      optimizedSize: originalSize,
    };
  }

  // Fallback for non-browser runtime (e.g. Node tests without DOM)
  if (typeof window === "undefined" || typeof document === "undefined") {
    return {
      blob: input,
      wasOptimized: false,
      originalSize,
      optimizedSize: originalSize,
    };
  }

  const img = await loadImageElement(input);
  const origWidth = img.naturalWidth || img.width;
  const origHeight = img.naturalHeight || img.height;
  const mimeType = input.type || "image/png";

  const minWidth = options.minWidth ?? 800;
  const minHeight = options.minHeight ?? 1200;
  const maxAttempts = options.maxAttempts ?? 6;

  let currentWidth = origWidth;
  let currentHeight = origHeight;
  let currentBlob: Blob = input;
  let attempt = 0;

  // Estimate initial scale based on square root of target ratio
  let scaleFactor = Math.min(0.88, Math.sqrt(maxBytes / originalSize) * 0.95);

  while (attempt < maxAttempts) {
    attempt++;

    const { width: nextWidth, height: nextHeight, hitMin } = calculateTargetDimensions(
      currentWidth,
      currentHeight,
      scaleFactor,
      minWidth,
      minHeight
    );

    if (nextWidth === currentWidth && nextHeight === currentHeight && attempt > 1) {
      break;
    }

    currentWidth = nextWidth;
    currentHeight = nextHeight;

    const canvas = document.createElement("canvas");
    canvas.width = currentWidth;
    canvas.height = currentHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("Не удалось создать контекст рисования для оптимизации изображения.");
    }

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, 0, 0, currentWidth, currentHeight);

    currentBlob = await canvasToBlob(canvas, mimeType);

    if (currentBlob.size <= maxBytes) {
      const result: OptimizationResult = {
        blob: currentBlob,
        wasOptimized: true,
        originalSize,
        optimizedSize: currentBlob.size,
        originalDimensions: { width: origWidth, height: origHeight },
        optimizedDimensions: { width: currentWidth, height: currentHeight },
      };

      if (process.env.NODE_ENV !== "production") {
        const origMB = (originalSize / (1024 * 1024)).toFixed(1);
        const optMB = (currentBlob.size / (1024 * 1024)).toFixed(1);
        console.log(
          `[recipe-upload] original: ${origMB} MB optimized: ${optMB} MB dimensions: ${origWidth}x${origHeight} → ${currentWidth}x${currentHeight}`
        );
      }

      return result;
    }

    if (hitMin) {
      break;
    }

    scaleFactor = 0.85;
  }

  const finalSizeMB = (currentBlob.size / (1024 * 1024)).toFixed(1);
  throw new Error(
    `Не удалось подготовить изображение для загрузки. Размер после оптимизации: ${finalSizeMB} MB. Попробуйте изображение меньшего разрешения.`
  );
}
