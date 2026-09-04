// FFmpeg Workstation UI - Preload v2.1.0
// Author: LeetaLeo (https://github.com/LeetaLeo)
// License: MIT - Copyright (c) 2025 LeetaLeo
const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Dialogs
  openFiles: (filters) => ipcRenderer.invoke('dialog:openFiles', filters),
  openFile: (filters) => ipcRenderer.invoke('dialog:openFile', filters),
  saveFile: (name, filters) => ipcRenderer.invoke('dialog:saveFile', name, filters),
  
  // FFprobe
  probeInfo: (filePath) => ipcRenderer.invoke('ffprobe:info', filePath),
  
  // FFmpeg operations
  convert: (opts) => ipcRenderer.invoke('ffmpeg:convert', opts),
  cut: (opts) => ipcRenderer.invoke('ffmpeg:cut', opts),
  merge: (opts) => ipcRenderer.invoke('ffmpeg:merge', opts),
  gif: (opts) => ipcRenderer.invoke('ffmpeg:gif', opts),
  rife: (opts) => ipcRenderer.invoke('ffmpeg:rife', opts),
  custom: (argsStr) => ipcRenderer.invoke('ffmpeg:custom', argsStr),
  getCodecs: () => ipcRenderer.invoke('ffmpeg:codecs'),
  kill: () => ipcRenderer.invoke('ffmpeg:kill'),
  waveform: (filePath) => ipcRenderer.invoke('ffmpeg:waveform', filePath),
  
  // Demucs vocal separation
  demucs: (opts) => ipcRenderer.invoke('demucs:separate', opts),
  demucsKill: () => ipcRenderer.invoke('demucs:kill'),
  
  // Audio track management
  getAudioTracks: (filePath) => ipcRenderer.invoke('audio:getTracks', filePath),
  extractAudioTracks: (opts) => ipcRenderer.invoke('audio:extractTracks', opts),
  removeAudioTracks: (opts) => ipcRenderer.invoke('audio:removeTracks', opts),
  mergeAudioTracks: (opts) => ipcRenderer.invoke('audio:mergeTracks', opts),
  extractForDemucs: (opts) => ipcRenderer.invoke('audio:extractForDemucs', opts),
  
  // Config
  getConfig: () => ipcRenderer.invoke('config:get'),
  saveConfig: (cfg) => ipcRenderer.invoke('config:save', cfg),
  
  // System info
  getSystemInfo: () => ipcRenderer.invoke('system:info'),
  
  // Progress events
  onProgress: (callback) => {
    ipcRenderer.removeAllListeners('ffmpeg:progress');
    ipcRenderer.on('ffmpeg:progress', (event, data) => callback(data));
  },
  
  // Get file path from File object (Electron 28+ replacement for file.path)
  getFilePath: (file) => webUtils.getPathForFile(file),

  // Media file reading for video preview
  media: {
    readFile: (filePath) => ipcRenderer.invoke('media:read-file', filePath),
    readFileUrl: (filePath) => ipcRenderer.invoke('media:read-file-url', filePath),
  }
});