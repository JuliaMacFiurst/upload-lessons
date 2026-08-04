export type MediaSource = "pexels" | "wikimedia" | "giphy";
export type MediaProvider = MediaSource;
export type MediaKind = "image" | "video";

export type MediaSearchItem = {
  id: string;
  source: MediaProvider;
  kind: MediaKind;
  animated?: boolean;
  thumbnailUrl: string;
  previewUrl?: string;
  originalUrl: string;
  width?: number;
  height?: number;
  duration?: number;
  title?: string;
  author?: string;
  attributionUrl?: string;
  license?: string;
  creditLine: string;
};

export type MediaSearchResponse = {
  items: MediaSearchItem[];
  nextCursor: string | null;
  hasMore: boolean;
  unavailableSources?: MediaProvider[];
};
