---
name: transcribe-captions
description: Transcribing audio to generate captions in Remotion
metadata:
  tags: captions, transcribe, whisper, audio, speech
---

# Transcribing audio in Remotion

To transcribe audio in Remotion, load the [Whisper.cpp](https://www.remotion.dev/docs/install-whisper-cpp/install-whisper-cpp) instructions.

## Prerequisites

First, the [`@remotion/install-whisper-cpp`](https://www.remotion.dev/docs/install-whisper-cpp/install-whisper-cpp) package needs to be installed.
If it is not installed, use the following command:

```bash
npx remotion add @remotion/install-whisper-cpp
```

## Transcribing

Make a Node.js script that transcribes audio and writes `captions.json` to the `public` folder.

Keep the script standalone - don't integrate it into the Remotion render pipeline.

Ensure the script only downloads the model once.

The script should be named `transcribe.ts` and can be invoked using `node --strip-types transcribe.ts`

Here is a template for `transcribe.ts`:

```ts
import {
  downloadWhisperModel,
  installWhisperCpp,
  transcribe,
  toCaptions,
} from "@remotion/install-whisper-cpp";
import path from "path";
import fs from "fs";

// Download model and install Whisper if not already done
const to = path.join(process.cwd(), "whisper.cpp");
await installWhisperCpp({
  to,
  version: "1.5.5",
});
await downloadWhisperModel({
  model: "medium.en",
  folder: to,
});

// Transcribe audio
const whisperCppOutput = await transcribe({
  model: "medium.en",
  whisperPath: to,
  whisperCppVersion: "1.5.5",
  inputPath: "/path/to/audio.wav",
  tokenLevelTimestamps: true,
});

// Convert to captions
const { captions } = toCaptions({
  whisperCppOutput,
});

// Write captions to public folder
fs.writeFileSync(
  "public/captions123.json",
  JSON.stringify(captions, null, 2),
);
```

Run the script with:

```bash
node --strip-types transcribe.ts
```

After running the script, `captions123.json` will be saved in the `public` folder.

Display the captions in your video by following [display-captions.md](display-captions.md).
