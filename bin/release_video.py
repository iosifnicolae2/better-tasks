"""Makes a release's video: every task shipped since the previous release, each with its own before/after video.

Run through bin/release-video.sh (it picks Kokoro's Python).
Usage: release-video.sh --version v0.12.0 [--since v0.11.3] [--until main] [--quality low|medium|high]
The tasks are the commits in since..until whose subject starts with a task id ("T-052 ..."; the prefix
is the project's taskPrefix). The video: an opening card (the version, what it ships, the tasks without
a video), then per task a card with its id and title and its own before/after video, as the video skill
made it. The video and its poster (the opening card with a play button) go next to the task videos,
release-<version>.mp4 and .png; prints the poster's path, then the video's.
Exits 3 when no shipped task has a video: there is nothing to show.

Why the tasks' own videos and not fresh captures of the two releases: each one was recorded by the
teammate who knew how to reach the feature and where to point, and the user accepted it. A script
can't drive an arbitrary app to every feature. Each task's BEFORE is the code before that task: the
previous release, plus any task of this release merged before it.
"""

import argparse
import json
import re
import subprocess
import sys
import tempfile
from pathlib import Path

from PIL import Image, ImageDraw

sys.path.insert(0, str(Path(__file__).parent))
import demo_video as demo  # noqa: E402

VIDEOS_BRANCH = 'refs/remotes/origin/better-tasks-videos'
NO_VIDEO = 3
CARD_BACKGROUND = demo.POSTER_BACKGROUND
MUTED = (170, 175, 185, 255)
ACCENT = (215, 119, 87, 255)
MAX_LISTED = 9  # the opening card lists this many tasks, then "and N more"


def main() -> None:
    parser = argparse.ArgumentParser(prog='release-video.sh')
    parser.add_argument('--version', required=True)
    parser.add_argument('--since', default='')
    parser.add_argument('--until', default='HEAD')
    parser.add_argument('--quality', choices=demo.QUALITIES, default='medium')
    args = parser.parse_args()
    demo.quality = demo.QUALITIES[args.quality]
    canvas = demo.quality['box']

    tasks = shipped_tasks(args.since, args.until, task_prefix())
    with tempfile.TemporaryDirectory(prefix='release-video-') as tmp:
        work = Path(tmp)
        for task in tasks:
            task['video'] = task_video(task['id'], work)
        shown = [task for task in tasks if task['video']]
        if not shown:
            print(f'release-video: none of the {len(tasks)} tasks since {args.since or "the start"} has a video', file=sys.stderr)
            sys.exit(NO_VIDEO)

        voice = demo.Voice('af_heart')
        opening = draw_opening(work / 'opening.png', canvas, args.version, args.since, tasks)
        parts = [card_clip(work, 'opening', opening, args.version, opening_words(args.version, args.since, shown), canvas, voice, True)]
        for number, task in enumerate(shown, 1):
            card = draw_task_card(work / f'{task["id"]}.png', canvas, task, number, len(shown))
            parts.append(card_clip(work, task['id'], card, task['id'], f'{task["id"]}: {task["title"]}', canvas, voice, False))
            parts.append(fitted_video(task['video'], canvas, work / f'{task["id"]}-fitted.mp4'))
        output = demo.videos_dir() / f'release-{args.version}.mp4'
        demo.join(work, parts, output)
        poster = make_poster(opening, output.with_suffix('.png'))
    print(poster)
    print(output)


# ---- What shipped ----

def task_prefix() -> str:
    config = demo.project_root() / '.claude' / 'tasks' / 'config.json'
    try:
        return str(json.loads(config.read_text()).get('taskPrefix', 'T-'))
    except (OSError, ValueError):
        return 'T-'


def shipped_tasks(since: str, until: str, prefix: str) -> list:
    """Each task id the commits since..until start their subject with, in order, with its first subject as title."""
    span = f'{since}..{until}' if since else until
    subjects = demo.run(['git', 'log', '--reverse', '--format=%s', span]).splitlines()
    pattern = re.compile(rf'^({re.escape(prefix)}\d+)\b[\s:]*(.*?)(\s*\(#\d+\))?$')
    tasks, seen = [], set()
    for subject in subjects:
        match = pattern.match(subject)
        if match and match.group(1) not in seen:
            seen.add(match.group(1))
            tasks.append({'id': match.group(1), 'title': match.group(2) or match.group(1)})
    return tasks


def task_video(task_id: str, work: Path) -> Path | None:
    """The task's video: the project's own copy (bin/demo-video.sh's folder), else the one on the videos branch."""
    for folder in (demo.videos_dir(), demo.project_root() / '.claude' / 'tasks_videos'):
        if (folder / f'{task_id}.mp4').exists():
            return folder / f'{task_id}.mp4'
    name = f'{VIDEOS_BRANCH}:{task_id}.mp4'
    if subprocess.run(['git', 'cat-file', '-e', name], capture_output=True).returncode != 0:
        return None
    path = work / f'{task_id}-branch.mp4'
    with path.open('wb') as out:
        subprocess.run(['git', 'cat-file', 'blob', name], stdout=out, check=True)
    return path


# ---- Cards ----

def opening_words(version: str, since: str, shown: list) -> str:
    count = f'{len(shown)} change{"s" if len(shown) != 1 else ""}'
    return f'{project_name()} {version}: {count}{f" since {since}" if since else ""}, each before and after.'


def project_name() -> str:
    return demo.project_root().name


def draw_opening(path: Path, canvas: tuple, version: str, since: str, tasks: list) -> Path:
    """The version big, what it is compared with, then the shipped tasks; those without a video are marked."""
    image, draw, unit = blank(canvas)
    left, top = 90 * unit, 190 * unit  # below the clip's label, top-left
    draw.text((left, top), project_name(), font=demo.font(round(34 * unit)), fill=MUTED)
    draw.text((left, top + 50 * unit), version, font=demo.font(round(96 * unit)), fill=demo.WHITE)
    compared = f'Before: {since}   After: {version}' if since else f'Everything up to {version}'
    draw.text((left, top + 180 * unit), compared, font=demo.font(round(30 * unit)), fill=ACCENT)
    line_font = demo.font(round(26 * unit))
    y = top + 250 * unit
    for task in tasks[:MAX_LISTED]:
        mark = '' if task['video'] else '   (no video)'
        line = f'{task["id"]}  {task["title"]}{mark}'
        draw.text((left, y), clipped(draw, line, line_font, canvas[0] - 2 * left), font=line_font,
                  fill=demo.WHITE if task['video'] else MUTED)
        y += 38 * unit
    if len(tasks) > MAX_LISTED:
        draw.text((left, y), f'and {len(tasks) - MAX_LISTED} more', font=line_font, fill=MUTED)
    image.convert('RGB').save(path)
    return path


def draw_task_card(path: Path, canvas: tuple, task: dict, number: int, total: int) -> Path:
    image, draw, unit = blank(canvas)
    left = 90 * unit
    draw.text((left, 340 * unit), f'{number} of {total}', font=demo.font(round(30 * unit)), fill=MUTED)
    draw.text((left, 390 * unit), task['id'], font=demo.font(round(110 * unit)), fill=ACCENT)
    image.convert('RGB').save(path)
    return path


def blank(canvas: tuple) -> tuple:
    image = Image.new('RGBA', canvas, CARD_BACKGROUND)
    return image, ImageDraw.Draw(image), max(canvas) / 1920


def clipped(draw: ImageDraw.ImageDraw, text: str, text_font, width: float) -> str:
    while draw.textlength(text, font=text_font) > width and len(text) > 1:
        text = text[:-2] + '…'
    return text


def card_clip(work: Path, name: str, card: Path, label: str, say: str, canvas: tuple, voice, is_first: bool) -> Path:
    """A card shown while its sentence is read aloud, as a subtitle too: demo-video's image clip."""
    clip = {'label': label, 'steps': [{'say': say, 'image': card.name}]}
    path, _ = demo.render_clip(work / f'card-{name}', card.parent, clip, canvas, voice, is_first)
    return path


# ---- Task videos, made joinable ----

def fitted_video(video: Path, canvas: tuple, out: Path) -> Path:
    """The task's video re-encoded like the cards (size, frame rate, codecs), so the parts join without re-encoding."""
    width, height = canvas
    graph = (f'[0:v]scale={width}:{height}:force_original_aspect_ratio=decrease,'
             f'pad={width}:{height}:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1,fps={demo.FPS},format=yuv420p[v]')
    seconds = demo.probe(video)['duration']
    inputs = ['-i', str(video)]
    audio = '0:a'
    if not has_audio(video):
        inputs += ['-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo']
        audio = '1:a'
    demo.encode(inputs, graph, audio, seconds, out)
    return out


def has_audio(video: Path) -> bool:
    streams = demo.run(['ffprobe', '-v', 'error', '-select_streams', 'a', '-show_entries', 'stream=index', '-of', 'csv=p=0', str(video)])
    return bool(streams.strip())


# ---- Poster ----

def make_poster(opening: Path, out: Path) -> Path:
    """The opening card at the poster width with the play button in the middle of its right half."""
    with Image.open(opening) as card:
        scale = demo.POSTER_WIDTH / card.width
        poster = card.convert('RGBA').resize((demo.POSTER_WIDTH, round(card.height * scale)), Image.LANCZOS)
    button = demo.POSTER_BUTTON
    poster.alpha_composite(demo.play_button(button), ((poster.width * 3) // 4 - button // 2, (poster.height - button) // 2))
    poster.convert('RGB').save(out, optimize=True)
    return out


if __name__ == '__main__':
    main()
