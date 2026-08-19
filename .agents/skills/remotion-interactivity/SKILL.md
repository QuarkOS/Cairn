---
name: remotion-interactivity
description: Make compositions editable in Remotion Studio
version: 4.0.513
---

# Remotion Interactivity

Follow these rules when writing Remotion code that should be editable in Remotion Studio.

## Interactive components

Use the interactive components from `@remotion/studio/interactive`:

- `<Interactive.Div>` for divs
- `<Interactive.Span>` for text
- `<Interactive.Img>` for images
- `<Interactive.Video>` for videos
- `<Interactive.Audio>` for audio
- `<Interactive.Sequence>` for sequences

## Keyframes must be inline

Only `interpolate()` calls that are written directly inside the `style` prop are editable in Remotion Studio.

```tsx title="Good interactivity"
<Interactive.Div
  name="Product card"
  style={{
    translate: interpolate(frame, [0, 30], ['0px 0px', '0px 120px'], {
      easing: Easing.spring({damping: 200}),
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp'
    }),
    rotate: interpolate(frame, [0, 30], ['0deg', '20deg'], {
      easing: Easing.bezier(0.16, 1, 0.3, 1),
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp'
    }),
    scale: interpolate(frame, [0, 30], [0, 1], {
      easing: Easing.bezier(0.16, 1, 0.3, 1),
      output: 'perceptual-scale',
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp'
    }),
  }}
/>
```

```tsx title="Bad interactivity"
const translateY = interpolate(frame, [0, 30], [0, 120]); // Bad: Math should be directly in the markup

<Interactive.Div
  name="Product card"
  style={{
    translate: translateY, // Bad: Only inline interpolate() calls are supported,
    rotate: interpolate(frame, [start, start + 10], [0, Math.PI]), // Bad: Cannot use math with arbitrary variables, cannot use constants
    scale: interpolate(anyVariable, [0, 30], [0, 1]) // Bad: Can only interpret the `frame` variable.
  }}
/>
```

## Use `scale`, `translate`, `rotate` CSS properties

Avoid the `transform` CSS property.  
If possible, use `scale`, `rotate` and `translate` instead because only they are interactively editable.

## Keep composition metadata inline

When scaffolding a composition, keep `width`, `height`, `fps`, `durationInFrames` and `defaultProps` inline and make no type assertions.

The Props editor can save visual edits back to your code when `defaultProps` is an inline object literal on `<Composition>` or `<Still>`.

```tsx
// Good: Static values are in <Composition>, dynamic values are in calculateMetadata()
const calculateMetadata = useMemo(async () => {
  const dimensions = await getDimensions(); // just an example
  return {width: dimensions.width, height: dimensions.height};
});

<Composition
  id="my-video"
  component={MyComponent}
  durationInFrames={150}
  fps={30}
  calculateMetadata={calculateMetadata}
  defaultProps={{title: 'Hello', color: '#0b84ff'}}
/>
```

```tsx title="Negative examples"
const defaultProps = {title: 'Hello', color: '#0b84ff'}; // Bad: Don't extract defaultProps, must be inline
const calculateMetadata = useMemo(() => {
  // Bad: Unnecessary because no calculation is being done,
  return {durationInFrames: 150, fps: 30, width: 1920, height: 1080};
});

<Composition
  id="my-video"
  component={MyComponent}
  calculateMetadata={calculateMetadata}
  defaultProps={{
    title: 'Hello',
  } as Props} // Bad: Don't have type assertions, instead type MyComponent correctly
/>
```

Use only `calculateMetadata()` for the part of the metadata that is dynamic.

## Effects should be inline too

The effects array should not be computed.  
The same rules for setting keyframes as `interpolate()` apply too here: All values should also be hardcoded: Input range, output range, easing, extrapolation, `output` property.

```tsx title="Effects"
// Good: Parameters are inline and the array shape is stable
<CanvasImage
  src={src}
  width={1280}
  height={720}
  effects={[
    radialProgressiveBlur({
      center: [0.5, 0.5],
      width: 1.2,
      height: 0.8,
      start: 0.2,
      disabled: true,
      rotation: interpolate(frame, [0, 120], [0, 180]),
    }),
  ]}
/>

const center = [0.5, 0.5] as const;
const rotation = frame * 1.5;

<CanvasImage
  src={src}
  width={1280}
  height={720}
  // Bad: Conditional effect is not animateable
  effects={enabled ? [
    radialProgressiveBlur({
      // Bad: Not inline
      center,
      rotation,
    }),
  ] : []}
/>
```

Render separate elements if one version should have effects and another should not.

## Making your own component interactive

To make a custom userland component interactive, use:
[Make a component interactive](https://www.remotion.dev/docs/studio/make-component-interactive.md)

## Video editing

If a Remotion component mainly consists of video and audio clips, see [Video editing](../remotion-markup/video-editing.md) for best practices on how to structure Remotion markup so the clips are interactively editable in the timeline.
