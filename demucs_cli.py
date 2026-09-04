#!/usr/bin/env python3
"""
Demucs CLI wrapper for FFmpeg Workstation UI

Author: LeetaLeo (https://github.com/LeetaLeo)
License: MIT - Copyright (c) 2025 LeetaLeo
"""
import sys
import argparse
import subprocess

def main():
    parser = argparse.ArgumentParser(description='Demucs vocal separation')
    parser.add_argument('input', help='Input audio file')
    parser.add_argument('-n', '--model', default='htdemucs', help='Model name')
    parser.add_argument('--two-stems', help='Separate into two stems (vocals/other)')
    parser.add_argument('-o', '--output', help='Output directory')
    parser.add_argument('-s', '--shifts', type=int, default=0, help='Shifts for quality')
    parser.add_argument('-d', '--device', default='auto', help='Device (cpu/cuda)')
    parser.add_argument('--mp3', action='store_true', help='Output as MP3')
    parser.add_argument('--mp3-bitrate', type=int, default=320, help='MP3 bitrate')
    
    args = parser.parse_args()
    
    # Build demucs command
    cmd = [sys.executable, '-m', 'demucs']
    
    if args.model:
        cmd.extend(['-n', args.model])
    if args.two_stems:
        cmd.extend(['--two-stems', args.two_stems])
    if args.device and args.device != 'auto':
        cmd.extend(['-d', args.device])
    if args.shifts > 0:
        cmd.extend(['-s', str(args.shifts)])
    if args.output:
        cmd.extend(['-o', args.output])
    if args.mp3:
        cmd.append('--mp3')
        cmd.extend(['--mp3-bitrate', str(args.mp3_bitrate)])
    
    cmd.append(args.input)
    
    # Run demucs
    try:
        result = subprocess.run(cmd, check=True)
        sys.exit(result.returncode)
    except subprocess.CalledProcessError as e:
        sys.exit(e.returncode)
    except Exception as e:
        print(f'Error: {e}', file=sys.stderr)
        sys.exit(1)

if __name__ == '__main__':
    main()
