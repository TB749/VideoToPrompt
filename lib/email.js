function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function formatShotPlan(shotPlan) {
  return shotPlan
    .map((shot) => `${shot.timecode}\n画面：${shot.visual_prompt}\n镜头与剪辑：${shot.camera_and_editing}`)
    .join('\n\n');
}

export function analysisEmailText({ sourceUrl, analysis }) {
  const breakdown = analysis.short_breakdown
    .map((item) => `${item.timecode}｜${item.role}\n画面：${item.visual}\n信息：${item.message}\n剪辑：${item.editing}`)
    .join('\n\n');
  const prompt = analysis.video_prompt;

  return `TikTok 视频中文拆解\n\n来源：${sourceUrl}\n\n标题：${analysis.title}\n一句总结：${analysis.one_line_summary}\n时长估计：${analysis.estimated_duration_seconds > 0 ? `${analysis.estimated_duration_seconds} 秒` : '未识别'}\n开头钩子：${analysis.hook}\n内容结构：${analysis.structure}\n\n短视频拆解\n${breakdown}\n\n可直接复制的 Seedance 2.0 中文提示词\n${prompt.seedance_2_prompt}\n\n7 秒无文字、无旁白分镜\n${formatShotPlan(prompt.shot_plan)}\n\n独立后期英文旁白（约 7 秒）\n${prompt.full_english_voiceover}\n`;
}

export function analysisEmailHtml({ sourceUrl, analysis }) {
  const prompt = analysis.video_prompt;
  const breakdown = analysis.short_breakdown
    .map((item) => `${item.timecode}｜${item.role}\n画面：${item.visual}\n信息：${item.message}\n剪辑：${item.editing}`)
    .join('\n\n');

  return `
    <div style="font-family:Arial,'PingFang SC','Microsoft YaHei',sans-serif;max-width:760px;margin:0 auto;color:#14223a">
      <div style="padding:22px 24px;background:#eff7ff;border-radius:14px 14px 0 0">
        <p style="margin:0 0 8px;color:#2563eb;font-size:12px;font-weight:700;letter-spacing:1px">TIKTOK → GEMINI → SEEDANCE 2.0</p>
        <h1 style="margin:0;font-size:24px">${escapeHtml(analysis.title)}</h1>
      </div>
      <div style="padding:24px;border:1px solid #d9e5f3;border-top:0;border-radius:0 0 14px 14px">
        <p style="margin:0 0 16px;line-height:1.6"><b>来源：</b><a href="${escapeHtml(sourceUrl)}">${escapeHtml(sourceUrl)}</a></p>
        <p style="margin:0 0 16px;line-height:1.6"><b>一句总结：</b>${escapeHtml(analysis.one_line_summary)}</p>
        <p style="margin:0 0 16px;line-height:1.6"><b>开头钩子：</b>${escapeHtml(analysis.hook)}</p>
        <p style="margin:0 0 20px;line-height:1.6"><b>内容结构：</b>${escapeHtml(analysis.structure)}</p>

        <h2 style="font-size:18px">短视频拆解</h2>
        <pre style="white-space:pre-wrap;padding:16px;background:#f8fbff;border:1px solid #d9e5f3;border-radius:10px;line-height:1.65;color:#334155">${escapeHtml(breakdown)}</pre>

        <h2 style="font-size:18px;margin-top:26px">Seedance 2.0 原创 7 秒创作包</h2>
        <h3 style="font-size:16px;margin-top:24px">可直接复制的 Seedance 2.0 中文提示词</h3>
        <pre style="white-space:pre-wrap;padding:16px;background:#eff7ff;border:1px solid #bfdbfe;border-radius:10px;line-height:1.7;color:#1e3a5f">${escapeHtml(prompt.seedance_2_prompt)}</pre>

        <h3 style="font-size:16px;margin-top:24px">7 秒无文字、无旁白分镜</h3>
        <pre style="white-space:pre-wrap;padding:16px;background:#f8fbff;border:1px solid #d9e5f3;border-radius:10px;line-height:1.65;color:#334155">${escapeHtml(formatShotPlan(prompt.shot_plan))}</pre>

        <h3 style="font-size:16px;margin-top:24px">独立后期英文旁白（约 7 秒）</h3>
        <pre style="white-space:pre-wrap;padding:16px;background:#f8fbff;border:1px solid #d9e5f3;border-radius:10px;line-height:1.65;color:#334155">${escapeHtml(prompt.full_english_voiceover)}</pre>
      </div>
    </div>`;
}
