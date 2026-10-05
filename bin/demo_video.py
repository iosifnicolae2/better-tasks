"""Makes a narrated before/after demo video from screen recordings or screenshots.

Run through bin/demo-video.sh (it picks Kokoro's Python). Usage: demo-video.sh spec.json [--quality low|medium|high]
Quality (the setting videoQuality, medium by default): low fits 1280x720 in a small file, medium fits
1920x1080, high fits 1920x1080 sharper in a bigger file. The video is scaled to fit, up or down.
The video goes to <project>/.claude/tasks_videos/<name> (the main checkout's, also from a worktree;
$BETTER_TASKS_VIDEOS overrides the folder), which git ignores; its file:// link is printed last.
Next to it, <name>.png: the poster, for a PR to show as a picture that opens the video (its link is
printed first). BEFORE and AFTER side by side, each labeled and zoomed on what the task changed, its
sentence under it, a big play button between them. Each half is one step of the first and the last
clip: the step marked "poster", else the last one with a box. It shows that step's "focus" area, else
its boxes and arrows with room around them (never less than a third of the frame wide).
Each clip gets its BEFORE/AFTER label top-left, red boxes and arrows, burned-in subtitles
and the subtitles read aloud by Kokoro. Overlays are drawn with Pillow, so ffmpeg needs no
libass or freetype. The spec (paths relative to the spec file):

{
  "title": "T-004 Fix login redirect",          optional opening card
  "name": "T-004.mp4",                          the task id: a new video for the task replaces the old
  "voice": "af_heart",                          optional Kokoro voice
  "clips": [
    {"label": "BEFORE", "video": "before.mp4",  or leave out "video" and give each step an "image"
     "steps": [
       {"say": "After login you land on the home page.",
        "at": 1.5,                              optional: start no earlier than this second of the clip
        "image": "before-1.png",                image clips only; a step without one keeps the last
        "marks": [{"box": [x, y, w, h]}, {"arrow": [x1, y1, x2, y2]}],  pixels of the video or image
        "poster": true,                         optional: this step's frame goes in the poster
        "focus": [x, y, w, h]}                  optional: the poster shows this area of it
     ]},
    {"label": "AFTER", ...}
  ]
}
"""

import argparse
import json
import os
import subprocess
import sys
import tempfile
import warnings
from pathlib import Path

import numpy as np
import soundfile as sf
from PIL import Image, ImageDraw, ImageFont

RATE = 24000
# Per quality: the box the video fits in (long side, short side) and x264's settings (lower crf: sharper, bigger).
QUALITIES = {
    'low': {'box': (1280, 720), 'crf': 28, 'preset': 'medium'},
    'medium': {'box': (1920, 1080), 'crf': 23, 'preset': 'medium'},
    'high': {'box': (1920, 1080), 'crf': 18, 'preset': 'slow'},
}
quality = QUALITIES['medium']  # main() sets the chosen one
FPS = 30
LEAD_IN = 0.6
GAP = 0.5
TAIL = 0.8
TITLE_SECONDS = 2.5
POSTER_DELAY = 1.0  # a video clip's poster frame: this long into its poster step
POSTER_WIDTH = 1920  # at every quality: GitHub shows it about 880 px wide, so its text stays readable
POSTER_GAP = 48
POSTER_BUTTON = 180  # the play button's size on the poster
FOCUS_ROOM = 0.35  # room around the marks a poster half zooms on, as a share of their size
FOCUS_MIN = 1 / 3  # a poster half shows at least this share of the frame's width
POSTER_BACKGROUND = (22, 24, 29, 255)
LOUD_PEAK = 0.89  # -1 dBFS
RED = (230, 30, 40, 255)
WHITE = (255, 255, 255, 255)
LABEL_COLORS = {'BEFORE': (180, 83, 9, 235), 'AFTER': (21, 128, 61, 235)}
FONTS = [
    '/System/Library/Fonts/Supplemental/Arial Bold.ttf',
    '/System/Library/Fonts/Helvetica.ttc',
    '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
]


def main(spec_path: str, quality_name: str) -> None:
    global quality
    quality = QUALITIES[quality_name]
    spec_file = Path(spec_path).resolve()
    spec = json.loads(spec_file.read_text())
    base = spec_file.parent
    output = videos_dir() / Path(spec['name']).name
    clips = spec['clips']
    canvas = canvas_size(source_size(base, clips[0]))
    voice = Voice(spec.get('voice', 'af_heart'))
    with tempfile.TemporaryDirectory(prefix='demo-video-') as tmp:
        work = Path(tmp)
        parts = [title_card(work, canvas, spec['title'])] if spec.get('title') else []
        rendered = [render_clip(work / f'clip{i}', base, clip, canvas, voice) for i, clip in enumerate(clips)]
        join(work, parts + [path for path, _ in rendered], output)
        poster = make_poster(work, base, clips, [starts for _, starts in rendered], output)
    print(poster.as_uri())
    print(output.as_uri())


def videos_dir() -> Path:
    custom = os.environ.get('BETTER_TASKS_VIDEOS')
    folder = Path(custom) if custom else project_root() / '.claude' / 'tasks_videos'
    folder.mkdir(parents=True, exist_ok=True)
    ignore = folder / '.gitignore'
    if not ignore.exists():
        ignore.write_text('# Before/after videos (better-tasks): kept out of git.\n*\n')
    return folder


def project_root() -> Path:
    """The main checkout, also from a teammate's worktree (its git dir is shared); else the current folder."""
    done = subprocess.run(['git', 'rev-parse', '--path-format=absolute', '--git-common-dir'], capture_output=True, text=True)
    return Path(done.stdout.strip()).parent if done.returncode == 0 else Path.cwd()


# ---- Sizes ----

def probe(video: Path) -> dict:
    out = run(['ffprobe', '-v', 'error', '-select_streams', 'v:0', '-show_entries',
               'stream=width,height:stream_side_data=rotation:format=duration', '-of', 'json', str(video)])
    info = json.loads(out)
    stream = info['streams'][0]
    rotation = next((abs(int(d.get('rotation', 0))) for d in stream.get('side_data_list', [])), 0)
    width, height = stream['width'], stream['height']
    if rotation == 90:
        width, height = height, width
    return {'size': (width, height), 'duration': float(info['format']['duration'])}


def source_size(base: Path, clip: dict) -> tuple:
    if clip.get('video'):
        return probe(base / clip['video'])['size']
    with Image.open(base / clip['steps'][0]['image']) as image:
        return image.size


def canvas_size(size: tuple) -> tuple:
    """`size` scaled to fit the quality's box, turned to match: a portrait source fits 1080x1920."""
    long_side, short_side = quality['box']
    scale = min(long_side / max(size), short_side / min(size))
    return tuple(int(side * scale) // 2 * 2 for side in size)


class Fit:
    """Where a source of `size` lands when fitted into `canvas`: scale and offset."""

    def __init__(self, size: tuple, canvas: tuple):
        self.scale = min(canvas[0] / size[0], canvas[1] / size[1])
        self.dx = (canvas[0] - size[0] * self.scale) / 2
        self.dy = (canvas[1] - size[1] * self.scale) / 2

    def point(self, x: float, y: float) -> tuple:
        return (self.dx + x * self.scale, self.dy + y * self.scale)


# ---- Voice ----

SYSTEM_ESPEAK = [
    '/opt/homebrew/lib/libespeak-ng.dylib',
    '/usr/local/lib/libespeak-ng.dylib',
    '/usr/lib/x86_64-linux-gnu/libespeak-ng.so.1',
    '/usr/lib/aarch64-linux-gnu/libespeak-ng.so.1',
]


def quiet() -> None:
    """Torch's deprecation warnings and Kokoro's log lines say nothing to whoever makes the video."""
    from loguru import logger
    warnings.filterwarnings('ignore')
    logger.remove()


def use_system_espeak() -> None:
    """The espeak-ng bundled with Kokoro's misaki looks for its data on its build machine and exits.
    A system espeak-ng works; without one, Kokoro skips the few words its dictionary lacks."""
    from misaki import espeak
    from phonemizer.backend.espeak.wrapper import EspeakWrapper
    library = next((path for path in SYSTEM_ESPEAK if Path(path).exists()), None)
    if library:
        EspeakWrapper.set_library(library)
        EspeakWrapper.set_data_path(None)
    else:
        def missing(*_, **__):
            raise RuntimeError('no system espeak-ng')
        espeak.EspeakFallback = missing


class Voice:
    def __init__(self, name: str):
        quiet()
        use_system_espeak()
        from kokoro import KPipeline
        self.name = name
        self.pipeline = KPipeline(lang_code=name[0], repo_id='hexgrad/Kokoro-82M')

    def say(self, text: str) -> np.ndarray:
        chunks = [np.asarray(audio) for _, _, audio in self.pipeline(text, voice=self.name) if audio is not None]
        return np.concatenate(chunks) if chunks else np.zeros(0, dtype=np.float32)


# ---- Drawing ----

def font(size: int):
    for path in FONTS:
        if Path(path).exists():
            return ImageFont.truetype(path, size)
    return ImageFont.load_default(size)


def overlay(canvas: tuple, label: str, step: dict | None, fit: Fit | None) -> Image.Image:
    """One transparent frame: the step's marks and subtitle, then the label top-left over them."""
    image = Image.new('RGBA', canvas, (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    unit = max(canvas) / 1000
    if step:
        for mark in step.get('marks', []):
            draw_mark(draw, mark, fit, unit)
        draw_subtitle(draw, step['say'], canvas, unit)
    draw_label(draw, label, unit)
    return image


def draw_label(draw: ImageDraw.ImageDraw, label: str, unit: float) -> None:
    text_font = font(round(34 * unit))
    pad, margin = 14 * unit, 20 * unit
    left, top, right, bottom = draw.textbbox((margin + pad, margin + pad), label, font=text_font)
    color = LABEL_COLORS.get(label.upper(), (30, 30, 30, 235))
    draw.rounded_rectangle((margin, margin, right + pad, bottom + pad), radius=10 * unit, fill=color)
    draw.text((margin + pad, margin + pad), label, font=text_font, fill=WHITE)


def draw_mark(draw: ImageDraw.ImageDraw, mark: dict, fit: Fit, unit: float) -> None:
    width = max(3, round(6 * unit))
    if 'box' in mark:
        x, y, w, h = mark['box']
        (left, top), (right, bottom) = fit.point(x, y), fit.point(x + w, y + h)
        line = max(3, min(width, round(min(right - left, bottom - top) / 5)))  # thin around a small target
        rim = line + max(2, line // 2)
        corners = (left - rim, top - rim, right + rim, bottom + rim)  # around the target, never over it
        draw.rounded_rectangle(corners, radius=6 * unit, outline=WHITE, width=rim)
        draw.rounded_rectangle(corners, radius=6 * unit, outline=RED, width=line)
    if 'arrow' in mark:
        x1, y1, x2, y2 = mark['arrow']
        start, tip = fit.point(x1, y1), fit.point(x2, y2)
        draw_arrow(draw, start, tip, width + 4, WHITE)
        draw_arrow(draw, start, tip, width, RED)


def draw_arrow(draw: ImageDraw.ImageDraw, start: tuple, tip: tuple, width: int, color: tuple) -> None:
    direction = np.subtract(tip, start)
    length = float(np.hypot(*direction)) or 1.0
    along = direction / length
    across = np.array([-along[1], along[0]])
    head = min(length * 0.6, width * 4.5)
    neck = np.subtract(tip, along * head)
    draw.line([start, tuple(neck)], fill=color, width=width)
    wing = across * head * 0.6
    draw.polygon([tip, tuple(neck + wing), tuple(neck - wing)], fill=color)


def draw_subtitle(draw: ImageDraw.ImageDraw, text: str, canvas: tuple, unit: float) -> None:
    text_font = font(round(30 * unit))
    lines = wrap(draw, text, text_font, canvas[0] * 0.86)
    spacing = 8 * unit
    block = '\n'.join(lines)
    left, top, right, bottom = draw.multiline_textbbox((0, 0), block, font=text_font, spacing=spacing, align='center')
    pad = 14 * unit
    x = (canvas[0] - (right - left)) / 2
    y = canvas[1] - (bottom - top) - 40 * unit
    draw.rounded_rectangle((x - pad, y - pad, x + right - left + pad, y + bottom - top + pad),
                           radius=10 * unit, fill=(0, 0, 0, 190))
    draw.multiline_text((x - left, y - top), block, font=text_font, fill=WHITE, spacing=spacing, align='center')


def wrap(draw: ImageDraw.ImageDraw, text: str, text_font, max_width: float) -> list:
    lines, line = [], ''
    for word in text.split():
        candidate = f'{line} {word}'.strip()
        if line and draw.textlength(candidate, font=text_font) > max_width:
            lines.append(line)
            line = word
        else:
            line = candidate
    return lines + [line] if line else lines


def fitted(path: Path, canvas: tuple) -> tuple:
    """A screenshot fitted on a black canvas, and how it was fitted."""
    with Image.open(path) as source:
        fit = Fit(source.size, canvas)
        size = (round(source.width * fit.scale), round(source.height * fit.scale))
        frame = Image.new('RGBA', canvas, (0, 0, 0, 255))
        frame.paste(source.convert('RGBA').resize(size, Image.LANCZOS), (round(fit.dx), round(fit.dy)))
        return frame, fit


# ---- Timeline and rendering ----

def timeline(steps: list, voice: Voice) -> tuple:
    """Each step's start and narration, and the narration's end."""
    clock, timed = LEAD_IN, []
    for step in steps:
        audio = voice.say(step['say'])
        start = max(clock, float(step.get('at', 0)))
        timed.append((start, audio))
        clock = start + len(audio) / RATE + GAP
    return timed, clock - GAP


def render_clip(work: Path, base: Path, clip: dict, canvas: tuple, voice: Voice) -> tuple:
    """The clip as an mp4, and the second each of its steps starts at."""
    work.mkdir()
    steps, label = clip['steps'], clip['label']
    timed, spoken_until = timeline(steps, voice)
    video = base / clip['video'] if clip.get('video') else None
    length = max(probe(video)['duration'] if video else 0, spoken_until + TAIL)
    write_narration(work / 'voice.wav', timed, length)

    starts = [start for start, _ in timed]
    bounds = list(zip([0.0] + starts, starts + [length]))
    frames = []
    shot, shot_fit = None, None
    for index, (begin, end) in enumerate(bounds):
        step = steps[index - 1] if index > 0 else None
        if video:
            fit = Fit(probe(video)['size'], canvas)
            frame = overlay(canvas, label, step, fit)
        else:
            image = (step or steps[0]).get('image')
            if image:
                shot, shot_fit = fitted(base / image, canvas)
            frame = Image.alpha_composite(shot, overlay(canvas, label, step, shot_fit))
        path = work / f'frame{index}.png'
        frame.save(path)
        frames.append((path, end - begin))
    frame_list = write_frame_list(work / 'frames.txt', frames)

    out = work / 'clip.mp4'
    if video:
        width, height = canvas
        graph = (f'[0:v]scale={width}:{height}:force_original_aspect_ratio=decrease,'
                 f'pad={width}:{height}:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1,fps={FPS},'
                 f'tpad=stop_mode=clone:stop_duration={length}[base];'
                 f'[base][1:v]overlay=format=auto,format=yuv420p[v]')
        inputs = ['-i', str(video), '-f', 'concat', '-safe', '0', '-i', str(frame_list)]
        audio_input = '2:a'
    else:
        graph = f'[0:v]fps={FPS},format=yuv420p[v]'
        inputs = ['-f', 'concat', '-safe', '0', '-i', str(frame_list)]
        audio_input = '1:a'
    encode(inputs + ['-i', str(work / 'voice.wav')], graph, audio_input, length, out)
    return out, starts


def write_narration(path: Path, timed: list, length: float) -> None:
    track = np.zeros(int(length * RATE) + 1, dtype=np.float32)
    for start, audio in timed:
        at = int(start * RATE)
        end = min(len(track), at + len(audio))
        track[at:end] += audio[: end - at]
    peak = float(np.abs(track).max())
    if peak > 0:
        track *= LOUD_PEAK / peak  # Kokoro speaks softly; the voice should be clear at normal volume
    sf.write(path, track, RATE)


def write_frame_list(path: Path, frames: list) -> Path:
    """An ffconcat list: each frame for its seconds; the last one repeated so its time counts."""
    lines = ['ffconcat version 1.0']
    for frame, seconds in frames:
        lines += [f"file '{frame}'", f'duration {max(seconds, 1 / FPS):.3f}']
    lines.append(f"file '{frames[-1][0]}'")
    path.write_text('\n'.join(lines) + '\n')
    return path


def title_card(work: Path, canvas: tuple, title: str) -> Path:
    image = Image.new('RGB', canvas, (18, 18, 22))
    draw = ImageDraw.Draw(image)
    unit = max(canvas) / 1000
    title_font, small_font = font(round(44 * unit)), font(round(26 * unit))
    block = '\n'.join(wrap(draw, title, title_font, canvas[0] * 0.85))
    left, top, right, bottom = draw.multiline_textbbox((0, 0), block, font=title_font, align='center')
    x, y = (canvas[0] - (right - left)) / 2 - left, (canvas[1] - (bottom - top)) / 2 - top - 20 * unit
    draw.multiline_text((x, y), block, font=title_font, fill=WHITE, align='center')
    draw.text((canvas[0] / 2, y + bottom + 40 * unit), 'Before  →  After', font=small_font,
              fill=(200, 200, 200), anchor='mt')
    still = work / 'title.png'
    image.save(still)
    out = work / 'title.mp4'
    inputs = ['-loop', '1', '-i', str(still), '-f', 'lavfi', '-i', f'anullsrc=r={RATE}:cl=mono']
    encode(inputs, f'[0:v]fps={FPS},format=yuv420p[v]', '1:a', TITLE_SECONDS, out)
    return out


def encode(inputs: list, graph: str, audio: str, seconds: float, out: Path) -> None:
    run(['ffmpeg', '-y', '-v', 'error', *inputs, '-filter_complex', graph, '-map', '[v]', '-map', audio,
         '-t', f'{seconds:.3f}', '-c:v', 'libx264', '-preset', quality['preset'], '-crf', str(quality['crf']), '-pix_fmt', 'yuv420p',
         '-c:a', 'aac', '-ar', '48000', '-ac', '2', '-b:a', '128k', str(out)])


def join(work: Path, parts: list, output: Path) -> None:
    listing = work / 'parts.txt'
    listing.write_text(''.join(f"file '{part}'\n" for part in parts))
    output.parent.mkdir(parents=True, exist_ok=True)
    run(['ffmpeg', '-y', '-v', 'error', '-f', 'concat', '-safe', '0', '-i', str(listing),
         '-c', 'copy', '-movflags', '+faststart', str(output)])


# ---- Poster: BEFORE and AFTER side by side, zoomed on what changed ----

def make_poster(work: Path, base: Path, clips: list, starts: list, video: Path) -> Path:
    """The first and the last clip's poster steps side by side, a play button between them, as <video>.png."""
    chosen = [0, len(clips) - 1] if len(clips) > 1 else [0]
    halves = [poster_half(work, base, clips[i], starts[i]) for i in chosen]
    button = POSTER_BUTTON
    middle = button + POSTER_GAP if len(halves) > 1 else 0  # the play button sits between the halves, over neither
    panel_w = (POSTER_WIDTH - 2 * POSTER_GAP - middle) // len(halves)
    frame = halves[0]['frame']
    shape = min(max(frame.width / frame.height, 3 / 4), 16 / 9) if len(halves) > 1 else 16 / 9  # one half: never taller than wide
    panel_h = round(panel_w / shape)
    unit = POSTER_WIDTH / 1000
    label_font, caption_font = font(round(24 * unit)), font(round(17 * unit))
    measure = ImageDraw.Draw(Image.new('RGBA', (1, 1)))
    captions = [wrap(measure, half['say'], caption_font, panel_w)[:3] for half in halves]
    line_h = round(caption_font.size * 1.3)
    label_h = round(label_font.size * 1.9)
    panel_top = POSTER_GAP + label_h + POSTER_GAP // 2
    caption_top = panel_top + panel_h + POSTER_GAP // 2
    height = caption_top + max(len(lines) for lines in captions) * line_h + POSTER_GAP
    poster = Image.new('RGBA', (POSTER_WIDTH, height), POSTER_BACKGROUND)
    draw = ImageDraw.Draw(poster)
    for index, (half, lines) in enumerate(zip(halves, captions)):
        left = POSTER_GAP + index * (panel_w + middle)
        color = LABEL_COLORS.get(half['label'].upper(), (90, 90, 90, 235))
        draw_pill(draw, half['label'], label_font, (left, POSTER_GAP), label_h, color)
        poster.alpha_composite(zoomed(half['frame'], half['area'], (panel_w, panel_h)), (left, panel_top))
        draw.rectangle((left - 5, panel_top - 5, left + panel_w + 4, panel_top + panel_h + 4), outline=color, width=6)
        for row, line in enumerate(lines):
            draw.text((left, caption_top + row * line_h), line, font=caption_font, fill=WHITE)
    poster.alpha_composite(play_button(button), ((POSTER_WIDTH - button) // 2, panel_top + (panel_h - button) // 2))
    out = video.with_suffix('.png')
    poster.convert('RGB').save(out, optimize=True)
    return out


def draw_pill(draw: ImageDraw.ImageDraw, text: str, text_font, origin: tuple, height: int, color: tuple) -> None:
    """A label in a rounded box `height` tall, its top-left at `origin`."""
    left, top, right, bottom = draw.textbbox((0, 0), text, font=text_font)
    pad = height * 0.45
    draw.rounded_rectangle((origin[0], origin[1], origin[0] + right - left + 2 * pad, origin[1] + height), radius=height * 0.22, fill=color)
    draw.text((origin[0] + pad - left, origin[1] + (height - (bottom - top)) / 2 - top), text, font=text_font, fill=WHITE)


def poster_step(clip: dict) -> int:
    """The step a poster half shows: the one marked "poster", else the last with a box, else the last."""
    steps = clip['steps']
    marked = [i for i, step in enumerate(steps) if step.get('poster')]
    boxed = [i for i, step in enumerate(steps) if any('box' in mark for mark in step.get('marks', []))]
    if marked:
        return marked[0]
    return boxed[-1] if boxed else len(steps) - 1


def poster_half(work: Path, base: Path, clip: dict, starts: list) -> dict:
    """One half: the poster step's frame at source size with its marks, the area to show, its label and sentence."""
    index = poster_step(clip)
    step = clip['steps'][index]
    frame = step_frame(work, base, clip, index, starts[index])
    draw = ImageDraw.Draw(frame)
    for mark in step.get('marks', []):
        draw_mark(draw, mark, Fit(frame.size, frame.size), max(frame.size) / 1000)
    return {'frame': frame, 'area': focus_area(step, frame.size), 'label': clip['label'], 'say': step['say']}


def step_frame(work: Path, base: Path, clip: dict, index: int, start: float) -> Image.Image:
    """The source picture under a step: its image (or the last one before it), or the video's frame then."""
    if not clip.get('video'):
        image = next(step['image'] for step in reversed(clip['steps'][:index + 1]) if step.get('image'))
        with Image.open(base / image) as source:
            return source.convert('RGBA')
    video = base / clip['video']
    moment = min(start + POSTER_DELAY, probe(video)['duration'] - 0.1)
    path = work / f'poster-{clip["label"]}-{index}.png'
    run(['ffmpeg', '-y', '-v', 'error', '-ss', f'{moment:.3f}', '-i', str(video), '-frames:v', '1', str(path)])
    with Image.open(path) as source:
        return source.convert('RGBA')


def focus_area(step: dict, size: tuple) -> tuple:
    """(left, top, right, bottom) a poster half shows: the step's "focus", else its marks with room, else all."""
    if step.get('focus'):
        x, y, w, h = step['focus']
        return clamp_area((x, y, x + w, y + h), size)
    points = []
    for mark in step.get('marks', []):
        if 'box' in mark:
            x, y, w, h = mark['box']
            points += [(x, y), (x + w, y + h)]
        if 'arrow' in mark:
            x1, y1, x2, y2 = mark['arrow']
            points += [(x1, y1), (x2, y2)]
    if not points:
        return (0, 0, size[0], size[1])
    xs, ys = [p[0] for p in points], [p[1] for p in points]
    room = FOCUS_ROOM * max(max(xs) - min(xs), max(ys) - min(ys))
    left, top, right, bottom = min(xs) - room, min(ys) - room, max(xs) + room, max(ys) + room
    least = size[0] * FOCUS_MIN / 2
    middle = (left + right) / 2
    left, right = min(left, middle - least), max(right, middle + least)
    return clamp_area((left, top, right, bottom), size)


def clamp_area(area: tuple, size: tuple) -> tuple:
    """The area moved, then cut, to lie inside the frame."""
    left, top, right, bottom = area
    width, height = min(right - left, size[0]), min(bottom - top, size[1])
    left = min(max(left, 0), size[0] - width)
    top = min(max(top, 0), size[1] - height)
    return (left, top, left + width, top + height)


def zoomed(frame: Image.Image, area: tuple, panel: tuple) -> Image.Image:
    """The area grown to the panel's shape where the frame allows, scaled into the panel, centered on the background."""
    left, top, right, bottom = area
    width, height = right - left, bottom - top
    shape = panel[0] / panel[1]
    grown_w, grown_h = max(width, height * shape), max(height, width / shape)
    middle_x, middle_y = (left + right) / 2, (top + bottom) / 2
    area = clamp_area((middle_x - grown_w / 2, middle_y - grown_h / 2, middle_x + grown_w / 2, middle_y + grown_h / 2), frame.size)
    crop = frame.crop(tuple(round(side) for side in area))
    scale = min(panel[0] / crop.width, panel[1] / crop.height)
    resized = crop.resize((max(1, round(crop.width * scale)), max(1, round(crop.height * scale))), Image.LANCZOS)
    out = Image.new('RGBA', panel, POSTER_BACKGROUND)
    out.alpha_composite(resized, ((panel[0] - resized.width) // 2, (panel[1] - resized.height) // 2))
    return out


def play_button(size: int) -> Image.Image:
    """A dark round button with a white ring and triangle, drawn 4x large and shrunk for smooth edges."""
    big = size * 4
    image = Image.new('RGBA', (big, big), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    draw.ellipse((0, 0, big - 1, big - 1), fill=(0, 0, 0, 190), outline=(255, 255, 255, 235), width=big // 30)
    middle, reach = big / 2, big * 0.21
    draw.polygon([(middle - reach * 0.75, middle - reach), (middle - reach * 0.75, middle + reach),
                  (middle + reach * 1.05, middle)], fill=WHITE)
    return image.resize((size, size), Image.LANCZOS)


def run(argv: list) -> str:
    done = subprocess.run(argv, capture_output=True, text=True)
    if done.returncode != 0:
        sys.exit(f'{argv[0]} failed: {done.stderr.strip()[-2000:]}')
    return done.stdout


if __name__ == '__main__':
    if sys.argv[1:] == ['--check']:
        Voice('af_heart').say('Ready.')  # setup: fetches the model and voice once
        print('ready')
    else:
        parser = argparse.ArgumentParser(prog='demo-video.sh')
        parser.add_argument('spec')
        parser.add_argument('--quality', choices=QUALITIES, default='medium')
        args = parser.parse_args()
        main(args.spec, args.quality)
