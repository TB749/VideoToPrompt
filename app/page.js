'use client';

import { useState } from 'react';

function PromptProductionView({ prompt }) {
  return (
    <>
      <h4>可直接复制的 Seedance 2.0 中文提示词</h4>
      <p className="referenceNote">每个画面提示词都已以产品参考图指令开头。粘贴到 Seedance 时，请同时附上同一张产品图片。</p>
      <pre className="copyPrompt">{prompt.seedance_2_prompt}</pre>

      <h4>7 秒无文字、无旁白分镜</h4>
      <div className="shotPlan">
        {prompt.shot_plan.map((shot, index) => (
          <article className="shotItem" key={`${shot.timecode}-${index}`}>
            <div className="timecode">{shot.timecode}</div>
            <div>
              <p><b>画面：</b>{shot.visual_prompt}</p>
              <p><b>镜头与剪辑：</b>{shot.camera_and_editing}</p>
            </div>
          </article>
        ))}
      </div>

      <h4>独立后期英文旁白（约 7 秒）</h4>
      <p className="voiceover">{prompt.full_english_voiceover}</p>
    </>
  );
}

function DownloadPanel({ seedance }) {
  if (!seedance?.final_video_url) return null;

  return (
    <section className="downloadPanel" aria-label="Seedance 视频下载">
      <div>
        <p className="eyebrow">SEEDANCE MP4 READY</p>
        <h2>final.mp4 已生成</h2>
        <p>{seedance.final_video_path || 'output/<job>/final.mp4'}</p>
      </div>
      <a className="downloadButton" href={seedance.final_video_url} download>
        下载 final.mp4
      </a>
    </section>
  );
}

function BreakdownView({ result }) {
  const data = result.analysis;
  const seedance = result.seedance;

  return (
    <section className="result" aria-live="polite">
      <div className="resultHeader">
        <div>
          <p className="eyebrow">Gemini + Seedance 流程完成</p>
          <h2>{data.title}</h2>
        </div>
        <span className="badge">MP4 已生成</span>
      </div>

      <p className="summary">{data.one_line_summary}</p>

      <div className="infoGrid">
        <article>
          <span>开头钩子</span>
          <strong>{data.hook}</strong>
        </article>
        <article>
          <span>内容结构</span>
          <strong>{data.structure}</strong>
        </article>
        <article>
          <span>时长估计</span>
          <strong>{data.estimated_duration_seconds > 0 ? `${data.estimated_duration_seconds} 秒` : '未识别'}</strong>
        </article>
      </div>

      <h3>短视频拆解</h3>
      <div className="breakdownList">
        {data.short_breakdown.map((item, index) => (
          <article className="breakdownItem" key={`${item.timecode}-${index}`}>
            <div className="timecode">{item.timecode}</div>
            <div>
              <h4>{item.role}</h4>
              <p><b>画面：</b>{item.visual}</p>
              <p><b>信息：</b>{item.message}</p>
              <p><b>剪辑：</b>{item.editing}</p>
            </div>
          </article>
        ))}
      </div>

      <h3>可执行的 Seedance 2.0 原创 7 秒创作包</h3>
      <div className="promptBox">
        <PromptProductionView prompt={data.video_prompt} />
      </div>

      {seedance && (
        <div className="outputGrid">
          <article>
            <span>Seedance 任务</span>
            <strong>{seedance.task_id || '已提交'}</strong>
          </article>
          <article>
            <span>视频生成</span>
            <strong>{seedance.generation_status || 'completed'}</strong>
          </article>
          <article>
            <span>本地输出</span>
            <strong>{seedance.final_video_path || 'output/<job>/final.mp4'}</strong>
          </article>
        </div>
      )}

      {seedance?.final_video_url && (
        <>
          <video className="videoPreview" controls src={seedance.final_video_url}>
            <a href={seedance.final_video_url} download>下载 final.mp4</a>
          </video>
          <p className="downloadLink">
            <a href={seedance.final_video_url} download>
              下载 Seedance final.mp4
            </a>
          </p>
        </>
      )}

      <details>
        <summary>查看原始 JSON</summary>
        <pre>{JSON.stringify(result, null, 2)}</pre>
      </details>
    </section>
  );
}

export default function Home() {
  const [url, setUrl] = useState('');
  const [productImage, setProductImage] = useState(null);
  const [creativeBrief, setCreativeBrief] = useState('');
  const [accessCode, setAccessCode] = useState('');
  const [authorized, setAuthorized] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');
    setResult(null);

    if (!productImage) {
      setError('请先上传产品参考图片。');
      return;
    }
    if (!authorized) {
      setError('请先确认你拥有该视频，或已获得使用与分析授权。');
      return;
    }

    setIsLoading(true);
    setStatus('正在上传产品参考图片、下载授权视频并生成 Seedance MP4…');

    try {
      const body = new FormData();
      body.append('url', url);
      body.append('productImage', productImage);
      body.append('creativeBrief', creativeBrief);
      body.append('accessCode', accessCode);
      body.append('authorized', String(authorized));

      const response = await fetch('/api/analyze', {
        method: 'POST',
        body,
      });

      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || '处理失败。');

      setStatus('Seedance 视频已生成，final.mp4 可以下载。');
      setResult(payload);
    } catch (err) {
      setStatus('');
      setError(err instanceof Error ? err.message : '发生未知错误。');
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <main>
      <section className="hero">
        <p className="eyebrow">PRIVATE CREATOR TOOL</p>
        <h1>TikTok 视频 → Seedance 2.0 7 秒创作包</h1>
        <p className="lead">
          输入一个 TikTok 链接并上传产品参考图。系统从参考视频提取内容机制，生成 Seedance 2.0 中文提示词，自动调用 Seedance API 生成 7 秒 9:16 MP4，并在页面提供下载。
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
            disabled={isLoading}
          />

          <label htmlFor="productImage">产品参考图片 <span>（必填：JPG、PNG 或 WebP，最大 10 MB）</span></label>
          <input
            id="productImage"
            className="fileInput"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={(event) => setProductImage(event.target.files?.[0] || null)}
            required
            disabled={isLoading}
          />
          <p className="fileHint">
            {productImage ? `已选择：${productImage.name}` : '这张图会发送给 Gemini，作为产品外观、颜色、材质和包装细节的参考。'}
          </p>

          <label htmlFor="creativeBrief">可选：你的产品、服务或创作主题 <span>（推荐填写，可让 7 秒提示词更贴近你的业务）</span></label>
          <textarea
            id="creativeBrief"
            placeholder="例如：为多伦多小企业的网页设计服务制作 7 秒 TikTok 视频，目标是吸引他们预约免费咨询。"
            value={creativeBrief}
            onChange={(event) => setCreativeBrief(event.target.value.slice(0, 500))}
            maxLength={500}
            disabled={isLoading}
          />

          <label htmlFor="accessCode">私人工具访问码 <span>（部署时设置 APP_PASSWORD 后必填）</span></label>
          <input
            id="accessCode"
            type="password"
            placeholder="你的私密访问码"
            value={accessCode}
            onChange={(event) => setAccessCode(event.target.value)}
            disabled={isLoading}
          />

          <label className="consent" htmlFor="authorized">
            <input
              id="authorized"
              type="checkbox"
              checked={authorized}
              onChange={(event) => setAuthorized(event.target.checked)}
              disabled={isLoading}
            />
            <span>我确认我拥有此视频，或已获得下载、分析与使用的明确授权。</span>
          </label>

          <button type="submit" disabled={isLoading}>
            {isLoading ? '正在生成 final.mp4…' : '生成 Seedance 2.0 7 秒 MP4'}
          </button>
        </form>

        <div className="workflow" aria-label="处理流程">
          <span>1. 链接</span><i>→</i><span>2. 产品图</span><i>→</i><span>3. 授权下载</span><i>→</i><span>4. Gemini 分析</span><i>→</i><span>5. Seedance 生成 MP4 + 下载</span>
        </div>

        {status && <p className="status">{status}</p>}
        {error && <p className="error">{error}</p>}
      </section>

      <DownloadPanel seedance={result?.seedance} />

      {result && <BreakdownView result={result} />}

      <p className="footnote">
        参考视频与产品图仅在处理期间保存在服务器临时目录。Seedance 生成的 final.mp4 会暂存在服务器 output 目录，供本页面下载。
      </p>
    </main>
  );
}
