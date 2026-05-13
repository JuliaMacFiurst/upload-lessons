#!/usr/bin/env node

import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const DEFAULT_INPUT_DIR = path.join("public", "gifs_for_giphy");
const DEFAULT_OUTPUT_DIR = path.join(DEFAULT_INPUT_DIR, "transparent_gifs");
const DEFAULT_WATERMARK_LOGO = path.join("public", "laplapla-logo.png");
const DEFAULT_WATERMARK_FONT = path.join(process.env.HOME || "", "Library", "Fonts", "AmaticSC-Regular.ttf");
const SUPPORTED_EXTENSIONS = new Set([".gif", ".mov", ".mp4"]);

const options = {
  inputDir: DEFAULT_INPUT_DIR,
  outputDir: DEFAULT_OUTPUT_DIR,
  fps: 15,
  maxWidth: 600,
  similarity: 0.08,
  blend: 0.02,
  watermarkLogo: DEFAULT_WATERMARK_LOGO,
  watermarkFont: DEFAULT_WATERMARK_FONT,
  watermarkLogoSize: 28,
  watermarkOpacity: 0.42,
  watermarkText: "LapLapLa",
  watermarkTextColor: "0x7B2CBF",
  watermarkFontSize: 16,
  watermarkPadding: 8,
  limit: null,
  overwrite: false,
  dryRun: false,
  recursive: false,
};

for (let i = 2; i < process.argv.length; i += 1) {
  const arg = process.argv[i];
  const next = process.argv[i + 1];

  if (arg === "--input" && next) {
    options.inputDir = next;
    i += 1;
  } else if (arg === "--output" && next) {
    options.outputDir = next;
    i += 1;
  } else if (arg === "--fps" && next) {
    options.fps = Number(next);
    i += 1;
  } else if (arg === "--max-width" && next) {
    options.maxWidth = Number(next);
    i += 1;
  } else if (arg === "--similarity" && next) {
    options.similarity = Number(next);
    i += 1;
  } else if (arg === "--blend" && next) {
    options.blend = Number(next);
    i += 1;
  } else if (arg === "--watermark-logo" && next) {
    options.watermarkLogo = next;
    i += 1;
  } else if (arg === "--watermark-font" && next) {
    options.watermarkFont = next;
    i += 1;
  } else if (arg === "--watermark-logo-size" && next) {
    options.watermarkLogoSize = Number(next);
    i += 1;
  } else if (arg === "--watermark-opacity" && next) {
    options.watermarkOpacity = Number(next);
    i += 1;
  } else if (arg === "--watermark-font-size" && next) {
    options.watermarkFontSize = Number(next);
    i += 1;
  } else if (arg === "--watermark-text-color" && next) {
    options.watermarkTextColor = next;
    i += 1;
  } else if (arg === "--limit" && next) {
    options.limit = Number(next);
    i += 1;
  } else if (arg === "--overwrite") {
    options.overwrite = true;
  } else if (arg === "--dry-run") {
    options.dryRun = true;
  } else if (arg === "--recursive") {
    options.recursive = true;
  } else if (arg === "--help" || arg === "-h") {
    printHelp();
    process.exit(0);
  } else {
    console.error(`Unknown option: ${arg}`);
    printHelp();
    process.exit(1);
  }
}

main();

function main() {
  assertCommand("ffmpeg");

  const inputDir = path.resolve(options.inputDir);
  const outputDir = path.resolve(options.outputDir);
  const watermarkLogo = path.resolve(options.watermarkLogo);
  const watermarkFont = path.resolve(options.watermarkFont);

  if (!fs.existsSync(inputDir) || !fs.statSync(inputDir).isDirectory()) {
    throw new Error(`Input directory does not exist: ${inputDir}`);
  }

  if (!fs.existsSync(watermarkLogo) || !fs.statSync(watermarkLogo).isFile()) {
    throw new Error(`Watermark logo does not exist: ${watermarkLogo}`);
  }

  if (!fs.existsSync(watermarkFont) || !fs.statSync(watermarkFont).isFile()) {
    throw new Error(`Watermark font does not exist: ${watermarkFont}`);
  }

  const files = listAnimationFiles(inputDir, outputDir).slice(0, options.limit || undefined);
  if (files.length === 0) {
    console.log(`No .gif, .mov, or .mp4 files found in ${inputDir}`);
    return;
  }

  if (!options.dryRun) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const usedTargets = new Set();
  let converted = 0;
  let skipped = 0;

  for (const file of files) {
    const outputFile = getOutputPath(file, outputDir, usedTargets);

    if (!options.overwrite && fs.existsSync(outputFile)) {
      skipped += 1;
      console.log(`skip existing: ${relative(outputFile)}`);
      continue;
    }

    const hasAlpha = hasTransparentPixels(file);
    const mode = hasAlpha ? "preserve alpha" : "remove white background";

    console.log(`${options.dryRun ? "would convert" : "convert"}: ${relative(file)} -> ${relative(outputFile)} (${mode})`);

    if (!options.dryRun) {
      convertToTransparentGif(file, outputFile, hasAlpha, watermarkLogo, watermarkFont);
    }

    converted += 1;
  }

  console.log(`Done. ${options.dryRun ? "Planned" : "Converted"}: ${converted}. Skipped: ${skipped}. Output: ${relative(outputDir)}`);
}

function printHelp() {
  console.log(`
Usage:
  node scripts/convert-gifs-for-giphy.mjs [options]

Options:
  --input <dir>        Source folder. Default: ${DEFAULT_INPUT_DIR}
  --output <dir>       Output folder. Default: ${DEFAULT_OUTPUT_DIR}
  --fps <number>       Output GIF FPS. Default: ${options.fps}
  --max-width <px>     Downscale wider animations to this width. Default: ${options.maxWidth}
  --similarity <num>   ffmpeg colorkey similarity for white background removal. Default: ${options.similarity}
  --blend <num>        ffmpeg colorkey edge blend. Default: ${options.blend}
  --watermark-logo <f> Logo file. Default: ${DEFAULT_WATERMARK_LOGO}
  --watermark-font <f> Font file for text. Default: ${DEFAULT_WATERMARK_FONT}
  --watermark-logo-size <px>
                       Logo size in pixels. Default: ${options.watermarkLogoSize}
  --watermark-font-size <px>
                       Text size in pixels. Default: ${options.watermarkFontSize}
  --watermark-opacity <num>
                       Logo/text opacity from 0 to 1. Default: ${options.watermarkOpacity}
  --watermark-text-color <color>
                       Text color for ffmpeg drawtext. Default: ${options.watermarkTextColor}
  --limit <number>     Convert only the first N files, useful for testing
  --overwrite          Replace existing output GIFs
  --dry-run            Print planned conversions without writing files
  --recursive          Include nested folders. By default only direct files are processed
`);
}

function assertCommand(command) {
  const result = spawnSync(command, ["-version"], { stdio: "ignore" });
  if (result.error || result.status !== 0) {
    throw new Error(`${command} is required but was not found in PATH`);
  }
}

function listAnimationFiles(inputDir, outputDir) {
  const files = [];
  const entries = fs.readdirSync(inputDir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(inputDir, entry.name);

    if (entry.isDirectory()) {
      if (options.recursive && path.resolve(fullPath) !== outputDir) {
        files.push(...listAnimationFiles(fullPath, outputDir));
      }
      continue;
    }

    if (!entry.isFile()) {
      continue;
    }

    const extension = path.extname(entry.name).toLowerCase();
    if (SUPPORTED_EXTENSIONS.has(extension)) {
      files.push(fullPath);
    }
  }

  return files.sort((a, b) => a.localeCompare(b));
}

function getOutputPath(inputFile, outputDir, usedTargets) {
  const parsed = path.parse(inputFile);
  const extension = parsed.ext.toLowerCase().replace(".", "");
  let candidate = path.join(outputDir, `${parsed.name}.gif`);

  if (!usedTargets.has(candidate)) {
    usedTargets.add(candidate);
    return candidate;
  }

  candidate = path.join(outputDir, `${parsed.name}-${extension}.gif`);
  let counter = 2;
  while (usedTargets.has(candidate)) {
    candidate = path.join(outputDir, `${parsed.name}-${extension}-${counter}.gif`);
    counter += 1;
  }

  usedTargets.add(candidate);
  return candidate;
}

function hasTransparentPixels(inputFile) {
  const sample = spawnSync(
    "ffmpeg",
    [
      "-v",
      "error",
      "-i",
      inputFile,
      "-map",
      "0:v:0",
      "-vf",
      `fps=2,scale='min(${Math.min(options.maxWidth, 160)},iw)':-1:flags=fast_bilinear,format=rgba`,
      "-frames:v",
      "12",
      "-f",
      "rawvideo",
      "-pix_fmt",
      "rgba",
      "pipe:1",
    ],
    { encoding: "buffer", maxBuffer: 64 * 1024 * 1024 }
  );

  if (sample.status !== 0) {
    const errorText = sample.stderr ? sample.stderr.toString().trim() : "unknown ffmpeg error";
    throw new Error(`Could not inspect alpha for ${inputFile}: ${errorText}`);
  }

  for (let i = 3; i < sample.stdout.length; i += 4) {
    if (sample.stdout[i] < 250) {
      return true;
    }
  }

  return false;
}

function convertToTransparentGif(inputFile, outputFile, preserveExistingAlpha, watermarkLogo, watermarkFont) {
  const outputArgs = options.overwrite ? ["-y"] : ["-n"];
  const prepareFilter = [
    `fps=${options.fps}`,
    `scale='min(${options.maxWidth},iw)':-1:flags=lanczos`,
    "format=rgba",
  ];

  if (!preserveExistingAlpha) {
    prepareFilter.push(`colorkey=0xFFFFFF:${options.similarity}:${options.blend}`);
  }

  const logoSize = Math.max(1, Math.round(options.watermarkLogoSize));
  const fontSize = Math.max(1, Math.round(options.watermarkFontSize));
  const padding = Math.max(0, Math.round(options.watermarkPadding));
  const gap = Math.max(2, Math.round(padding / 2));
  const opacity = clamp(options.watermarkOpacity, 0, 1);

  const filter = [
    `[0:v]${prepareFilter.join(",")}[base]`,
    `[1:v]scale=${logoSize}:${logoSize}:flags=lanczos,format=rgba,colorchannelmixer=aa=${opacity}[logo]`,
    `[base][logo]overlay=x=W-w-${padding}:y=H-h-${padding}:format=auto[logoed]`,
    `[logoed]drawtext=fontfile='${escapeFilterValue(watermarkFont)}':text='${escapeFilterValue(options.watermarkText)}':fontcolor=${escapeFilterValue(options.watermarkTextColor)}@${opacity}:fontsize=${fontSize}:x=w-text_w-${logoSize + padding + gap}:y=h-text_h-${padding + 1},split[gif][palette]`,
    "[palette]palettegen=reserve_transparent=1:transparency_color=ffffff[p]",
    "[gif][p]paletteuse=alpha_threshold=1",
  ].join(";");

  execFileSync(
    "ffmpeg",
    [
      ...outputArgs,
      "-v",
      "warning",
      "-i",
      inputFile,
      "-i",
      watermarkLogo,
      "-an",
      "-filter_complex",
      filter,
      "-loop",
      "0",
      outputFile,
    ],
    { stdio: "inherit" }
  );
}

function relative(filePath) {
  return path.relative(process.cwd(), filePath);
}

function clamp(value, min, max) {
  return Math.min(Math.max(Number(value), min), max);
}

function escapeFilterValue(value) {
  return String(value)
    .replaceAll("\\", "\\\\")
    .replaceAll(":", "\\:")
    .replaceAll("'", "\\'");
}
