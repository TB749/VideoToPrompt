import { NextResponse } from 'next/server';
import { GoogleGenAI, createPartFromUri, createUserContent } from '@google/genai';
import { Resend } from 'resend';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdtemp, readdir, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  BREAKDOWN_PROMPT,
  BREAKDOWN_SCHEMA,
  PRODUCTION_SCHEMA,
  STORYBOARD_ONLY_SCHEMA,
  buildProductionPrompt,
  buildProductionRepairPrompt,
  buildStoryboardRepairPrompt,
  fallbackBreakdown,
  normalizeBreakdown,
  normalizeProduction,
  parseGeminiJson,
} from '../../../lib/analysis';
import { analysisEmailHtml, analysisEmailText } from '../../../lib/email';
import { elapsedMs, logError, logInfo, logWarn } from '../../../lib/logger';
import { generateSeedanceVideo } from '../../../lib/seedance';

export const runtime = 'nodejs';
export const maxDuration = 600;

const MAX_VIDEO_BYTES = 100 * 1024 * 1024;
const MAX_DURATION_SECONDS = 300;
const MAX_PRODUCT_IMAGE_BYTES = 10 * 1024 * 1024;
const IMAGE_EXTENSIONS = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};
const EMAIL_RECIPIENT = process.env.RESULT_RECIPIENT || 'epict5036@gmail.com';

function safeTikTokUrl(rawUrl) {
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return false;
  }
  if (parsed.protocol !== 'https:') return false;
  const host = parsed.hostname.toLowerCase();
  return host === 'tiktok.com' || host.endsWith('.tiktok.com');
}

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`服务器缺少 ${name} 环境变量。`);
  return value;
}

function getTextField(formData, name, maxLength = 500) {
  const value = formData.get(name);
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

function isUpload(value) {
  return Boolean(value && typeof value === 'object' && typeof value.arrayBuffer === 'function' && typeof value.type === 'string');
}

function run(command, args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, shell: false });
    let output = '';
    child.stdout.on('data', (chunk) => { output += chunk.toString(); });
    child.stderr.on('data', (chunk) => { output += chunk.toString(); });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) return resolve(output);
      reject(new Error(`下载失败（yt-dlp exit ${code}）：${output.slice(-1200)}`));
    });
  });
}

async function downloadVideo(url, jobDir) {
  const outputTemplate = path.join(jobDir, 'source.%(ext)s');
  await run('yt-dlp', [
    '--no-playlist',
    '--no-warnings',
    '--restrict-filenames',
    '--max-filesize', '100M',
    '--match-filter', `duration < ${MAX_DURATION_SECONDS + 1}`,
    '--format', 'mp4/best[ext=mp4]/best',
    '--merge-output-format', 'mp4',
    '--output', outputTemplate,
    url,
  ], jobDir);

  const files = await readdir(jobDir);
  const name = files.find((entry) => /\.(mp4|m4v|webm|mov)$/i.test(entry));
  if (!name) throw new Error('下载完成后没有找到可用视频文件。');
  const videoPath = path.join(jobDir, name);
  const fileStat = await stat(videoPath);
  if (fileStat.size > MAX_VIDEO_BYTES) throw new Error('视频超过 100 MB 限制。请使用更短或更低分辨率的授权视频。');
  return videoPath;
}

async function saveProductImage(upload, jobDir) {
  if (!isUpload(upload) || !upload.size) throw new Error('请上传产品参考图片。');
  if (!IMAGE_EXTENSIONS[upload.type]) throw new Error('产品参考图片仅支持 JPG、PNG 或 WebP。');
  if (upload.size > MAX_PRODUCT_IMAGE_BYTES) throw new Error('产品参考图片超过 10 MB 限制。请压缩后重试。');
  const imagePath = path.join(jobDir, `product-reference.${IMAGE_EXTENSIONS[upload.type]}`);
  const imageBuffer = Buffer.from(await upload.arrayBuffer());
  await writeFile(imagePath, imageBuffer);
  return { imagePath, imageBuffer, mimeType: upload.type };
}

async function waitUntilActive(ai, file, kind = '文件') {
  let current = file;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (!current.state || current.state === 'ACTIVE') return current;
    if (current.state === 'FAILED') throw new Error(`Gemini 无法处理此${kind}。`);
    await new Promise((resolve) => setTimeout(resolve, 1500));
    current = await ai.files.get({ name: current.name });
  }
  throw new Error(`Gemini ${kind}预处理超时。请使用更小的文件后重试。`);
}

function responseDiagnostics(response) {
  const candidate = response?.candidates?.[0];
  return JSON.stringify({
    finishReason: candidate?.finishReason || null,
    finishMessage: candidate?.finishMessage || null,
    safetyRatings: candidate?.safetyRatings || null,
    promptFeedback: response?.promptFeedback || null,
  }).slice(0, 1800);
}

export async function POST(request) {
  const traceId = randomUUID().slice(0, 8);
  const requestStartedAt = Date.now();
  let jobDir;
  const uploadedFiles = [];

  try {
    logInfo(traceId, 'request.start');
    const formData = await request.formData();
    const url = getTextField(formData, 'url', 2000);
    const accessCode = getTextField(formData, 'accessCode', 500);
    const creativeBrief = getTextField(formData, 'creativeBrief', 500);
    const authorized = getTextField(formData, 'authorized', 20) === 'true';
    const productImage = formData.get('productImage');
    logInfo(traceId, 'request.form_parsed', {
      has_url: Boolean(url),
      has_product_image: Boolean(productImage),
      product_image_type: productImage?.type || null,
      product_image_size: productImage?.size || null,
      creative_brief_chars: creativeBrief.length,
      authorized,
    });

    if (!authorized) return NextResponse.json({ error: '必须确认你拥有该视频或已获得明确授权。' }, { status: 400 });
    if (!safeTikTokUrl(url)) return NextResponse.json({ error: '请输入一个有效的 HTTPS TikTok 视频链接。' }, { status: 400 });
    if (process.env.APP_PASSWORD && accessCode !== process.env.APP_PASSWORD) {
      return NextResponse.json({ error: '私人工具访问码不正确。' }, { status: 401 });
    }

    const geminiApiKey = requiredEnv('GEMINI_API_KEY');
    requiredEnv('FAL_KEY');
    const resendApiKey = requiredEnv('RESEND_API_KEY');
    const emailFrom = requiredEnv('EMAIL_FROM');
    logInfo(traceId, 'env.validated', {
      gemini_model: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
      fal_seedance_model: process.env.FAL_SEEDANCE_MODEL || 'default',
      fal_seedance_duration: process.env.FAL_SEEDANCE_DURATION || '7',
      result_recipient: EMAIL_RECIPIENT,
    });

    jobDir = await mkdtemp(path.join(os.tmpdir(), 'tiktok-gemini-'));
    logInfo(traceId, 'workspace.created', { job_dir: jobDir });

    logInfo(traceId, 'input.prepare.start');
    const prepareStartedAt = Date.now();
    const [{ imagePath, imageBuffer, mimeType: imageMimeType }, videoPath] = await Promise.all([
      saveProductImage(productImage, jobDir),
      downloadVideo(url, jobDir),
    ]);
    const videoStat = await stat(videoPath);
    logInfo(traceId, 'input.prepare.success', {
      elapsed_ms: elapsedMs(prepareStartedAt),
      image_mime_type: imageMimeType,
      image_bytes: imageBuffer.length,
      video_bytes: videoStat.size,
    });

    const ai = new GoogleGenAI({ apiKey: geminiApiKey });
    logInfo(traceId, 'gemini.upload.video.start', { video_bytes: videoStat.size });
    const geminiVideoUploadStartedAt = Date.now();
    const initialUploadedVideo = await ai.files.upload({
      file: videoPath,
      config: { mimeType: 'video/mp4', displayName: 'authorized-tiktok-video.mp4' },
    });
    uploadedFiles.push(initialUploadedVideo);
    const uploadedVideo = await waitUntilActive(ai, initialUploadedVideo, '视频');
    logInfo(traceId, 'gemini.upload.video.success', {
      elapsed_ms: elapsedMs(geminiVideoUploadStartedAt),
      file_name: uploadedVideo.name,
      state: uploadedVideo.state || 'ACTIVE',
    });

    logInfo(traceId, 'gemini.upload.image.start', { image_mime_type: imageMimeType, image_bytes: imageBuffer.length });
    const geminiImageUploadStartedAt = Date.now();
    const initialUploadedProductImage = await ai.files.upload({
      file: imagePath,
      config: { mimeType: imageMimeType, displayName: 'product-reference-image' },
    });
    uploadedFiles.push(initialUploadedProductImage);
    const uploadedProductImage = await waitUntilActive(ai, initialUploadedProductImage, '产品参考图片');
    logInfo(traceId, 'gemini.upload.image.success', {
      elapsed_ms: elapsedMs(geminiImageUploadStartedAt),
      file_name: uploadedProductImage.name,
      state: uploadedProductImage.state || 'ACTIVE',
    });

    const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
    const mediaParts = [
      createPartFromUri(uploadedVideo.uri, uploadedVideo.mimeType),
      createPartFromUri(uploadedProductImage.uri, uploadedProductImage.mimeType),
    ];

    async function generateJson({ instruction, schema, temperature, label }) {
      const startedAt = Date.now();
      logInfo(traceId, 'gemini.generate.start', { label, temperature, model });
      const response = await ai.models.generateContent({
        model,
        contents: createUserContent([...mediaParts, instruction]),
        config: {
          responseFormat: { text: { mimeType: 'application/json', schema } },
          temperature,
          maxOutputTokens: 8192,
        },
      });
      const raw = response.text || '';
      logInfo(traceId, 'gemini.generate.response', {
        label,
        elapsed_ms: elapsedMs(startedAt),
        chars: raw.length,
        finish_reason: response?.candidates?.[0]?.finishReason || null,
      });
      if (!raw.trim()) {
        const diagnostic = responseDiagnostics(response);
        logError(traceId, 'gemini.generate.empty', { label, diagnostic });
        throw new Error(`${label} 未返回文本。Gemini 诊断：${diagnostic}`);
      }
      return raw;
    }

    // Breakdown is useful, but never allowed to prevent a finished Seedance
    // package from being delivered. The production task has its own compact
    // schema and independent repair path below.
    let breakdown = fallbackBreakdown();
    try {
      const rawBreakdown = await generateJson({
        instruction: BREAKDOWN_PROMPT,
        schema: BREAKDOWN_SCHEMA,
        temperature: 0.1,
        label: 'Gemini video breakdown',
      });
      breakdown = normalizeBreakdown(parseGeminiJson(rawBreakdown));
    } catch (breakdownError) {
      logWarn(traceId, 'gemini.breakdown.fallback_used', breakdownError);
    }

    let production;
    let firstRaw = '';
    let firstFailure = '';
    try {
      firstRaw = await generateJson({
        instruction: buildProductionPrompt(creativeBrief),
        schema: PRODUCTION_SCHEMA,
        temperature: 0.2,
        label: 'Gemini Seedance production package',
      });
      production = normalizeProduction(parseGeminiJson(firstRaw));
      logInfo(traceId, 'gemini.production.normalized', {
        prompt_chars: production.seedance_2_prompt.length,
        shot_count: production.shot_plan.length,
      });
    } catch (firstError) {
      firstFailure = firstError instanceof Error ? firstError.message : '第一次制作包生成失败。';
      logWarn(traceId, 'gemini.production.first_attempt_failed', {
        message: firstFailure,
        raw_chars: firstRaw.length,
        raw_preview: firstRaw.slice(0, 1000),
      });

      try {
        const repairRaw = await generateJson({
          instruction: buildProductionRepairPrompt({
            creativeBrief,
            validationError: firstFailure,
            priorResponse: firstRaw,
          }),
          schema: PRODUCTION_SCHEMA,
          temperature: 0.05,
          label: 'Gemini Seedance production repair',
        });
        production = normalizeProduction(parseGeminiJson(repairRaw));
      } catch (repairError) {
        const repairFailure = repairError instanceof Error ? repairError.message : '第二次制作包生成失败。';
        logError(traceId, 'gemini.production.repair_failed', { message: repairFailure });

        // A final, very small recovery path. This prevents a complete
        // production package from failing solely because the model dropped
        // storyboard fields during an otherwise usable output.
        try {
          const partial = parseGeminiJson(firstRaw);
          const repairedShotsRaw = await generateJson({
            instruction: buildStoryboardRepairPrompt({
              production: partial,
              validationError: `${firstFailure}；${repairFailure}`,
            }),
            schema: STORYBOARD_ONLY_SCHEMA,
            temperature: 0.05,
            label: 'Gemini storyboard-only repair',
          });
          const repairedShots = parseGeminiJson(repairedShotsRaw);
          production = normalizeProduction({ ...partial, shot_plan: repairedShots.shot_plan });
        } catch (storyboardError) {
          const message = storyboardError instanceof Error ? storyboardError.message : '最终分镜修复失败。';
          logError(traceId, 'gemini.production.storyboard_repair_failed', { message });
          throw new Error('Gemini 未能生成完整的 Seedance 制作包。请稍后再次提交；若持续失败，请在 Render 日志中复制 “Gemini Seedance production package” 或 “Gemini first structured-output attempt failed” 后面的诊断内容。');
        }
      }
    }

    const jobName = randomUUID();
    logInfo(traceId, 'seedance.start', {
      job_name: jobName,
      prompt_chars: production.seedance_2_prompt.length,
    });
    const seedance = await generateSeedanceVideo({
      prompt: production.seedance_2_prompt,
      imageBuffer,
      imageMimeType,
      jobName,
      traceId,
    });
    logInfo(traceId, 'seedance.success', {
      provider: seedance.provider,
      provider_model: seedance.provider_model,
      task_id: seedance.task_id,
      bytes: seedance.bytes,
      final_video_url: seedance.final_video_url,
    });

    const analysis = { ...breakdown, video_prompt: production };
    const resend = new Resend(resendApiKey);
    logInfo(traceId, 'email.send.start', { recipient: EMAIL_RECIPIENT });
    const emailStartedAt = Date.now();
    const { data, error } = await resend.emails.send({
      from: emailFrom,
      to: [EMAIL_RECIPIENT],
      subject: `TikTok 中文拆解｜${analysis.title}`,
      html: analysisEmailHtml({ sourceUrl: url, analysis }),
      text: analysisEmailText({ sourceUrl: url, analysis }),
    });
    if (error) throw new Error(`邮件发送失败：${error.message}`);
    logInfo(traceId, 'email.send.success', {
      elapsed_ms: elapsedMs(emailStartedAt),
      email_id: data?.id || null,
    });

    logInfo(traceId, 'request.success', {
      elapsed_ms: elapsedMs(requestStartedAt),
      job_name: jobName,
    });
    return NextResponse.json({
      ok: true,
      analysis,
      seedance,
      emailId: data?.id || null,
      recipient: EMAIL_RECIPIENT,
    });
  } catch (error) {
    logError(traceId, 'request.error', {
      elapsed_ms: elapsedMs(requestStartedAt),
      error,
    });
    const message = error instanceof Error ? error.message : '服务器发生未知错误。';
    return NextResponse.json({ error: message }, { status: 500 });
  } finally {
    if (uploadedFiles.length && process.env.GEMINI_API_KEY) {
      const cleanupAi = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const cleanupResults = await Promise.allSettled(uploadedFiles.map(async (file) => {
        if (file?.name) await cleanupAi.files.delete({ name: file.name });
      }));
      logInfo(traceId, 'gemini.cleanup.complete', {
        attempted: uploadedFiles.length,
        fulfilled: cleanupResults.filter((result) => result.status === 'fulfilled').length,
        rejected: cleanupResults.filter((result) => result.status === 'rejected').length,
      });
    }
    if (jobDir) {
      try {
        await rm(jobDir, { recursive: true, force: true });
        logInfo(traceId, 'workspace.cleanup.complete', { job_dir: jobDir });
      } catch (cleanupError) {
        logWarn(traceId, 'workspace.cleanup.failed', cleanupError);
      }
    }
  }
}
