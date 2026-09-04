// FFmpeg Workstation UI - Build Script
// Author: LeetaLeo (https://github.com/LeetaLeo)
// License: MIT - Copyright (c) 2025 LeetaLeo
// FFmpeg Workstation UI - Build Script
// Assembles parts/ into index.html
const fs = require('fs');
const path = require('path');

const partsDir = path.join(__dirname, 'parts');
const outFile = path.join(__dirname, 'index.html');

const css = fs.readFileSync(path.join(partsDir, 'style.css'), 'utf8');
const body = fs.readFileSync(path.join(partsDir, 'body.html'), 'utf8');
const app = fs.readFileSync(path.join(partsDir, 'app.js'), 'utf8');

const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'self' 'unsafe-inline' 'unsafe-eval'; media-src file: local:; img-src file: data:;">
  <title>FFmpeg Workstation UI</title>
  <meta name="author" content="LeetaLeo">
  <meta name="description" content="FFmpeg Workstation UI - 视频转换/剪切/合并/动图/补帧/音轨管理/人声分离 | Author: LeetaLeo | MIT License">
  <style>
${css}
  </style>
</head>
<body>
${body}
  <script>
${app}
  </script>
</body>
</html>`;

fs.writeFileSync(outFile, html, 'utf8');
console.log(`Build complete: ${outFile} (${fs.statSync(outFile).size} bytes)`);
