export type FreeformMaskPoint = {
  x?: number;
  y?: number;
};

export type FreeformMaskInput = {
  points?: FreeformMaskPoint[];
};

function escapeSvgAttribute(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function normalizeFreeformMaskPoints(mask: FreeformMaskInput | undefined, crop: {
  x: number;
  y: number;
  width: number;
  height: number;
}) {
  const points = Array.isArray(mask?.points) ? mask.points : [];
  if (points.length < 3) {
    return [];
  }

  return points
    .map((point) => ({
      x: Math.max(0, Math.min(crop.width, Math.round(Number(point.x ?? 0) - crop.x))),
      y: Math.max(0, Math.min(crop.height, Math.round(Number(point.y ?? 0) - crop.y))),
    }))
    .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y));
}

export function buildFreeformAlphaMask(width: number, height: number, points: Array<{ x: number; y: number }>) {
  if (points.length < 3) {
    return null;
  }

  const polygon = points
    .map((point) => `${point.x},${point.y}`)
    .join(" ");
  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    `<polygon points="${escapeSvgAttribute(polygon)}" fill="white"/>`,
    `</svg>`,
  ].join("");

  return Buffer.from(svg);
}
