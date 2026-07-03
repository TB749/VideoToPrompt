# TikTok → Gemini → Seedance 2.0 7-Second Creator Tool (v6)

A private Next.js + Docker service for an authorized workflow:

1. Paste one authorized TikTok URL.
2. Upload one product reference image (JPG, PNG, or WebP, maximum 10 MB).
3. The server downloads the authorized video with `yt-dlp`.
4. Gemini processes the reference video and product image.
5. The tool emails the Seedance prompt package and attaches the same product reference image.
6. The server removes local temporary reference files and requests deletion of the temporary Gemini uploads.

## v6 reliability update

v6 fixes the repeated message:

`Gemini 两次生成后仍未返回完整制作包。`

The earlier design asked Gemini to produce a long video analysis and a detailed Seedance storyboard inside one deeply nested JSON object. Any omitted non-core field could cause the whole request to fail.

v6 separates work into two compact structured-output requests:

- **Reference-video breakdown** — a smaller analysis object. If this non-core section fails, the service still sends the Seedance result and clearly marks the analysis fallback.
- **Seedance production package** — a separate, focused object containing only the master prompt, 4–6 shot storyboard, and English voiceover.

Other v6 improvements:

- The JSON schemas now define required nested fields, descriptions, minimum/maximum shot counts, `additionalProperties: false`, and preferred property order.
- The final storyboard timecodes are normalized server-side so the sequence always covers `00:00–00:07` continuously.
- The English voiceover is normalized to 14–20 English words. If Gemini returns an invalid word count, the tool substitutes a neutral, non-claiming fallback sentence rather than failing the entire job.
- A failed main production response gets a full repair attempt, followed by a storyboard-only recovery attempt using an even smaller schema.
- Render logs capture Gemini finish reason, finish message, safety feedback, and safety ratings when Gemini returns an empty response.

## Output format

- Chinese TikTok short-video breakdown.
- One Chinese Seedance 2.0 master prompt for a 7-second, 9:16 TikTok/Reels video.
- A connected 4–6 shot storyboard covering `00:00–00:07`.
  - Each shot contains only visual prompt and camera/editing direction.
- The master prompt and every visual prompt explicitly require:
  - No screen text
  - No subtitles
  - No UI elements
  - No readable text
  - No logos or watermarks
  - No dialogue
  - No voiceover inside the generated video
- One separate, natural English post-production voiceover of 14–20 English words.
- Optional Chinese field: `你的产品、服务或创作主题`.

The master prompt and every visual prompt are forced to begin with:

```text
Use the product shown in the attached picture to generate the prompt.
```

The app emails this master prompt and attaches the uploaded product image so you can use both together in Seedance.

## Environment variables

Set these in Render → Environment:

```text
GEMINI_API_KEY=your_google_ai_studio_key
GEMINI_MODEL=gemini-2.5-flash
RESEND_API_KEY=re_your_resend_key
EMAIL_FROM=TikTok Breakdown <results@your-verified-domain.com>
RESULT_RECIPIENT=tombee10@gmail.com
APP_PASSWORD=create-your-own-private-password
```

`GEMINI_MODEL` is optional; the app defaults to `gemini-2.5-flash`.

### Resend test mode

While Resend remains in test mode, `RESULT_RECIPIENT` must be the email address attached to your Resend account. Once you verify a domain in Resend, you can change it to any recipient address.

## Deploy on Render

1. Create a GitHub repository.
2. Upload the unzipped project files to its root directory and push to `main`.
3. In Render, choose **New → Web Service** and connect the repository.
4. Select the **Docker** environment. The included Dockerfile installs `yt-dlp` and `ffmpeg`.
5. Add the environment variables above.
6. Deploy.

No environment variable changes are needed when upgrading from v5.

## Local development

```bash
npm install
cp .env.example .env.local
npm run dev
```

## Usage notes

- Only submit TikTok videos that you own or are authorized to download, analyze, and use.
- The reference video is used to extract general content mechanics, not to copy the original creator, scenes, voice, composition, brand, or music.
- The email includes the generated Seedance prompt package and the uploaded product reference image as an attachment.
