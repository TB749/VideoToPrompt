import { NextResponse } from 'next/server';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';

export const runtime = 'nodejs';

function safeJobName(value) {
  return typeof value === 'string' && /^[a-zA-Z0-9_-]+$/.test(value);
}

export async function GET(_request, { params }) {
  const resolvedParams = await params;
  const job = resolvedParams?.job;
  if (!safeJobName(job)) {
    return NextResponse.json({ error: '无效下载 ID。' }, { status: 400 });
  }

  const filePath = path.join(process.cwd(), 'output', job, 'final.mp4');

  try {
    const fileStat = await stat(filePath);
    const file = await readFile(filePath);
    return new NextResponse(file, {
      headers: {
        'Content-Type': 'video/mp4',
        'Content-Length': String(fileStat.size),
        'Content-Disposition': `attachment; filename="${job}-final.mp4"`,
        'Cache-Control': 'private, max-age=3600',
      },
    });
  } catch {
    return NextResponse.json({ error: '视频文件不存在或已过期。' }, { status: 404 });
  }
}
