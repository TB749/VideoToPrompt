import { fal } from '@fal-ai/client';
import { File } from 'node:buffer';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const DEFAULT_MODEL = 'fal-ai/bytedance/seedance/v1/lite/image-to-video';
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

async function downloadVideo(videoUrl, outputPath) {
  const response = await fetch(videoUrl);
  if (!response.ok) throw new Error(`下载 Seedance 视频失败：HTTP ${response.status}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, buffer);
  return buffer.length;
}

export async function generateSeedanceVideo({ prompt, imageBuffer, imageMimeType, jobName }) {
  fal.config({ credentials: requiredEnv('FAL_KEY') });

  const model = process.env.FAL_SEEDANCE_MODEL || DEFAULT_MODEL;
  const duration = process.env.FAL_SEEDANCE_DURATION || DEFAULT_DURATION;
  const aspectRatio = process.env.FAL_SEEDANCE_ASPECT_RATIO || DEFAULT_ASPECT_RATIO;
  const resolution = process.env.FAL_SEEDANCE_RESOLUTION || DEFAULT_RESOLUTION;
  const fileName = `product-reference.${extensionFromMime(imageMimeType)}`;

  const imageUrl = await fal.storage.upload(
    new File([imageBuffer], fileName, { type: imageMimeType }),
  );

  const result = await fal.subscribe(model, {
    input: {
      prompt,
      image_url: imageUrl,
      duration,
      aspect_ratio: aspectRatio,
      resolution,
    },
    logs: true,
  });

  const videoUrl = pickVideoUrl(result?.data || result);
  if (!videoUrl) {
    throw new Error(`fal.ai Seedance 没有返回视频 URL：${JSON.stringify(result).slice(0, 1200)}`);
  }

  const outputPath = path.join(process.cwd(), 'output', jobName, 'final.mp4');
  const bytes = await downloadVideo(videoUrl, outputPath);

  return {
    task_id: result?.requestId || result?.request_id || null,
    generation_status: 'completed',
    provider: 'fal.ai',
    provider_video_url: videoUrl,
    final_video_path: `output/${jobName}/final.mp4`,
    final_video_url: `/api/download/${encodeURIComponent(jobName)}`,
    bytes,
    provider_response: result?.data || result,
  };
}
