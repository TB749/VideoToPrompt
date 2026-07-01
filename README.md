# VideoToPrompt

Private creator tool for turning an authorized TikTok URL plus a product reference image into a Seedance 2.0 7-second vertical MP4 workflow.

## Flow

1. TikTok URL + product image
2. Render VideoToPrompt API
3. Chinese Seedance master prompt
4. Upload the same product image to the Seedance provider
5. Seedance 2.0 generates a 7-second 9:16 video
6. Python downloads the final MP4 into the Codex sandbox
7. `output/<job-name>/final.mp4`

## Development

```bash
npm install
npm run dev
```

The UI posts form data to `/api/analyze`. That route should run the full pipeline and return the existing `analysis` payload plus an optional `seedance` object:

```json
{
  "seedance": {
    "provider_upload": "uploaded",
    "generation_status": "completed",
    "final_video_path": "output/my-job/final.mp4",
    "final_video_url": "/api/download/my-job"
  }
}
```
