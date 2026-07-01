"use client";

import { FormEvent, useState } from "react";

type ShotPlanItem = {
  timecode: string;
  visual_prompt: string;
  camera_and_editing: string;
};

type BreakdownItem = {
  timecode: string;
  role: string;
  visual: string;
  message: string;
  editing: string;
};

type AnalysisResult = {
  analysis: {
    title: string;
    one_line_summary: string;
    hook: string;
    structure: string;
    estimated_duration_seconds: number;
    short_breakdown: BreakdownItem[];
    video_prompt: {
      seedance_2_prompt: string;
      shot_plan: ShotPlanItem[];
      full_english_voiceover: string;
    };
  };
  seedance?: {
    provider_upload?: string;
    generation_status?: string;
    final_video_path?: string;
    final_video_url?: string;
  };
};

function SeedancePrompt({ prompt }: { prompt: AnalysisResult["analysis"]["video_prompt"] }) {
  return (
    <>
      <h4>可直接复制的 Seedance 2.0 中文提示词</h4>
      <p className="referenceNote">
        每个画面提示词都已以产品参考图指令开头。生成时会把同一张产品图片上传给 Seedance provider。
      </p>
      <pre className="copyPrompt">{prompt.seedance_2_prompt}</pre>

      <h4>7 秒无文字、无旁白分镜</h4>
      <div className="shotPlan">
        {prompt.shot_plan.map((item, index) => (
          <article className="shotItem" key={`${item.timecode}-${index}`}>
            <div className="timecode">{item.timecode}</div>
            <div>
              <p>
                <b>画面：</b>
                {item.visual_prompt}
              </p>
              <p>
                <b>镜头与剪辑：</b>
                {item.camera_and_editing}
              </p>
            </div>
          </article>
        ))}
      </div>

      <h4>独立后期英文旁白（约 7 秒）</h4>
      <p className="voiceover">{prompt.full_english_voiceover}</p>
    </>
  );
}

function ResultPanel({ result }: { result: AnalysisResult }) {
  const analysis = result.analysis;

  return (
    <section className="result" aria-live="polite">
      <div className="resultHeader">
        <div>
          <p className="eyebrow">Gemini + Seedance 流程完成</p>
          <h2>{analysis.title}</h2>
        </div>
        <span className="badge">MP4 已生成</span>
      </div>

      <p className="summary">{analysis.one_line_summary}</p>

      <div className="infoGrid">
        <article>
          <span>开头钩子</span>
          <strong>{analysis.hook}</strong>
        </article>
        <article>
          <span>内容结构</span>
          <strong>{analysis.structure}</strong>
        </article>
        <article>
          <span>时长估计</span>
          <strong>
            {analysis.estimated_duration_seconds > 0
              ? `${analysis.estimated_duration_seconds} 秒`
              : "未识别"}
          </strong>
        </article>
      </div>

      {result.seedance && (
        <div className="outputGrid">
          <article>
            <span>Seedance 图片上传</span>
            <strong>{result.seedance.provider_upload || "已上传同一张产品图"}</strong>
          </article>
          <article>
            <span>7 秒 9:16 视频生成</span>
            <strong>{result.seedance.generation_status || "Seedance 2.0 已完成"}</strong>
          </article>
          <article>
            <span>本地输出</span>
            <strong>{result.seedance.final_video_path || "output/<job-name>/final.mp4"}</strong>
          </article>
        </div>
      )}

      <h3>短视频拆解</h3>
      <div className="breakdownList">
        {analysis.short_breakdown.map((item, index) => (
          <article className="breakdownItem" key={`${item.timecode}-${index}`}>
            <div className="timecode">{item.timecode}</div>
            <div>
              <h4>{item.role}</h4>
              <p>
                <b>画面：</b>
                {item.visual}
              </p>
              <p>
                <b>信息：</b>
                {item.message}
              </p>
              <p>
                <b>剪辑：</b>
                {item.editing}
              </p>
            </div>
          </article>
        ))}
      </div>

      <h3>可执行的 Seedance 2.0 原创 7 秒创作包</h3>
      <div className="promptBox">
        <SeedancePrompt prompt={analysis.video_prompt} />
      </div>

      {result.seedance?.final_video_url && (
        <p className="downloadLink">
          <a href={result.seedance.final_video_url} download>
            下载 final.mp4
          </a>
        </p>
      )}

      <details>
        <summary>查看原始 JSON</summary>
        <pre>{JSON.stringify(analysis, null, 2)}</pre>
      </details>
    </section>
  );
}

const workflowSteps = [
  "1. TikTok URL",
  "2. 产品图",
  "3. Render VideoToPrompt API",
  "4. 中文 Seedance master prompt",
  "5. 上传产品图到 Seedance",
  "6. 生成 7 秒 9:16 视频",
  "7. 下载 final.mp4",
  "8. output/<job-name>/final.mp4",
];

export default function Home() {
  const [url, setUrl] = useState("");
  const [productImage, setProductImage] = useState<File | null>(null);
  const [creativeBrief, setCreativeBrief] = useState("");
  const [accessCode, setAccessCode] = useState("");
  const [authorized, setAuthorized] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setResult(null);

    if (!productImage) {
      setError("请先上传产品参考图片。");
      return;
    }

    if (!authorized) {
      setError("请先确认你拥有该视频，或已获得使用与分析授权。");
      return;
    }

    setIsSubmitting(true);
    setStatus("正在提交到 Render VideoToPrompt API，上传产品图并下载授权 TikTok 视频...");

    try {
      const formData = new FormData();
      formData.append("url", url);
      formData.append("productImage", productImage);
      formData.append("creativeBrief", creativeBrief);
      formData.append("accessCode", accessCode);
      formData.append("authorized", String(authorized));

      const response = await fetch("/api/analyze", {
        method: "POST",
        body: formData,
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "处理失败。");
      }

      setStatus("Seedance 2.0 7 秒 9:16 视频已生成，final.mp4 已下载到 output/<job-name>/final.mp4。");
      setResult(data);
    } catch (caughtError) {
      setStatus("");
      setError(caughtError instanceof Error ? caughtError.message : "发生未知错误。");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main>
      <section className="hero">
        <p className="eyebrow">PRIVATE CREATOR TOOL</p>
        <h1>TikTok 视频 → Seedance 2.0 7 秒 MP4</h1>
        <p className="lead">
          输入一个 TikTok 链接并上传产品参考图。系统通过 Render VideoToPrompt API 提取参考视频机制，生成中文
          Seedance master prompt，上传同一张产品图到 Seedance provider，生成 7 秒 9:16 视频，并把最终 MP4
          下载到 Codex sandbox 的 output/&lt;job-name&gt;/final.mp4。
        </p>
      </section>

      <section className="card">
        <form onSubmit={handleSubmit}>
          <label htmlFor="url">TikTok 视频 URL</label>
          <input
            id="url"
            type="url"
            placeholder="https://www.tiktok.com/@creator/video/..."
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            required
            disabled={isSubmitting}
          />

          <label htmlFor="productImage">
            产品参考图片 <span>（必填：JPG、PNG 或 WebP，最大 10 MB）</span>
          </label>
          <input
            id="productImage"
            className="fileInput"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={(event) => setProductImage(event.target.files?.[0] || null)}
            required
            disabled={isSubmitting}
          />
          <p className="fileHint">
            {productImage
              ? `已选择：${productImage.name}`
              : "这张图会发送给 Gemini，并会作为同一张产品参考图上传到 Seedance provider。"}
          </p>

          <label htmlFor="creativeBrief">
            可选：你的产品、服务或创作主题 <span>（推荐填写，可让 7 秒视频更贴近你的业务）</span>
          </label>
          <textarea
            id="creativeBrief"
            placeholder="例如：为多伦多小企业的网页设计服务制作 7 秒 TikTok 视频，目标是吸引他们预约免费咨询。"
            value={creativeBrief}
            onChange={(event) => setCreativeBrief(event.target.value.slice(0, 500))}
            maxLength={500}
            disabled={isSubmitting}
          />

          <label htmlFor="accessCode">
            私人工具访问码 <span>（部署时设置 APP_PASSWORD 后必填）</span>
          </label>
          <input
            id="accessCode"
            type="password"
            placeholder="你的私密访问码"
            value={accessCode}
            onChange={(event) => setAccessCode(event.target.value)}
            disabled={isSubmitting}
          />

          <label className="consent" htmlFor="authorized">
            <input
              id="authorized"
              type="checkbox"
              checked={authorized}
              onChange={(event) => setAuthorized(event.target.checked)}
              disabled={isSubmitting}
            />
            <span>我确认我拥有此视频，或已获得下载、分析、生成与使用的明确授权。</span>
          </label>

          <button type="submit" disabled={isSubmitting}>
            {isSubmitting ? "正在生成 final.mp4..." : "生成 Seedance 2.0 7 秒 MP4"}
          </button>
        </form>

        <div className="workflow" aria-label="处理流程">
          {workflowSteps.map((step, index) => (
            <span className="workflowItem" key={step}>
              {step}
              {index < workflowSteps.length - 1 && <i>→</i>}
            </span>
          ))}
        </div>

        {status && <p className="status">{status}</p>}
        {error && <p className="error">{error}</p>}
      </section>

      {result && <ResultPanel result={result} />}

      <p className="footnote">
        视频与产品参考图仅在处理期间保存在服务器临时目录。最终 MP4 会保留在 output/&lt;job-name&gt;/final.mp4；
        临时下载文件和 Gemini 临时文件会在请求结束时清理。
      </p>
    </main>
  );
}
