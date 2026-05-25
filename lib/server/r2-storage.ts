import crypto from "crypto";

type R2UploadInput = {
  key: string;
  body: Buffer;
  contentType: string;
};

export type R2ListedObject = {
  key: string;
  size: number;
  lastModified: string | null;
  publicUrl: string;
};

export type R2ListResult = {
  prefix: string;
  folders: string[];
  objects: R2ListedObject[];
  nextContinuationToken: string | null;
};

type R2Config = {
  endpoint: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucketName: string;
  publicUrl: string;
};

function getR2Config(): R2Config | null {
  const endpoint = process.env.R2_ENDPOINT?.trim();
  const accessKeyId = process.env.R2_ACCESS_KEY_ID?.trim();
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY?.trim();
  const bucketName = process.env.R2_BUCKET_NAME?.trim();
  const publicUrl = process.env.R2_PUBLIC_URL?.trim();

  if (!endpoint || !accessKeyId || !secretAccessKey || !bucketName || !publicUrl) {
    return null;
  }

  return {
    endpoint: endpoint.replace(/\/+$/, ""),
    accessKeyId,
    secretAccessKey,
    bucketName,
    publicUrl: publicUrl.replace(/\/+$/, ""),
  };
}

function hmac(key: Buffer | string, value: string) {
  return crypto.createHmac("sha256", key).update(value, "utf8").digest();
}

function sha256Hex(value: Buffer | string) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function toAmzDate(date: Date) {
  return date.toISOString().replace(/[:-]|\.\d{3}/g, "");
}

function encodePath(path: string) {
  return path
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

function encodeQueryValue(value: string) {
  return encodeURIComponent(value).replace(/[!'()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
}

function canonicalQuery(params: Record<string, string | undefined>) {
  return Object.entries(params)
    .filter((entry): entry is [string, string] => entry[1] !== undefined)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${encodeQueryValue(key)}=${encodeQueryValue(value)}`)
    .join("&");
}

function getSigningKey(secretAccessKey: string, dateStamp: string) {
  const dateKey = hmac(`AWS4${secretAccessKey}`, dateStamp);
  const regionKey = hmac(dateKey, "auto");
  const serviceKey = hmac(regionKey, "s3");
  return hmac(serviceKey, "aws4_request");
}

function xmlDecode(value: string) {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&gt;/g, ">")
    .replace(/&lt;/g, "<")
    .replace(/&amp;/g, "&");
}

function xmlValues(xml: string, tagName: string) {
  return Array.from(xml.matchAll(new RegExp(`<${tagName}>([\\s\\S]*?)</${tagName}>`, "g")))
    .map((match) => xmlDecode(match[1] ?? ""));
}

function firstXmlValue(xml: string, tagName: string) {
  return xmlValues(xml, tagName)[0] ?? null;
}

async function signedR2Request(input: {
  method: "DELETE" | "GET" | "PUT";
  key?: string;
  query?: Record<string, string | undefined>;
  body?: Buffer;
  contentType?: string;
}) {
  const config = getR2Config();
  if (!config) {
    throw new Error("Missing R2 configuration.");
  }

  const now = new Date();
  const amzDate = toAmzDate(now);
  const dateStamp = amzDate.slice(0, 8);
  const body = input.body ?? Buffer.from("");
  const payloadHash = sha256Hex(body);
  const objectKey = input.key?.replace(/^\/+/, "") ?? "";
  const canonicalUri = `/${config.bucketName}${objectKey ? `/${encodePath(objectKey)}` : ""}`;
  const endpointUrl = new URL(config.endpoint);
  const host = endpointUrl.host;
  const query = canonicalQuery(input.query ?? {});
  const requestUrl = `${config.endpoint}${canonicalUri}${query ? `?${query}` : ""}`;

  const headers = {
    "content-type": input.contentType ?? "application/octet-stream",
    host,
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": amzDate,
  };

  const signedHeaders = "content-type;host;x-amz-content-sha256;x-amz-date";
  const canonicalHeaders = [
    `content-type:${headers["content-type"]}`,
    `host:${headers.host}`,
    `x-amz-content-sha256:${headers["x-amz-content-sha256"]}`,
    `x-amz-date:${headers["x-amz-date"]}`,
    "",
  ].join("\n");

  const canonicalRequest = [
    input.method,
    canonicalUri,
    query,
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join("\n");

  const credentialScope = `${dateStamp}/auto/s3/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    sha256Hex(canonicalRequest),
  ].join("\n");

  const signature = crypto
    .createHmac("sha256", getSigningKey(config.secretAccessKey, dateStamp))
    .update(stringToSign, "utf8")
    .digest("hex");

  const authorization = [
    `AWS4-HMAC-SHA256 Credential=${config.accessKeyId}/${credentialScope}`,
    `SignedHeaders=${signedHeaders}`,
    `Signature=${signature}`,
  ].join(", ");

  return {
    config,
    response: await fetch(requestUrl, {
      method: input.method,
      headers: {
        ...headers,
        authorization,
      },
      body: input.method === "PUT" ? new Uint8Array(body) : undefined,
    }),
  };
}

export function hasR2Config() {
  return getR2Config() !== null;
}

export async function uploadPublicR2Object(input: R2UploadInput): Promise<string> {
  const objectKey = input.key.replace(/^\/+/, "");
  const { config, response } = await signedR2Request({
    method: "PUT",
    key: objectKey,
    body: input.body,
    contentType: input.contentType,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`R2 upload failed (${response.status}): ${text.slice(0, 500)}`);
  }

  return `${config.publicUrl}/${encodePath(objectKey)}`;
}

export async function fetchPublicR2Object(key: string): Promise<Buffer> {
  const objectKey = key.replace(/^\/+/, "");
  const { response } = await signedR2Request({
    method: "GET",
    key: objectKey,
    contentType: "application/octet-stream",
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`R2 fetch failed (${response.status}): ${text.slice(0, 500)}`);
  }

  return Buffer.from(await response.arrayBuffer());
}

export async function deletePublicR2Object(key: string): Promise<void> {
  const objectKey = key.replace(/^\/+/, "");
  const { response } = await signedR2Request({
    method: "DELETE",
    key: objectKey,
    contentType: "application/octet-stream",
  });

  if (!response.ok && response.status !== 404) {
    const text = await response.text();
    throw new Error(`R2 delete failed (${response.status}): ${text.slice(0, 500)}`);
  }
}

export async function listPublicR2Objects(input: {
  prefix?: string;
  delimiter?: string;
  continuationToken?: string;
  maxKeys?: number;
}): Promise<R2ListResult> {
  const prefix = input.prefix?.replace(/^\/+/, "") ?? "";
  const { config, response } = await signedR2Request({
    method: "GET",
    contentType: "application/octet-stream",
    query: {
      "continuation-token": input.continuationToken,
      delimiter: input.delimiter,
      "list-type": "2",
      "max-keys": String(Math.max(1, Math.min(input.maxKeys ?? 120, 500))),
      prefix,
    },
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`R2 list failed (${response.status}): ${text.slice(0, 500)}`);
  }

  const folders = Array.from(text.matchAll(/<CommonPrefixes>[\s\S]*?<Prefix>([\s\S]*?)<\/Prefix>[\s\S]*?<\/CommonPrefixes>/g))
    .map((match) => xmlDecode(match[1] ?? ""))
    .filter(Boolean);

  const objects = Array.from(text.matchAll(/<Contents>([\s\S]*?)<\/Contents>/g))
    .map((match): R2ListedObject | null => {
      const itemXml = match[1] ?? "";
      const key = firstXmlValue(itemXml, "Key");
      if (!key || key.endsWith("/")) {
        return null;
      }
      return {
        key,
        size: Number(firstXmlValue(itemXml, "Size") ?? 0),
        lastModified: firstXmlValue(itemXml, "LastModified"),
        publicUrl: `${config.publicUrl}/${encodePath(key)}`,
      };
    })
    .filter((item): item is R2ListedObject => item !== null);

  return {
    prefix,
    folders,
    objects,
    nextContinuationToken: firstXmlValue(text, "NextContinuationToken"),
  };
}
