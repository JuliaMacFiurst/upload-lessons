export async function hasMp4FileSignature(file: Blob) {
  const header = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  return header.length >= 8
    && header[4] === 0x66
    && header[5] === 0x74
    && header[6] === 0x79
    && header[7] === 0x70;
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
    request.onerror = () => reject(new Error("Direct R2 upload failed. Check the network and R2 CORS configuration, then retry."));
    request.onload = () => {
      if (request.status >= 200 && request.status < 300) resolve();
      else reject(new Error(`Direct R2 upload failed (${request.status || "network error"}). Please retry.`));
    };
    request.send(file);
  });
}
