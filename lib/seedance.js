import { fal } from '@fal-ai/client';
import { File } from 'node:buffer';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { elapsedMs, logInfo, logWarn } from './logger';

const STANDARD_MODEL = 'bytedance/seedance-2.0/image-to-video';
const FAST_MODEL = 'bytedance/seedance-2.0/fast/image-to-video';
const LEGACY_BAD_MODEL = 'fal-ai/bytedance/seedance/v1/lite/image-to-video';
const DEFAULT_MODEL = FAST_MODEL;
const DEFAULT_DURATION = '7';
const DEFAULT_ASPECT_RATIO = '9:16';
const DEFAULT_RESOLUTION = '720p';

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`服务器缺少 ${name} 环境变量。`);
  return value;
}

function pickVideoUrl(payload) {
  return (
    payload?.video?.url ||
    payload?.video_url ||
    payload?.url ||
    payload?.output?.video?.url ||
    payload?.output?.video_url ||
    payload?.output?.url ||
    payload?.result?.video?.url ||
    payload?.result?.video_url ||
    payload?.result?.url ||
    payload?.result?.videos?.[0]?.url ||
    payload?.data?.video?.url ||
    payload?.data?.video_url ||
    payload?.data?.url ||
    payload?.data?.output?.video?.url ||
    payload?.data?.output?.video_url ||
    payload?.data?.result?.video?.url ||
    payload?.data?.result?.video_url ||
    payload?.data?.result?.videos?.[0]?.url
  );
}

function extensionFromMime(mimeType) {
  if (mimeType === 'image/png') return 'png';
  if (mimeType === 'image/webp') return 'webp';
  return 'jpg';
}

function envBoolean(name, fallback) {
  const value = process.env[name];
  if (value === undefined) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
}

function configuredModels() {
  const configured = process.env.FAL_SEEDANCE_MODEL || DEFAULT_MODEL;
  const normalized = configured === LEGACY_BAD_MODEL ? DEFAULT_MODEL : configured;
  const fallback = normalized === FAST_MODEL ? STANDARD_MODEL : FAST_MODEL;
  return Array.from(new Set([normalized, fallback]));
}

function isForbidden(error) {
  const message = error instanceof Error ? error.message : String(error);
  return /\b403\b|forbidden/i.test(message);
}

async function downloadVideo(videoUrl, outputPath) {
  const response = await fetch(videoUrl);
  if (!response.ok) throw new Error(`下载 Seedance 视频失败：HTTP ${response.status}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, buffer);
  return buffer.length;
}

async function runFalSeedance({ model, input, traceId }) {
  const startedAt = Date.now();
  try {
    logInfo(traceId, 'fal.subscribe.start', {
      model,
      duration: input.duration,
      aspect_ratio: input.aspect_ratio,
      resolution: input.resolution,
      generate_audio: input.generate_audio,
    });
    const result = await fal.subscribe(model, {
      input,
      logs: true,
    });
    logInfo(traceId, 'fal.subscribe.success', {
      model,
      request_id: result?.requestId || result?.request_id || null,
      elapsed_ms: elapsedMs(startedAt),
      has_video_url: Boolean(pickVideoUrl(result?.data || result)),
    });
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logWarn(traceId, 'fal.subscribe.failed', {
      model,
      elapsed_ms: elapsedMs(startedAt),
      message,
    });
    throw new Error(`fal.ai Seedance endpoint "${model}" failed: ${message}`);
  }
}

export async function generateSeedanceVideo({ prompt, imageBuffer, imageMimeType, jobName, traceId = jobName }) {
  const startedAt = Date.now();
  fal.config({ credentials: requiredEnv('FAL_KEY') });

  const duration = process.env.FAL_SEEDANCE_DURATION || DEFAULT_DURATION;
  const aspectRatio = process.env.FAL_SEEDANCE_ASPECT_RATIO || DEFAULT_ASPECT_RATIO;
  const resolution = process.env.FAL_SEEDANCE_RESOLUTION || DEFAULT_RESOLUTION;
  const generateAudio = envBoolean('FAL_SEEDANCE_GENERATE_AUDIO', false);
  const fileName = `product-reference.${extensionFromMime(imageMimeType)}`;

  logInfo(traceId, 'fal.storage.upload.start', {
    image_mime_type: imageMimeType,
    image_bytes: imageBuffer.length,
    file_name: fileName,
  });
  const uploadStartedAt = Date.now();
  const imageUrl = await fal.storage.upload(
    new File([imageBuffer], fileName, { type: imageMimeType }),
  );
  logInfo(traceId, 'fal.storage.upload.success', {
    elapsed_ms: elapsedMs(uploadStartedAt),
    image_url_host: new URL(imageUrl).hostname,
  });

  const input = {
    prompt,
    image_url: imageUrl,
    duration,
    aspect_ratio: aspectRatio,
    resolution,
    generate_audio: generateAudio,
  };

  let result;
  let usedModel;
  let lastError;
  for (const model of configuredModels()) {
    try {
      result = await runFalSeedance({ model, input, traceId });
      usedModel = model;
      break;
    } catch (error) {
      lastError = error;
      if (!isForbidden(error)) break;
      logWarn(traceId, 'fal.subscribe.fallback_after_forbidden', { model });
    }
  }

  if (!result) {
    const message = lastError instanceof Error ? lastError.message : String(lastError);
    throw new Error(`${message}。如果仍是 Forbidden，请确认 Render 的 FAL_KEY 是 fal.ai API key，账号已启用 billing/credits，并且该账号有 Seedance 2.0 模型访问权限。`);
  }

  const videoUrl = pickVideoUrl(result?.data || result);
  if (!videoUrl) {
    throw new Error(`fal.ai Seedance 没有返回视频 URL：${JSON.stringify(result).slice(0, 1200)}`);
  }

  const outputPath = path.join(process.cwd(), 'output', jobName, 'final.mp4');
  logInfo(traceId, 'seedance.video.download.start', {
    provider_model: usedModel,
    video_url_host: new URL(videoUrl).hostname,
  });
  const downloadStartedAt = Date.now();
  const bytes = await downloadVideo(videoUrl, outputPath);
  logInfo(traceId, 'seedance.video.download.success', {
    elapsed_ms: elapsedMs(downloadStartedAt),
    bytes,
    final_video_path: `output/${jobName}/final.mp4`,
  });

  logInfo(traceId, 'seedance.complete', {
    provider_model: usedModel,
    elapsed_ms: elapsedMs(startedAt),
  });

  return {
    task_id: result?.requestId || result?.request_id || null,
    generation_status: 'completed',
    provider: 'fal.ai',
    provider_model: usedModel,
    provider_video_url: videoUrl,
    final_video_path: `output/${jobName}/final.mp4`,
    final_video_url: `/api/download/${encodeURIComponent(jobName)}`,
    bytes,
    provider_response: result?.data || result,
  };
}
