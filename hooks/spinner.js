// A one-glyph spinner in Claude Code's own style, for tasks being worked on. It runs on the
// surface's frame clock, so it costs the pane no redraws and stops when its row goes away.
const FRAMES = ['·', '✢', '✳', '✶', '✻', '✽', '✻', '✶', '✳', '✢'];
const FRAME_MS = 120;
const Spinner = (props, surface) => {
    if (surface.state === undefined) {
        surface.setState(0);
        surface.every(FRAME_MS, () => surface.setState(((surface.state ?? 0) + 1) % FRAMES.length));
    }
    const { Text } = surface.elements;
    return <Text color="claude">{FRAMES[surface.state ?? 0]}</Text>;
};
export default Spinner;
