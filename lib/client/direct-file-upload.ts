export async function hasMp4FileSignature(file: Blob) {
  const header = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  return header.length >= 8
    && header[4] === 0x66
    && header[5] === 0x74
    && header[6] === 0x79
    && header[7] === 0x70;
}

type DirectUploadFailure = {
  kind: "aborted" | "http" | "network";
  url: string;
  status?: number;
  responseText?: string;
};

function safeUploadHost(url: string) {
  try {
    return new URL(url).host;
  } catch {
    return "unknown R2 host";
  }
}

function safeR2ErrorCode(responseText: string | undefined) {
  const code = responseText?.match(/<Code>([A-Za-z0-9_-]{1,80})<\/Code>/)?.[1];
  return code ? `; R2 code: ${code}` : "";
}

export function directUploadFailureMessage(failure: DirectUploadFailure) {
  const host = safeUploadHost(failure.url);
  if (failure.kind === "network") {
    return `Direct R2 upload network/CORS failure (browser status 0; host: ${host}). The browser did not expose an HTTP response.`;
  }
  if (failure.kind === "aborted") {
    return `Direct R2 upload was aborted (host: ${host}). Select the file and retry.`;
  }
  return `Direct R2 upload returned HTTP ${failure.status ?? 0} from ${host}${safeR2ErrorCode(failure.responseText)}.`;
}

export function uploadFileDirectly(
  url: string,
  file: Blob,
  headers: Record<string, string>,
  onProgress?: (percent: number) => void,
) {
  return new Promise<void>((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("PUT", url);
    for (const [name, value] of Object.entries(headers)) request.setRequestHeader(name, value);
    request.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress?.(Math.round((event.loaded / event.total) * 100));
    };
    request.onerror = () => reject(new Error(directUploadFailureMessage({ kind: "network", url })));
    request.onabort = () => reject(new Error(directUploadFailureMessage({ kind: "aborted", url })));
    request.onload = () => {
      if (request.status >= 200 && request.status < 300) resolve();
      else reject(new Error(directUploadFailureMessage({
        kind: "http",
        url,
        status: request.status,
        responseText: request.responseText,
      })));
    };
    request.send(file);
  });
}
