# FFmpeg Workstation UI

一个基于 Electron 的 FFmpeg 图形界面工具，支持视频转换、剪切、合并、动图制作、AI补帧、音轨管理和人声分离。

![Version](https://img.shields.io/badge/version-2.1.0-blue)
![License](https://img.shields.io/badge/license-MIT-green)
![Platform](https://img.shields.io/badge/platform-Windows-lightgrey)

## 功能特性

### 视频处理
- **转换** - 支持多种编码器 (H.264/H.265/AMD AMF/Intel QSV/NVIDIA NVENC)
- **剪切** - 精确剪切，支持无损复制模式
- **合并** - 多视频合并 (Concat Demuxer/Filter)
- **动图** - 高质量GIF生成，支持调色板优化
- **补帧** - AI补帧 (FFmpeg minterpolate / RIFE GPU加速)

### 音频处理
- **音轨管理** - 查看、提取、删除、合并多音轨
- **人声分离** - 基于 Demucs (Meta AI) 的人声/伴奏分离

### 工具
- **探测** - 查看文件详细信息
- **自定义** - 执行自定义 FFmpeg 命令
- **波形预览** - 音频波形可视化

## 界面预览

- 暗色主题，专业级UI
- 实时预览和波形显示
- 进度条和日志输出
- 支持 GPU 硬件加速

## 安装

### 下载预编译版本

从 [Releases](https://github.com/LeetaLeo/ffmpeg_UI/releases) 下载：
- `FFmpeg Workstation Setup 2.1.0.exe` - NSIS 安装包
- `FFmpeg Workstation-2.1.0-portable.exe` - 便携版

### 从源码构建

```bash
# 克隆仓库
git clone https://github.com/LeetaLeo/ffmpeg_UI.git
cd ffmpeg_UI

# 安装依赖
npm install

# 开发模式运行
npm start

# 打包
npm run dist
```

## 依赖

- **FFmpeg** - 需要系统安装 FFmpeg 并添加到 PATH
- **Demucs** (可选) - 人声分离功能需要 Python 和 Demucs
  ```bash
  pip install demucs
  ```
- **RIFE** (可选) - GPU补帧需要 RIFE 可执行文件

## 配置

首次运行后，点击右上角 ⚙️ 设置：
- FFmpeg 路径
- FFprobe 路径  
- RIFE 路径 (可选)
- 主题颜色

## 使用 Demucs 人声分离

1. 安装 Python 3.8+
2. 安装 Demucs: `pip install demucs`
3. 在"音轨"标签页选择目标音轨
4. 选择分离模式和模型
5. 点击"开始分离"

输出文件保存在输入文件同级的 `separated/` 目录。

## 技术栈

- **Electron** - 桌面应用框架
- **FFmpeg** - 音视频处理
- **Demucs** - AI人声分离 (Meta AI)
- **RIFE** - AI补帧

## 项目结构

```
ffmpeg-workstation-ui/
├── main.js          # Electron 主进程
├── preload.js       # 预加载脚本
├── index.html       # 前端界面
├── icon.png         # 应用图标
├── build.js         # 构建脚本
├── start.bat        # Windows 启动脚本
├── package.json     # 项目配置
└── dist/            # 打包输出
```

## 开发

```bash
# 开发模式
npm start

# 打包安装包
npm run dist

# 仅打包目录
npm run pack
```

## 许可证

本项目基于 [MIT License](LICENSE) 开源，Copyright (c) 2025 LeetaLeo。

## 作者

**[LeetaLeo](https://github.com/LeetaLeo)** — 项目开发与维护

## 致谢

- [FFmpeg](https://ffmpeg.org/) - 强大的音视频处理工具
- [Demucs](https://github.com/facebookresearch/demucs) - Meta AI 人声分离
- [RIFE](https://github.com/megvii-research/ECCV2022-RIFE) - AI补帧算法

## 问题反馈

请在 [Issues](https://github.com/LeetaLeo/ffmpeg_UI/issues) 提交问题。

## 更新日志

### v2.1.0 (2025-08-30)
- 新增音轨管理功能
- 新增 Demucs 人声分离
- 优化UI布局
- 支持多音轨选择处理

### v2.0.0
- 初始版本发布
- 支持视频转换/剪切/合并/动图/补帧
- 支持 GPU 硬件加速

---

## 开源信息 / Open Source Info

- **项目名称**: FFmpeg Workstation UI (ffmpeg_UI)
- **作者 / Author**: [LeetaLeo](https://github.com/LeetaLeo)
- **仓库地址 / Repository**: https://github.com/LeetaLeo/ffmpeg_UI
- **开源协议 / License**: MIT License (见 [LICENSE](LICENSE) 文件)
- **版权声明 / Copyright**: Copyright (c) 2025 LeetaLeo. All rights reserved under MIT License.
- **版本 / Version**: v2.1.0

### 使用声明
本项目基于 MIT 协议开源发布，任何人可自由使用、修改、分发本项目的代码，但须保留原始版权声明和许可证信息。第三方依赖的版权归其各自作者所有：
- FFmpeg — LGPL/GPL
- Demucs (Meta AI) — MIT
- RIFE (Megvii Research) — MIT
- Electron — MIT

> 如果本项目对你有帮助，欢迎给个 ⭐ Star 支持一下！
