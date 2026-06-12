#!/usr/bin/env python3
"""Extract frames from a video into a folder of JPEGs.

Usage:
    python3 extract-frames.py <video> [--fps 1] [--out frames]

Dependencies:
    pip3 install --user imageio imageio-ffmpeg pillow
"""
import argparse
import os
import sys


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("video", help="path to a video file (mp4/mov/...)")
    ap.add_argument("--fps", type=float, default=1.0,
                    help="frames per second to keep (default: 1)")
    ap.add_argument("--out", default="frames", help="output directory")
    args = ap.parse_args()

    try:
        import imageio.v3 as iio
        from PIL import Image
    except ImportError:
        sys.stderr.write(
            "Missing dependencies. Install with:\n"
            "  pip3 install --user imageio imageio-ffmpeg pillow\n"
        )
        sys.exit(1)

    meta = iio.immeta(args.video, plugin="FFMPEG")
    src_fps = meta["fps"]
    duration = meta.get("duration", 0)
    print(f"video:    {args.video}")
    print(f"fps:      {src_fps:.2f}")
    print(f"duration: {duration:.1f}s")
    print(f"out:      {args.out}/")

    os.makedirs(args.out, exist_ok=True)
    step = src_fps / args.fps
    saved = 0
    next_keep = 0.0

    for idx, frame in enumerate(iio.imiter(args.video, plugin="FFMPEG")):
        if idx >= next_keep:
            sec = idx / src_fps
            path = os.path.join(args.out, f"t{int(sec):03d}.jpg")
            Image.fromarray(frame).save(path, quality=82)
            saved += 1
            next_keep += step

    print(f"saved {saved} frames.")


if __name__ == "__main__":
    main()
