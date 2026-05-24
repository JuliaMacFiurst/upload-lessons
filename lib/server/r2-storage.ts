import crypto from "crypto";

type R2UploadInput = {
  key: string;
  body: Buffer;
  contentType: string;
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

function getSigningKey(secretAccessKey: string, dateStamp: string) {
  const dateKey = hmac(`AWS4${secretAccessKey}`, dateStamp);
  const regionKey = hmac(dateKey, "auto");
  const serviceKey = hmac(regionKey, "s3");
  return hmac(serviceKey, "aws4_request");
}

export function hasR2Config() {
  return getR2Config() !== null;
}

export async function uploadPublicR2Object(input: R2UploadInput): Promise<string> {
  const config = getR2Config();
  if (!config) {
    throw new Error("Missing R2 configuration.");
  }

  const now = new Date();
  const amzDate = toAmzDate(now);
  const dateStamp = amzDate.slice(0, 8);
  const payloadHash = sha256Hex(input.body);
  const objectKey = input.key.replace(/^\/+/, "");
  const canonicalUri = `/${config.bucketName}/${encodePath(objectKey)}`;
  const endpointUrl = new URL(config.endpoint);
  const host = endpointUrl.host;
  const uploadUrl = `${config.endpoint}${canonicalUri}`;

  const headers = {
    "content-type": input.contentType,
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
    "PUT",
    canonicalUri,
    "",
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

  const response = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      ...headers,
      authorization,
    },
    body: input.body,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`R2 upload failed (${response.status}): ${text.slice(0, 500)}`);
  }

  return `${config.publicUrl}/${encodePath(objectKey)}`;
}
