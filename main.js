// FFmpeg Workstation UI - Main Process v2.1.0
// Author: LeetaLeo (https://github.com/LeetaLeo)
// License: MIT - Copyright (c) 2025 LeetaLeo

const { app, BrowserWindow, ipcMain, dialog, protocol } = require('electron');

// Register local:// protocol for loading local media files in renderer
// No custom protocol needed - using file:// with webSecurity:false
const path = require('path');
const { execFileSync, spawn } = require('child_process');
const fs = require('fs');

// FFmpeg/FFprobe paths - lazy init from config
let _ffmpegPath = null;
let _ffprobePath = null;
let _rifePath = null;

// Get app resource path for bundled tools
function getBundledPath(toolName) {
  // In production, resources are in app.getAppPath()
  // In dev, they're in __dirname
  const isProd = app.isPackaged;
  const baseDir = isProd ? process.resourcesPath : __dirname;
  return path.join(baseDir, 'bin', toolName);
}

function getFfmpegPath() {
  if (_ffmpegPath === null) {
    try {
      const cfg = loadConfig();
      _ffmpegPath = cfg.ffmpegPath || process.env.FFMPEG_PATH || getBundledPath('ffmpeg.exe');
    } catch { _ffmpegPath = process.env.FFMPEG_PATH || getBundledPath('ffmpeg.exe'); }
  }
  return _ffmpegPath;
}
function getFfprobePath() {
  if (_ffprobePath === null) {
    try {
      const cfg = loadConfig();
      _ffprobePath = cfg.ffprobePath || process.env.FFPROBE_PATH || getBundledPath('ffprobe.exe');
    } catch { _ffprobePath = process.env.FFPROBE_PATH || getBundledPath('ffprobe.exe'); }
  }
  return _ffprobePath;
}
function getRifePath() {
  if (_rifePath === null) {
    try {
      const cfg = loadConfig();
      _rifePath = cfg.rifePath || process.env.RIFE_PATH || getBundledPath(path.join('rife', 'rife-ncnn-vulkan.exe'));
    } catch { _rifePath = process.env.RIFE_PATH || getBundledPath(path.join('rife', 'rife-ncnn-vulkan.exe')); }
  }
  return _rifePath;
}

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 960,
    minHeight: 640,
    title: 'FFmpeg Workstation UI',
    icon: path.join(__dirname, 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  mainWindow.setMenuBarVisibility(false);

  mainWindow.loadFile('index.html');

  // Prevent navigation when files are dropped on the window
  // Without this, Electron navigates to the dropped file instead of firing the drop event
  mainWindow.webContents.on('will-navigate', (event, url) => {
    // Only block file:// navigation (caused by drag-drop from Explorer)
    if (url.startsWith('file://')) event.preventDefault();
  });

  // Suppress GPU cache errors (non-fatal)
  mainWindow.webContents.on('did-fail-load', (e, code, desc) => {
    console.error('Load failed:', code, desc);
  });
}

app.whenReady().then(() => {
  // Use file:// protocol directly for video preview
  // protocol.handle removed - we use IPC to get blob URLs instead
  // See ipcMain.handle('media:read-file') below
  
  createWindow();


});

app.on('window-all-closed', () => {
  app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

// ========== IPC Handlers ==========

// Open file dialog
ipcMain.handle('dialog:openFiles', async (event, filters) => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile', 'multiSelections'],
    filters: filters || [
      { name: 'Video/Audio', extensions: ['mp4','mkv','avi','mov','webm','flv','wmv','mp3','wav','flac','aac','ogg'] },
      { name: 'All Files', extensions: ['*'] }
    ]
  });
  return result.filePaths;
});

// Open single file
ipcMain.handle('dialog:openFile', async (event, filters) => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: filters || [
      { name: 'Video/Audio', extensions: ['mp4','mkv','avi','mov','webm','flv','wmv','mp3','wav','flac','aac','ogg'] },
      { name: 'All Files', extensions: ['*'] }
    ]
  });
  return result.filePaths[0] || null;
});

// Save file dialog
ipcMain.handle('dialog:saveFile', async (event, defaultName, filters) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    defaultPath: defaultName,
    filters: filters || [
      { name: 'MP4', extensions: ['mp4'] },
      { name: 'MKV', extensions: ['mkv'] },
      { name: 'AVI', extensions: ['avi'] },
      { name: 'WebM', extensions: ['webm'] },
      { name: 'GIF', extensions: ['gif'] },
      { name: 'MP3', extensions: ['mp3'] },
      { name: 'All Files', extensions: ['*'] }
    ]
  });
  return result.filePath || null;
});

// FFprobe - get media info
ipcMain.handle('ffprobe:info', async (event, filePath) => {
  try {
    const args = [
      '-v', 'quiet',
      '-print_format', 'json',
      '-show_format',
      '-show_streams',
      filePath
    ];
    const stdout = execFileSync(getFfprobePath(), args, {
      encoding: 'utf8',
      timeout: 30000,
      windowsHide: true
    });
    return { success: true, data: JSON.parse(stdout) };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// FFmpeg - run conversion
ipcMain.handle('ffmpeg:convert', async (event, opts) => {
  const { inputPath, outputPath, args } = opts;
  const fullArgs = ['-y', '-i', inputPath, ...args, outputPath];
  return runFfmpeg(fullArgs, event, 'convert');
});

// FFmpeg - cut video
ipcMain.handle('ffmpeg:cut', async (event, opts) => {
  const { inputPath, outputPath, startTime, endTime, codec, crf, crop } = opts;
  // -ss 放在 -i 之前作为输入选项，直接seek，更快
  // 由于 -ss 在 -i 之前，ffmpeg 的 time= 输出从 0 开始（相对于 seek 位置）
  // 因此必须用 -t duration 而非 -to endTime，否则 -to 被解释为相对于 seek 位置的时间
  const toSec = (t) => {
    const p = t.split(':');
    if (p.length === 3) return parseFloat(p[0])*3600 + parseFloat(p[1])*60 + parseFloat(p[2]);
    if (p.length === 2) return parseFloat(p[0])*60 + parseFloat(p[1]);
    return parseFloat(t);
  };
  const duration = toSec(endTime) - toSec(startTime);
  const args = ['-y', '-ss', startTime, '-i', inputPath, '-t', String(duration)];
  if (codec === 'copy') {
    args.push('-c', 'copy');
  } else if (codec) {
    args.push('-c:v', codec);
    // Add CRF/bitrate for GPU and CPU codecs
    if (crf) {
      if (crf.includes('M') || crf.includes('k') || crf.includes('K')) {
        args.push('-b:v', crf);
      } else {
        args.push('-crf', crf);
      }
    }
    args.push('-c:a', 'copy');
  }
  // Apply crop filter if specified (requires re-encoding)
  if (crop) {
    // If codec was 'copy', force re-encode to apply filter
    if (codec === 'copy') {
      const ci = args.indexOf('-c');
      if (ci >= 0) { args.splice(ci, 2); }
      args.push('-c:v', 'libx264', '-crf', crf || '23', '-c:a', 'copy');
    }
    args.push('-vf', crop);
  }
  args.push('-avoid_negative_ts', 'make_zero', outputPath);
  return runFfmpeg(args, event, 'cut', startTime, endTime);
});

// FFmpeg - merge videos
ipcMain.handle('ffmpeg:merge', async (event, opts) => {
  const { inputPaths, outputPath, method } = opts;
  if (method === 'concat_demuxer') {
    // Write concat file
    const concatFile = path.join(path.dirname(outputPath), '_concat_list.txt');
    const lines = inputPaths.map(p => `file '${p.replace(/'/g, "'\\''")}'`).join('\n');
    fs.writeFileSync(concatFile, lines, 'utf8');
    const args = ['-y', '-f', 'concat', '-safe', '0', '-i', concatFile, '-c', 'copy', outputPath];
    const result = await runFfmpeg(args, event, 'merge');
    try { fs.unlinkSync(concatFile); } catch(e) {}
    return result;
  } else {
    // Complex filter concat
    const args = ['-y'];
    inputPaths.forEach(p => args.push('-i', p));
    const filter = inputPaths.map((_, i) => `[${i}:v][${i}:a]`).join('') +
                   `concat=n=${inputPaths.length}:v=1:a=1[outv][outa]`;
    args.push('-filter_complex', filter, '-map', '[outv]', '-map', '[outa]', outputPath);
    return runFfmpeg(args, event, 'merge');
  }
});

// FFmpeg - create GIF
ipcMain.handle('ffmpeg:gif', async (event, opts) => {
  const { inputPath, outputPath, startTime, endTime, fps, width, quality, crop } = opts;
  const palettePath = path.join(path.dirname(outputPath), '_palette.png');
  
  // Step 1: Generate palette
  const palArgs = ['-y', '-ss', startTime, '-to', endTime, '-i', inputPath];
  const vfParts = [];
  if (crop) vfParts.push(crop);
  if (fps) vfParts.push(`fps=${fps}`);
  if (width) vfParts.push(`scale=${width}:-1:flags=lanczos`);
  vfParts.push('palettegen=max_colors=256:stats_mode=diff');
  palArgs.push('-vf', vfParts.join(','), '-frames:v', '1', palettePath);
  
  const palResult = await runFfmpeg(palArgs, event, 'gif-palette');
  if (!palResult.success) return palResult;

  // Step 2: Generate GIF with palette
  // -ss 放在 -i 之前，必须用 -t duration 而非 -to（同 cut 函数）
  const gifToSec = (t) => {
    const p = t.split(':');
    if (p.length === 3) return parseFloat(p[0])*3600 + parseFloat(p[1])*60 + parseFloat(p[2]);
    if (p.length === 2) return parseFloat(p[0])*60 + parseFloat(p[1]);
    return parseFloat(t);
  };
  const gifDuration = gifToSec(endTime) - gifToSec(startTime);
  const gifArgs = ['-y', '-ss', startTime, '-t', String(gifDuration), '-i', inputPath, '-i', palettePath];
  const gifVf = [];
  if (crop) gifVf.push(crop);
  if (fps) gifVf.push(`fps=${fps}`);
  if (width) gifVf.push(`scale=${width}:-1:flags=lanczos`);
  gifVf.push('paletteuse=dither=bayer:bayer_scale=5');
  gifArgs.push('-lavfi', gifVf.join(','), outputPath);
  
  const result = await runFfmpeg(gifArgs, event, 'gif');
  try { fs.unlinkSync(palettePath); } catch(e) {}
  return result;
});

// FFmpeg - frame interpolation (RIFE or minterpolate fallback)
ipcMain.handle('ffmpeg:rife', async (event, opts) => {
  const { inputPath, outputPath, multiplier, model, outputFormat } = opts;

  // Get source video FPS first
  let srcFps = 30; // default fallback
  try {
    const probeArgs = [
      '-v', 'quiet',
      '-select_streams', 'v:0',
      '-show_entries', 'stream=r_frame_rate',
      '-of', 'csv=p=0',
      inputPath
    ];
    const probeOut = execFileSync(getFfprobePath(), probeArgs, {
      encoding: 'utf8',
      timeout: 10000,
      windowsHide: true
    }).trim();
    // Parse fps fraction like "30000/1001"
    if (probeOut.includes('/')) {
      const [num, den] = probeOut.split('/');
      srcFps = parseFloat(num) / parseFloat(den);
    } else {
      srcFps = parseFloat(probeOut);
    }
    if (isNaN(srcFps) || srcFps <= 0) srcFps = 30;
  } catch (e) {
    // Use default
  }

  const dstFps = Math.round(srcFps * (multiplier || 2));
  const rifePath = getRifePath();

  // Check if RIFE executable is configured and exists
  if (rifePath && fs.existsSync(rifePath)) {
    // Use actual RIFE executable for interpolation
    const os = require('os');
    const tmpBase = path.join(os.tmpdir(), 'ffmpeg-ui-rife-' + Date.now());
    const framesDir = path.join(tmpBase, 'frames');
    const interpDir = path.join(tmpBase, 'interp');

    try {
      fs.mkdirSync(framesDir, { recursive: true });
      fs.mkdirSync(interpDir, { recursive: true });

      // Step 1: Extract frames as PNG sequence
      event.sender.send('ffmpeg:progress', { task: 'rife', percent: 5, time: '提取帧...' });
      const extractArgs = ['-y', '-i', inputPath, '-vsync', '0', path.join(framesDir, 'frame_%08d.png')];
      const extractResult = await runFfmpeg(extractArgs, event, 'rife');
      if (!extractResult.success) {
        return { success: false, error: '帧提取失败: ' + extractResult.error };
      }

      // Step 2: Run RIFE interpolation
      event.sender.send('ffmpeg:progress', { task: 'rife', percent: 30, time: 'RIFE 补帧中...' });
      const rifeModel = model || 'rife-v4';
      const rifeArgs = ['-i', framesDir, '-o', interpDir, '-m', rifeModel];
      // -n (numframe) and -s (timestep) are only supported by rife-v4 models
      if (rifeModel.startsWith('rife-v4')) {
        rifeArgs.push('-n', String(multiplier || 2));
      }
      const rifeResult = await new Promise((resolve) => {
        const proc = spawn(rifePath, rifeArgs, { windowsHide: true });
        currentProcess = proc;
        let stderr = '';
        proc.stderr.on('data', (d) => { stderr += d.toString(); });
        proc.stdout.on('data', (d) => { stderr += d.toString(); });
        proc.on('close', (code) => {
          currentProcess = null;
          resolve({ success: code === 0, error: code !== 0 ? stderr : null });
        });
        proc.on('error', (err) => {
          currentProcess = null;
          resolve({ success: false, error: err.message });
        });
      });

      if (!rifeResult.success) {
        return { success: false, error: 'RIFE 执行失败: ' + rifeResult.error };
      }

      // Step 3: Reassemble frames with chosen codec
      event.sender.send('ffmpeg:progress', { task: 'rife', percent: 80, time: '合成视频...' });
      let reassembleArgs;
      const fmt = outputFormat || 'ffv1';

      if (fmt === 'png') {
        // PNG sequence output - just copy interp frames to output dir
        const outDir = outputPath.replace(/\.[^.]+$/, '') + '_frames';
        fs.mkdirSync(outDir, { recursive: true });
        const interpFiles = fs.readdirSync(interpDir).filter(f => f.endsWith('.png')).sort();
        for (let i = 0; i < interpFiles.length; i++) {
          const num = String(i + 1).padStart(8, '0') + '.png';
          fs.copyFileSync(path.join(interpDir, interpFiles[i]), path.join(outDir, num));
        }
        event.sender.send('ffmpeg:progress', { task: 'rife', percent: 100, time: 'done' });
        return { success: true };
      } else if (fmt === 'h264-lossless') {
        reassembleArgs = [
          '-y', '-framerate', String(dstFps),
          '-i', path.join(interpDir, '%08d.png'),
          '-c:v', 'libx264', '-crf', '0', '-preset', 'ultrafast',
          outputPath
        ];
      } else {
        // Default: FFV1 (true lossless)
        reassembleArgs = [
          '-y', '-framerate', String(dstFps),
          '-i', path.join(interpDir, '%08d.png'),
          '-c:v', 'ffv1',
          outputPath
        ];
      }

      // Mux audio from the original video directly (no separate extraction step)
      try {
        // Probe original for audio streams
        const probeOut = execFileSync(getFfprobePath(), [
          '-v', 'quiet', '-select_streams', 'a',
          '-show_entries', 'stream=codec_type',
          '-of', 'csv=p=0', inputPath
        ], { encoding: 'utf8', timeout: 10000, windowsHide: true });
        if (probeOut && probeOut.trim().includes('audio')) {
          // Use original video as second input, map video from frames + audio from original
          reassembleArgs.splice(reassembleArgs.length - 1, 0, '-i', inputPath);
          reassembleArgs.splice(reassembleArgs.length - 1, 0, '-map', '0:v', '-map', '1:a', '-c:a', 'copy');
        }
      } catch (e) {
        // No audio or probe failed - continue with video only
      }

      return runFfmpeg(reassembleArgs, event, 'rife');
    } finally {
      // Clean up temp directories
      try { fs.rmSync(tmpBase, { recursive: true, force: true }); } catch (e) { /* ignore */ }
    }
  }

  // Fallback: Use FFmpeg minterpolate filter (slower, no GPU)
  event.sender.send('ffmpeg:progress', { task: 'rife', percent: 5, time: '使用 minterpolate 回退模式...' });

  const fmt = outputFormat || 'ffv1';
  let codecArgs;
  if (fmt === 'h264-lossless') {
    codecArgs = ['-c:v', 'libx264', '-crf', '0', '-preset', 'ultrafast'];
  } else if (fmt === 'png') {
    // For PNG output, change extension
    const pngOutDir = outputPath.replace(/\.[^.]+$/, '') + '_frames';
    fs.mkdirSync(pngOutDir, { recursive: true });
    codecArgs = ['-vsync', '0', path.join(pngOutDir, 'frame_%08d.png')];
  } else {
    codecArgs = ['-c:v', 'ffv1'];
  }

  const args = [
    '-y',
    '-i', inputPath,
    '-vf', `minterpolate=fps=${dstFps}:mi_mode=mci:mc_mode=aobmc:me_mode=bidir:vsbmc=1`,
    ...codecArgs,
    '-c:a', 'copy',
    outputPath
  ];

  return runFfmpeg(args, event, 'rife');
});

// FFmpeg - custom command
ipcMain.handle('ffmpeg:custom', async (event, argsStr) => {
  const args = argsStr.split(/\s+/).filter(a => a);
  return runFfmpeg(args, event, 'custom');
});

// Get GPU codec info
ipcMain.handle('ffmpeg:codecs', async () => {
  try {
    const stdout = execFileSync(getFfmpegPath(), ['-hide_banner', '-encoders'], {
      encoding: 'utf8',
      timeout: 10000,
      windowsHide: true
    });
    const gpuCodecs = {
      amd: [],
      intel: [],
      nvidia: []
    };
    const lines = stdout.split('\n');
    for (const line of lines) {
      if (line.includes('h264_amf') || line.includes('hevc_amf') || line.includes('av1_amf')) {
        gpuCodecs.amd.push(line.trim());
      }
      if (line.includes('h264_qsv') || line.includes('hevc_qsv') || line.includes('av1_qsv')) {
        gpuCodecs.intel.push(line.trim());
      }
      if (line.includes('h264_nvenc') || line.includes('hevc_nvenc') || line.includes('av1_nvenc')) {
        gpuCodecs.nvidia.push(line.trim());
      }
    }
    return { success: true, data: gpuCodecs };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// Kill running FFmpeg process
ipcMain.handle('ffmpeg:kill', async () => {
  if (currentProcess) {
    currentProcess.kill('SIGKILL');
    currentProcess = null;
    return { success: true };
  }
  return { success: false, error: 'No running process' };
});

// ========== Helper Functions ==========

let currentProcess = null;

function runFfmpeg(args, event, task, cutStart, cutEnd) {
  return new Promise((resolve) => {
    try {
      // Probe input duration for progress calculation
      let totalDuration = 0;
      const inputIdx = args.indexOf('-i');
      if (inputIdx >= 0 && inputIdx + 1 < args.length) {
        const inputPath = args[inputIdx + 1];
        try {
          const probeOut = execFileSync(getFfprobePath(), [
            '-v', 'quiet', '-show_entries', 'format=duration',
            '-of', 'csv=p=0', inputPath
          ], { encoding: 'utf8', timeout: 10000, windowsHide: true }).trim();
          totalDuration = parseFloat(probeOut) || 0;
        } catch (e) { /* ignore */ }
      }

      // 剪切模式：用剪切时长而非总时长
      let progressDuration = totalDuration;
      let progressOffset = 0;
      if (task === 'cut' && cutStart && cutEnd) {
        const toSec = (t) => {
          const p = t.split(':');
          if (p.length === 3) return parseFloat(p[0])*3600 + parseFloat(p[1])*60 + parseFloat(p[2]);
          if (p.length === 2) return parseFloat(p[0])*60 + parseFloat(p[1]);
          return parseFloat(t);
        };
        progressOffset = toSec(cutStart);
        progressDuration = toSec(cutEnd) - progressOffset;
      }

      const proc = spawn(getFfmpegPath(), args, { windowsHide: true });
      currentProcess = proc;
      let stderr = '';
      
      proc.stderr.on('data', (d) => {
        stderr += d.toString();
        const timeMatch = d.toString().match(/time=(\d+:\d+:\d+\.\d+)/);
        if (timeMatch) {
          const timeParts = timeMatch[1].split(':');
          const currentSec = parseFloat(timeParts[0])*3600 + parseFloat(timeParts[1])*60 + parseFloat(timeParts[2]);
          // -ss 在 -i 之前时，ffmpeg time= 输出从 0 开始（相对时间），直接用于进度计算
          const effectiveSec = currentSec;
          const percent = progressDuration > 0 ? Math.min(99, Math.round(effectiveSec / progressDuration * 100)) : 0;
          event.sender.send('ffmpeg:progress', {
            task,
            time: timeMatch[1],
            percent,
            totalDuration: progressDuration,
            currentSec: effectiveSec
          });
        }
      });
      
      proc.on('close', (code) => {
        currentProcess = null;
        if (code === 0) {
          event.sender.send('ffmpeg:progress', { task, percent: 100, time: 'done' });
        }
        resolve({
          success: code === 0,
          error: code !== 0 ? stderr : null
        });
      });
      
      proc.on('error', (err) => {
        currentProcess = null;
        resolve({ success: false, error: err.message });
      });
    } catch (err) {
      currentProcess = null;
      resolve({ success: false, error: err.message });
    }
  });
}




// ========== Waveform Extraction ==========
ipcMain.handle('ffmpeg:waveform', async (event, filePath) => {
  try {
    // Use ffmpeg to extract audio as raw 16-bit PCM, mono, 8000Hz
    // This gives us a compact waveform to visualize
    const args = [
      '-i', filePath,
      '-ac', '1',           // mono
      '-ar', '8000',        // 8kHz sample rate
      '-f', 's16le',        // raw 16-bit PCM
      '-acodec', 'pcm_s16le',
      '-v', 'error',
      'pipe:1'              // output to stdout
    ];
    const proc = spawn(getFfmpegPath(), args, { windowsHide: true });
    const chunks = [];
    proc.stdout.on('data', (d) => chunks.push(d));
    return new Promise((resolve) => {
      proc.on('close', (code) => {
        if (code !== 0) {
          resolve({ success: false, error: 'ffmpeg exit code ' + code });
          return;
        }
        const buf = Buffer.concat(chunks);
        const sampleCount = buf.length / 2; // 16-bit = 2 bytes per sample
        const bucketCount = 2000; // number of display buckets
        const samplesPerBucket = Math.max(1, Math.floor(sampleCount / bucketCount));
        const peaks = [];
        for (let i = 0; i < bucketCount; i++) {
          let max = 0;
          const start = i * samplesPerBucket;
          const end = Math.min(start + samplesPerBucket, sampleCount);
          for (let j = start; j < end; j++) {
            const val = Math.abs(buf.readInt16LE(j * 2));
            if (val > max) max = val;
          }
          peaks.push(max / 32768); // normalize to 0..1
        }
        resolve({ success: true, peaks, sampleCount, duration: sampleCount / 8000 });
      });
      proc.on('error', (err) => {
        resolve({ success: false, error: err.message });
      });
    });
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// ===== Media File IPC (for video preview) =====

ipcMain.handle('media:read-file', async (event, filePath) => {
  try {
    if (!filePath || typeof filePath !== 'string') return { error: 'Invalid path' };
    // Security: only allow absolute Windows paths
    if (!filePath.match(/^[A-Z]:\\/i) && !filePath.match(/^\//)) return { error: 'Invalid path format' };
    
    const data = fs.readFileSync(filePath);
    const ext = filePath.split('.').pop().toLowerCase();
    const mimeMap = {
      mp4: 'video/mp4', mkv: 'video/x-matroska', avi: 'video/x-msvideo', mov: 'video/quicktime',
      webm: 'video/webm', wmv: 'video/x-ms-wmv', flv: 'video/x-flv', ts: 'video/mp2t',
      mp3: 'audio/mpeg', wav: 'audio/wav', flac: 'audio/flac', aac: 'audio/aac',
      ogg: 'audio/ogg', m4a: 'audio/mp4', wma: 'audio/x-ms-wma',
      jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp',
    };
    const mime = mimeMap[ext] || 'application/octet-stream';
    const base64 = data.toString('base64');
    console.log('[media:read-file] Read:', filePath, 'size:', data.length, 'mime:', mime);
    return { base64, mime, size: data.length };
  } catch (err) {
    console.error('[media:read-file] Error:', err.message);
    return { error: err.message };
  }
});

ipcMain.handle('media:read-file-url', async (event, filePath) => {
  try {
    if (!filePath || typeof filePath !== 'string') return { error: 'Invalid path' };
    // Return a file:// URL that Electron can load directly
    const fileUrl = 'file:///' + filePath.replace(/\\/g, '/');
    console.log('[media:read-file-url] URL:', fileUrl);
    return { url: fileUrl };
  } catch (err) {
    return { error: err.message };
  }
});

// ========== Config IPC ==========

const CONFIG_PATH = path.join(app.getPath('userData'), 'config.json');

function loadConfig() {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  } catch {
    return { ffmpegPath: '', ffprobePath: '', rifePath: path.join(__dirname, 'rife', 'rife-ncnn-vulkan.exe') };
  }
}

function saveConfig(cfg) {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2), 'utf8');
}

ipcMain.handle('config:get', async () => loadConfig());
ipcMain.handle('config:save', async (event, cfg) => {
  saveConfig(cfg);
  // Reload paths when config changes
  _ffmpegPath = null;
  _ffprobePath = null;
  _rifePath = null;
  return { success: true };
});

// ========== System Info ==========
ipcMain.handle('system:info', async () => {
  const result = { gpu: [], ffmpegVersion: '', ffprobeVersion: '', ffmpegAvailable: false };
  
  // GPU info
  try {
    const wmic = execFileSync('wmic', ['path', 'win32_videocontroller', 'get', 'name,driverversion', '/format:csv'], {
      encoding: 'utf8', timeout: 5000, windowsHide: true
    });
    const lines = wmic.trim().split('\n').filter(l => l.trim() && !l.startsWith('Node'));
    for (const line of lines) {
      const parts = line.trim().split(',');
      if (parts.length >= 2) {
        result.gpu.push({ name: parts[2] || parts[0], driverVersion: parts[1] || '' });
      }
    }
  } catch (e) {
    // Try PowerShell as fallback
    try {
      const ps = execFileSync('powershell', ['-Command', 'Get-CimInstance Win32_VideoController | Select-Object Name,DriverVersion | ConvertTo-Json'], {
        encoding: 'utf8', timeout: 5000, windowsHide: true
      });
      const data = JSON.parse(ps);
      const items = Array.isArray(data) ? data : [data];
      for (const g of items) {
        result.gpu.push({ name: g.Name, driverVersion: g.DriverVersion });
      }
    } catch {}
  }
  
  // FFmpeg version
  try {
    const ver = execFileSync(getFfmpegPath(), ['-version'], { encoding: 'utf8', timeout: 5000, windowsHide: true });
    result.ffmpegVersion = ver.split('\n')[0].trim();
    result.ffmpegAvailable = true;
  } catch (e) {
    result.ffmpegVersion = '未安装: ' + e.message;
    result.ffmpegAvailable = false;
  }
  
  // FFprobe version
  try {
    const ver = execFileSync(getFfprobePath(), ['-version'], { encoding: 'utf8', timeout: 5000, windowsHide: true });
    result.ffprobeVersion = ver.split('\n')[0].trim();
  } catch {}
  
  // Available encoders - based on ACTUAL GPU hardware, not just ffmpeg compiled-in support
  // Filter out virtual display drivers (OrayIddDriver, etc.)
  const realGpus = result.gpu.filter(g =>
    !g.name.includes('OrayIdd') && !g.name.includes('Virtual') && !g.name.includes('Basic')
  );
  const hasAmd = realGpus.some(g => /amd|radeon/i.test(g.name));
  const hasIntel = realGpus.some(g => /intel|uhd|iris/i.test(g.name));
  const hasNvidia = realGpus.some(g => /nvidia|geforce|quadro|rtx|gtx/i.test(g.name));

  // Also check if ffmpeg actually has the encoder compiled
  let ffmpegHasAmd = false, ffmpegHasIntel = false, ffmpegHasNvidia = false;
  try {
    const enc = execFileSync(getFfmpegPath(), ['-hide_banner', '-encoders'], { encoding: 'utf8', timeout: 10000, windowsHide: true });
    ffmpegHasAmd = enc.includes('h264_amf') || enc.includes('hevc_amf');
    ffmpegHasIntel = enc.includes('h264_qsv') || enc.includes('hevc_qsv');
    ffmpegHasNvidia = enc.includes('h264_nvenc') || enc.includes('hevc_nvenc');
  } catch {}

  // Encoder is available only when BOTH hardware and ffmpeg support exist
  result.encoders = {
    amd: hasAmd && ffmpegHasAmd,
    intel: hasIntel && ffmpegHasIntel,
    nvidia: hasNvidia && ffmpegHasNvidia
  };

  // GPU list for multi-GPU selection
  result.gpuList = realGpus.map(g => {
    const name = g.name;
    let vendor = 'unknown';
    if (/amd|radeon/i.test(name)) vendor = 'amd';
    else if (/intel|uhd|iris/i.test(name)) vendor = 'intel';
    else if (/nvidia|geforce|quadro|rtx|gtx/i.test(name)) vendor = 'nvidia';
    return { name, vendor, driverVersion: g.driverVersion };
  });
  
  return result;
});

// ========== Demucs Vocal Separation ==========

let demucsProcess = null;

function getDemucsPath() {
  try {
    const cfg = loadConfig();
    return cfg.demucsPath || getBundledPath('demucs.exe');
  } catch {
    return getBundledPath('demucs.exe');
  }
}

ipcMain.handle('demucs:separate', async (event, opts) => {
  const { inputPath, outputDir, model, stems, device, shifts } = opts;
  
  if (!inputPath) {
    return { success: false, error: '未选择输入文件' };
  }
  
  // Build demucs command args
  const args = [];
  if (model) args.push('-n', model);
  if (stems && stems !== 'all') args.push('--two-stems', stems);
  if (shifts && shifts > 0) args.push('-s', String(shifts));
  args.push('--mp3', inputPath);
  
  return new Promise((resolve) => {
    try {
      const demucsPath = getDemucsPath();
      console.log('[demucs] Running:', demucsPath, args.join(' '));
      
      const proc = spawn(demucsPath, args, { 
        windowsHide: true,
        env: { ...process.env, PYTHONIOENCODING: 'utf-8' }
      });
      demucsProcess = proc;
      
      let stdout = '';
      let stderr = '';
      
      proc.stdout.on('data', (d) => {
        const text = d.toString();
        stdout += text;
        console.log('[demucs]', text);
        const progressMatch = text.match(/(\d+)%/);
        if (progressMatch) {
          event.sender.send('ffmpeg:progress', {
            task: 'demucs',
            percent: parseInt(progressMatch[1]),
            time: text.trim()
          });
        }
      });
      
      proc.stderr.on('data', (d) => {
        stderr += d.toString();
        console.error('[demucs:err]', d.toString());
      });
      
      proc.on('close', (code) => {
        demucsProcess = null;
        if (code === 0) {
          event.sender.send('ffmpeg:progress', { task: 'demucs', percent: 100, time: 'done' });
          
          const baseName = path.basename(inputPath, path.extname(inputPath));
          const outDir = outputDir || path.join(path.dirname(inputPath), 'separated');
          const modelDir = model || 'htdemucs';
          const resultDir = path.join(outDir, modelDir, baseName);
          
          let outputs = {};
          try {
            if (fs.existsSync(resultDir)) {
              const files = fs.readdirSync(resultDir);
              for (const f of files) {
                const fullPath = path.join(resultDir, f);
                if (f.includes('vocals')) outputs.vocals = fullPath;
                else if (f.includes('no_vocals') || f.includes('accompaniment')) outputs.accompaniment = fullPath;
                else if (f.includes('drums')) outputs.drums = fullPath;
                else if (f.includes('bass')) outputs.bass = fullPath;
                else if (f.includes('other')) outputs.other = fullPath;
              }
            }
          } catch (e) {
            console.error('[demucs] Error reading output:', e);
          }
          
          resolve({ success: true, outputs, outputDir: resultDir });
        } else {
          resolve({ success: false, error: stderr || `Exit code: ${code}` });
        }
      });
      
      proc.on('error', (err) => {
        demucsProcess = null;
        resolve({ success: false, error: err.message });
      });
    } catch (err) {
      demucsProcess = null;
      resolve({ success: false, error: err.message });
    }
  });
});

ipcMain.handle('demucs:kill', async () => {
  if (demucsProcess) {
    demucsProcess.kill('SIGKILL');
    demucsProcess = null;
    return { success: true };
  }
  return { success: false, error: 'No running demucs process' };
});

// ========== Audio Track Management ==========

// Get audio streams info
ipcMain.handle('audio:getTracks', async (event, filePath) => {
  try {
    const args = [
      '-v', 'quiet',
      '-print_format', 'json',
      '-show_streams',
      '-select_streams', 'a',
      filePath
    ];
    const stdout = execFileSync(getFfprobePath(), args, {
      encoding: 'utf8',
      timeout: 30000,
      windowsHide: true
    });
    const data = JSON.parse(stdout);
    const tracks = (data.streams || []).map((s, i) => ({
      index: s.index || i,
      codec: s.codec_name,
      channels: s.channels,
      channelLayout: s.channel_layout,
      sampleRate: s.sample_rate,
      bitrate: s.bit_rate,
      language: s.tags?.language || 'und',
      title: s.tags?.title || ''
    }));
    return { success: true, tracks };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// Extract specific audio tracks
ipcMain.handle('audio:extractTracks', async (event, opts) => {
  const { inputPath, outputPath, trackIndices } = opts;
  const args = ['-y', '-i', inputPath];
  
  if (trackIndices && trackIndices.length > 0) {
    trackIndices.forEach(idx => {
      args.push('-map', `0:a:${idx}`);
    });
  } else {
    args.push('-map', '0:a');
  }
  
  args.push('-c', 'copy', outputPath);
  return runFfmpeg(args, event, 'audio-extract');
});

// Remove specific audio tracks (keep selected)
ipcMain.handle('audio:removeTracks', async (event, opts) => {
  const { inputPath, outputPath, keepIndices } = opts;
  const args = ['-y', '-i', inputPath, '-map', '0:v'];
  
  if (keepIndices && keepIndices.length > 0) {
    keepIndices.forEach(idx => {
      args.push('-map', `0:a:${idx}`);
    });
  }
  
  args.push('-c', 'copy', '-shortest', outputPath);
  return runFfmpeg(args, event, 'audio-remove');
});

// Merge all audio tracks into one
ipcMain.handle('audio:mergeTracks', async (event, opts) => {
  const { inputPath, outputPath } = opts;
  
  // Get track count first
  let trackCount = 1;
  try {
    const probeArgs = ['-v', 'quiet', '-print_format', 'json', '-show_streams', '-select_streams', 'a', inputPath];
    const stdout = execFileSync(getFfprobePath(), probeArgs, { encoding: 'utf8', timeout: 10000, windowsHide: true });
    const data = JSON.parse(stdout);
    trackCount = data.streams?.length || 1;
  } catch {}
  
  if (trackCount <= 1) {
    // Only one track, just copy
    const args = ['-y', '-i', inputPath, '-map', '0:a', '-c', 'copy', outputPath];
    return runFfmpeg(args, event, 'audio-merge');
  }
  
  // Build amerge filter
  const inputs = Array.from({length: trackCount}, (_, i) => `[0:a:${i}]`).join('');
  const filter = `${inputs}amerge=inputs=${trackCount}[a]`;
  
  const args = [
    '-y', '-i', inputPath,
    '-filter_complex', filter,
    '-map', '[a]', '-map', '0:v',
    '-c:v', 'copy',
    outputPath
  ];
  return runFfmpeg(args, event, 'audio-merge');
});

// Extract single track for demucs processing
ipcMain.handle('audio:extractForDemucs', async (event, opts) => {
  const { inputPath, trackIndex } = opts;
  const outputPath = inputPath.replace(/\.[^.]+$/, `_track${trackIndex}.wav`);
  
  const args = [
    '-y', '-i', inputPath,
    '-map', `0:a:${trackIndex}`,
    '-acodec', 'pcm_s16le',
    outputPath
  ];
  
  const result = await runFfmpeg(args, event, 'audio-extract-demucs');
  if (result.success) {
    result.outputPath = outputPath;
  }
  return result;
});