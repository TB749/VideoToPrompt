import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "TikTok → Gemini → Seedance 产品图创作包",
  description:
    "下载授权 TikTok 视频，结合产品参考图片使用 Gemini 生成中文短视频拆解与原创 Seedance 2.0 提示词，并继续生成 7 秒 9:16 MP4。",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
