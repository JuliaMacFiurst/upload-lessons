import sharp from "sharp";

function whiteRemovalSettings(intensity: unknown) {
  const normalized = Math.max(1, Math.min(100, Math.round(Number(intensity) || 65)));
  const edgeThreshold = Math.round(250 - normalized * 0.18);
  const featherThreshold = Math.max(180, edgeThreshold - Math.round(6 + normalized * 0.22));
  const spreadLimit = Math.round(16 + normalized * 0.26);
  return {
    edgeThreshold,
    featherThreshold,
    spreadLimit,
  };
}

function isNearlyWhite(data: Buffer, index: number, minValue: number, spreadLimit: number) {
  const red = data[index] ?? 0;
  const green = data[index + 1] ?? 0;
  const blue = data[index + 2] ?? 0;
  const alpha = data[index + 3] ?? 0;
  const min = Math.min(red, green, blue);
  const max = Math.max(red, green, blue);
  return alpha > 0 && min >= minValue && max - min <= spreadLimit;
}

export async function removeEdgeWhiteBackground(input: sharp.Sharp, intensity: unknown): Promise<Buffer> {
  const { edgeThreshold, featherThreshold, spreadLimit } = whiteRemovalSettings(intensity);
  const { data, info } = await input.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height } = info;
  const pixelCount = width * height;
  const connected = new Uint8Array(pixelCount);
  const queue = new Uint32Array(pixelCount);
  let readIndex = 0;
  let writeIndex = 0;

  const enqueue = (x: number, y: number) => {
    if (x < 0 || x >= width || y < 0 || y >= height) {
      return;
    }
    const pixelIndex = y * width + x;
    if (connected[pixelIndex]) {
      return;
    }
    if (!isNearlyWhite(data, pixelIndex * 4, edgeThreshold, spreadLimit)) {
      return;
    }
    connected[pixelIndex] = 1;
    queue[writeIndex] = pixelIndex;
    writeIndex += 1;
  };

  for (let x = 0; x < width; x += 1) {
    enqueue(x, 0);
    enqueue(x, height - 1);
  }
  for (let y = 1; y < height - 1; y += 1) {
    enqueue(0, y);
    enqueue(width - 1, y);
  }

  while (readIndex < writeIndex) {
    const pixelIndex = queue[readIndex] ?? 0;
    readIndex += 1;
    const x = pixelIndex % width;
    const y = Math.floor(pixelIndex / width);
    enqueue(x + 1, y);
    enqueue(x - 1, y);
    enqueue(x, y + 1);
    enqueue(x, y - 1);
  }

  for (let pixelIndex = 0; pixelIndex < pixelCount; pixelIndex += 1) {
    const dataIndex = pixelIndex * 4;
    if (connected[pixelIndex]) {
      data[dataIndex + 3] = 0;
      continue;
    }

    const x = pixelIndex % width;
    const y = Math.floor(pixelIndex / width);
    const touchesBackground =
      (x > 0 && connected[pixelIndex - 1]) ||
      (x < width - 1 && connected[pixelIndex + 1]) ||
      (y > 0 && connected[pixelIndex - width]) ||
      (y < height - 1 && connected[pixelIndex + width]);

    if (touchesBackground && isNearlyWhite(data, dataIndex, featherThreshold, spreadLimit)) {
      const min = Math.min(data[dataIndex] ?? 0, data[dataIndex + 1] ?? 0, data[dataIndex + 2] ?? 0);
      const alpha = data[dataIndex + 3] ?? 255;
      const opacity = Math.max(0, Math.min(1, (edgeThreshold - min) / (edgeThreshold - featherThreshold)));
      data[dataIndex + 3] = Math.round(alpha * opacity);
    }
  }

  return sharp(data, {
    raw: {
      width,
      height,
      channels: 4,
    },
  })
    .webp({ quality: 92, alphaQuality: 95 })
    .toBuffer();
}
