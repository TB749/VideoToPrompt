import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const DEFAULT_API_BASE = 'https://ark.cn-beijing.volces.com/api/v3';
const DEFAULT_TASK_ENDPOINT = '/contents/generations/tasks';
const DEFAULT_MODEL = 'doubao-seedance-1-0-pro-250528';
const DEFAULT_DURATION_SECONDS = 7;
const DEFAULT_RATIO = '9:16';
const DEFAULT_RESOLUTION = '720p';

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`服务器缺少 ${name} 环境变量。`);
  return value;
}

function joinUrl(base, endpoint) {
  return `${base.replace(/\/+$/, '')}/${endpoint.replace(/^\/+/, '')}`;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function fileToDataUrl(buffer, mimeType) {
  return `data:${mimeType};base64,${buffer.toString('base64')}`;
}

function pickTaskId(payload) {
  return payload?.id || payload?.task_id || payload?.data?.id || payload?.data?.task_id;
}

function pickStatus(payload) {
  return String(payload?.status || payload?.data?.status || payload?.task_status || payload?.data?.task_status || '').toLowerCase();
}

function pickError(payload) {
  return payload?.error?.message || payload?.message || payload?.data?.error?.message || payload?.data?.message || 'Seedance 视频生成失败。';
}

function pickVideoUrl(payload) {
  return (
    payload?.video_url ||
    payload?.url ||
    payload?.output?.video_url ||
    payload?.output?.url ||
    payload?.result?.video_url ||
    payload?.result?.url ||
    payload?.result?.videos?.[0]?.url ||
    payload?.data?.video_url ||
    payload?.data?.url ||
    payload?.data?.content?.video_url ||
    payload?.data?.output?.video_url ||
    payload?.data?.result?.video_url ||
    payload?.data?.result?.videos?.[0]?.url ||
    payload?.content?.video_url
  );
}

async function seedanceFetch(url, options = {}) {
  const apiKey = requiredEnv('SEEDANCE_API_KEY');
  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });

  const text = await response.text();
  let payload = {};
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = { message: text };
    }
  }

  if (!response.ok) {
    throw new Error(`Seedance API ${response.status}: ${pickError(payload)}`);
  }

  return payload;
}

async function createSeedanceTask({ prompt, imageBuffer, imageMimeType }) {
  const apiBase = process.env.SEEDANCE_API_BASE || DEFAULT_API_BASE;
  const taskEndpoint = process.env.SEEDANCE_TASK_ENDPOINT || DEFAULT_TASK_ENDPOINT;
  const model = process.env.SEEDANCE_MODEL || DEFAULT_MODEL;
  const duration = Number(process.env.SEEDANCE_DURATION_SECONDS || DEFAULT_DURATION_SECONDS);
  const ratio = process.env.SEEDANCE_RATIO || DEFAULT_RATIO;
  const resolution = process.env.SEEDANCE_RESOLUTION || DEFAULT_RESOLUTION;
  const imageUrl = fileToDataUrl(imageBuffer, imageMimeType);

  const payload = {
    model,
    content: [
      { type: 'text', text: prompt },
      { type: 'image_url', image_url: { url: imageUrl } },
    ],
    duration,
    ratio,
    resolution,
  };

  const created = await seedanceFetch(joinUrl(apiBase, taskEndpoint), {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  const taskId = pickTaskId(created);
  if (!taskId) throw new Error(`Seedance API 没有返回任务 ID：${JSON.stringify(created).slice(0, 1200)}`);

  return { taskId, created };
}

async function pollSeedanceTask(taskId) {
  const apiBase = process.env.SEEDANCE_API_BASE || DEFAULT_API_BASE;
  const taskEndpoint = process.env.SEEDANCE_TASK_ENDPOINT || DEFAULT_TASK_ENDPOINT;
  const intervalMs = Number(process.env.SEEDANCE_POLL_INTERVAL_MS || 5000);
  const maxPolls = Number(process.env.SEEDANCE_MAX_POLLS || 72);
  const taskUrl = `${joinUrl(apiBase, taskEndpoint)}/${encodeURIComponent(taskId)}`;

  for (let attempt = 0; attempt < maxPolls; attempt += 1) {
    const payload = await seedanceFetch(taskUrl);
    const videoUrl = pickVideoUrl(payload);
    if (videoUrl) return { videoUrl, payload };

    const status = pickStatus(payload);
    if (['failed', 'error', 'cancelled', 'canceled'].includes(status)) {
      throw new Error(pickError(payload));
    }

    await sleep(intervalMs);
  }

  throw new Error('Seedance 视频生成超时。请稍后重试，或在 Render 日志中查看 Seedance 任务状态。');
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
  const { taskId } = await createSeedanceTask({ prompt, imageBuffer, imageMimeType });
  const { videoUrl, payload } = await pollSeedanceTask(taskId);
  const outputPath = path.join(process.cwd(), 'output', jobName, 'final.mp4');
  const bytes = await downloadVideo(videoUrl, outputPath);

  return {
    task_id: taskId,
    generation_status: 'completed',
    provider_video_url: videoUrl,
    final_video_path: `output/${jobName}/final.mp4`,
    final_video_url: `/api/download/${encodeURIComponent(jobName)}`,
    bytes,
    provider_response: payload,
  };
}
