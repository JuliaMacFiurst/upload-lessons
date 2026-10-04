import type { VoiceProcessingSettings } from "../cat-questions/production";

// Frozen from capybara_tales/components/studio/StudioRoot.tsx (accepted Studio chain).
export const LAPLAPLA_VOICE_PARAMETERS = {
  sampleRate: 48_000,
  recording: { highpassHz: 80, threshold: -20, knee: 20, ratio: 3, attack: 0.003, release: 0.25 },
  child: { playbackRate: 1.14 },
  noiseReduction: {
    full: { percentile: 0.2, floor: 0.0015, openMultiplier: 3, openMinimum: 0.01, closeMultiplier: 1.4, closeMinimum: 0.004, attack: 0.004, release: 0.06, floorGain: 0.18 },
    light: { percentile: 0.12, floor: 0.001, openMultiplier: 2, openMinimum: 0.006, closeMultiplier: 1.15, closeMinimum: 0.0025, attack: 0.008, release: 0.12, floorGain: 0.55 },
  },
  deEsser: { lowpassHz: 4_500, percentile: 0.82, thresholdMultiplier: 0.9, minimumThreshold: 0.01, attack: 0.0015, release: 0.035, minimumGain: 0.55 },
  compressor: { thresholdDb: -20, ratio: 3.5, attack: 0.003, release: 0.09, makeupGain: 1.18 },
  louder: { outputGain: 1.35 },
  limiter: { ceiling: 0.92 },
} as const;

export const AUDIO_RECORDER_MIME_CANDIDATES = [
  "audio/webm;codecs=opus",
  "audio/mp4;codecs=mp4a.40.2",
  "audio/mp4",
  "audio/webm",
  "audio/ogg;codecs=opus",
] as const;

export function pickSupportedAudioRecorderMimeType() {
  if (typeof MediaRecorder === "undefined") return "";
  return AUDIO_RECORDER_MIME_CANDIDATES.find((mime) => MediaRecorder.isTypeSupported(mime)) ?? "";
}

export function configureStudioRecordingChain(context: AudioContext, rawStream: MediaStream) {
  const source = context.createMediaStreamSource(rawStream);
  const highpass = context.createBiquadFilter();
  highpass.type = "highpass";
  highpass.frequency.value = LAPLAPLA_VOICE_PARAMETERS.recording.highpassHz;

  const compressor = context.createDynamicsCompressor();
  compressor.threshold.value = LAPLAPLA_VOICE_PARAMETERS.recording.threshold;
  compressor.knee.value = LAPLAPLA_VOICE_PARAMETERS.recording.knee;
  compressor.ratio.value = LAPLAPLA_VOICE_PARAMETERS.recording.ratio;
  compressor.attack.value = LAPLAPLA_VOICE_PARAMETERS.recording.attack;
  compressor.release.value = LAPLAPLA_VOICE_PARAMETERS.recording.release;

  const destination = context.createMediaStreamDestination();
  source.connect(highpass);
  highpass.connect(compressor);
  compressor.connect(destination);
  return destination.stream;
}

function percentile(values: number[], ratio: number) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor(sorted.length * ratio)))] ?? 0;
}

function applyNoiseReduction(samples: Float32Array, sampleRate: number, light: boolean) {
  const params = light ? LAPLAPLA_VOICE_PARAMETERS.noiseReduction.light : LAPLAPLA_VOICE_PARAMETERS.noiseReduction.full;
  const frameSize = Math.max(256, Math.floor(sampleRate * 0.02));
  const frameRms: number[] = [];
  for (let start = 0; start < samples.length; start += frameSize) {
    let energy = 0;
    const end = Math.min(samples.length, start + frameSize);
    for (let index = start; index < end; index += 1) energy += samples[index]! * samples[index]!;
    frameRms.push(Math.sqrt(energy / Math.max(1, end - start)));
  }
  const noiseFloor = Math.max(params.floor, percentile(frameRms, params.percentile));
  const openThreshold = Math.max(noiseFloor * params.openMultiplier, params.openMinimum);
  const closeThreshold = Math.max(noiseFloor * params.closeMultiplier, params.closeMinimum);
  const attackCoeff = Math.exp(-1 / (sampleRate * params.attack));
  const releaseCoeff = Math.exp(-1 / (sampleRate * params.release));
  let gain = 1;
  for (let frameIndex = 0; frameIndex < frameRms.length; frameIndex += 1) {
    const rms = frameRms[frameIndex]!;
    let targetGain = 1;
    if (rms <= closeThreshold) targetGain = params.floorGain;
    else if (rms < openThreshold) targetGain = params.floorGain + ((rms - closeThreshold) / Math.max(0.0001, openThreshold - closeThreshold)) * (1 - params.floorGain);
    const start = frameIndex * frameSize;
    const end = Math.min(samples.length, start + frameSize);
    for (let index = start; index < end; index += 1) {
      const coeff = targetGain < gain ? attackCoeff : releaseCoeff;
      gain = targetGain + (gain - targetGain) * coeff;
      samples[index] = samples[index]! * gain;
    }
  }
}

function applyDeEsser(samples: Float32Array, sampleRate: number) {
  const params = LAPLAPLA_VOICE_PARAMETERS.deEsser;
  const lowpassCoeff = Math.exp(-2 * Math.PI * params.lowpassHz / sampleRate);
  const attackCoeff = Math.exp(-1 / (sampleRate * params.attack));
  const releaseCoeff = Math.exp(-1 / (sampleRate * params.release));
  let low = 0;
  let envelope = 0;
  const hfLevels = new Array<number>(samples.length);
  for (let index = 0; index < samples.length; index += 1) {
    low = (1 - lowpassCoeff) * samples[index]! + lowpassCoeff * low;
    const level = Math.abs(samples[index]! - low);
    envelope = level > envelope ? level + (envelope - level) * attackCoeff : level + (envelope - level) * releaseCoeff;
    hfLevels[index] = envelope;
  }
  const threshold = Math.max(params.minimumThreshold, percentile(hfLevels, params.percentile) * params.thresholdMultiplier);
  let gain = 1;
  for (let index = 0; index < samples.length; index += 1) {
    const overshoot = hfLevels[index]! - threshold;
    const targetGain = overshoot > 0 ? Math.max(params.minimumGain, 1 - overshoot / Math.max(threshold * 3, 0.0001)) : 1;
    const coeff = targetGain < gain ? attackCoeff : releaseCoeff;
    gain = targetGain + (gain - targetGain) * coeff;
    samples[index] = samples[index]! * gain;
  }
}

function applyCompressor(samples: Float32Array, sampleRate: number) {
  const params = LAPLAPLA_VOICE_PARAMETERS.compressor;
  const threshold = Math.pow(10, params.thresholdDb / 20);
  const attackCoeff = Math.exp(-1 / (sampleRate * params.attack));
  const releaseCoeff = Math.exp(-1 / (sampleRate * params.release));
  let envelope = 0;
  let gain = 1;
  for (let index = 0; index < samples.length; index += 1) {
    const level = Math.abs(samples[index]!);
    envelope = level > envelope ? level + (envelope - level) * attackCoeff : level + (envelope - level) * releaseCoeff;
    let targetGain = 1;
    if (envelope > threshold) {
      const inputDb = 20 * Math.log10(envelope);
      const outputDb = params.thresholdDb + (inputDb - params.thresholdDb) / params.ratio;
      targetGain = Math.pow(10, (outputDb - inputDb) / 20);
    }
    const coeff = targetGain < gain ? attackCoeff : releaseCoeff;
    gain = targetGain + (gain - targetGain) * coeff;
    samples[index] = samples[index]! * gain * params.makeupGain;
  }
}

function applyLimiter(samples: Float32Array) {
  const ceiling = LAPLAPLA_VOICE_PARAMETERS.limiter.ceiling;
  let peak = 0;
  for (const sample of samples) peak = Math.max(peak, Math.abs(sample));
  const normalizeGain = peak > ceiling ? ceiling / peak : 1;
  for (let index = 0; index < samples.length; index += 1) {
    samples[index] = Math.max(-ceiling, Math.min(ceiling, samples[index]! * normalizeGain));
  }
}

function buildProcessedVoiceBuffer(audioBuffer: AudioBuffer, lightNoiseReduction = false) {
  const processed = new AudioBuffer({ length: audioBuffer.length, numberOfChannels: audioBuffer.numberOfChannels, sampleRate: audioBuffer.sampleRate });
  for (let channel = 0; channel < audioBuffer.numberOfChannels; channel += 1) {
    const output = processed.getChannelData(channel);
    output.set(audioBuffer.getChannelData(channel));
    applyNoiseReduction(output, audioBuffer.sampleRate, lightNoiseReduction);
    applyDeEsser(output, audioBuffer.sampleRate);
    applyCompressor(output, audioBuffer.sampleRate);
    applyLimiter(output);
  }
  return processed;
}

export function audioBufferToPcmWav(buffer: AudioBuffer) {
  const channels = buffer.numberOfChannels;
  const arrayBuffer = new ArrayBuffer(buffer.length * channels * 2 + 44);
  const view = new DataView(arrayBuffer);
  let offset = 0;
  const write = (value: string) => { for (const char of value) view.setUint8(offset++, char.charCodeAt(0)); };
  write("RIFF"); view.setUint32(offset, 36 + buffer.length * channels * 2, true); offset += 4;
  write("WAVE"); write("fmt "); view.setUint32(offset, 16, true); offset += 4;
  view.setUint16(offset, 1, true); offset += 2; view.setUint16(offset, channels, true); offset += 2;
  view.setUint32(offset, buffer.sampleRate, true); offset += 4;
  view.setUint32(offset, buffer.sampleRate * channels * 2, true); offset += 4;
  view.setUint16(offset, channels * 2, true); offset += 2; view.setUint16(offset, 16, true); offset += 2;
  write("data"); view.setUint32(offset, buffer.length * channels * 2, true); offset += 4;
  const data = Array.from({ length: channels }, (_, channel) => buffer.getChannelData(channel));
  for (let index = 0; index < buffer.length; index += 1) {
    for (let channel = 0; channel < channels; channel += 1) {
      view.setInt16(offset, Math.max(-1, Math.min(1, data[channel]![index]!)) * 0x7fff, true); offset += 2;
    }
  }
  return new Blob([view], { type: "audio/wav" });
}

export async function processLapLapLaVoice(raw: Blob, settings: VoiceProcessingSettings) {
  const AudioContextClass = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextClass || typeof OfflineAudioContext === "undefined") throw new Error("Web Audio processing is not supported in this browser.");
  const context = new AudioContextClass({ sampleRate: LAPLAPLA_VOICE_PARAMETERS.sampleRate });
  try {
    let processed = await context.decodeAudioData(await raw.arrayBuffer());
    if (settings.child) {
      const rate = LAPLAPLA_VOICE_PARAMETERS.child.playbackRate;
      const offline = new OfflineAudioContext(processed.numberOfChannels, Math.max(1, Math.ceil(processed.length / rate)), processed.sampleRate);
      const source = offline.createBufferSource();
      source.buffer = processed;
      source.playbackRate.value = rate;
      source.connect(offline.destination);
      source.start();
      processed = await offline.startRendering();
    }
    if (settings.enhance) processed = buildProcessedVoiceBuffer(processed, false);
    else if (settings.child) processed = buildProcessedVoiceBuffer(processed, true);
    if (settings.louder) {
      for (let channel = 0; channel < processed.numberOfChannels; channel += 1) {
        const samples = processed.getChannelData(channel);
        for (let index = 0; index < samples.length; index += 1) samples[index] = samples[index]! * LAPLAPLA_VOICE_PARAMETERS.louder.outputGain;
        applyLimiter(samples);
      }
    }
    return { blob: audioBufferToPcmWav(processed), durationMs: Math.round((processed.length / processed.sampleRate) * 1000) };
  } finally {
    await context.close().catch(() => undefined);
  }
}
