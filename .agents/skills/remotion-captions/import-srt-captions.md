---
name: import-srt-captions
description: Importing .srt subtitle files into Remotion captions
metadata:
  tags: captions, srt, subtitles, import, parse
---

# Importing .srt subtitles into Remotion

If you have an existing `.srt` subtitle file, you can import it into Remotion's [`Caption`](https://www.remotion.dev/docs/captions/caption) format using [`parseSrt()`](https://www.remotion.dev/docs/captions/parse-srt) from `@remotion/captions`.

## Prerequisites

First, the [`@remotion/captions`](https://www.remotion.dev/docs/captions) package needs to be installed.
If it is not installed, use the following command:

```bash
npx remotion add @remotion/captions
```

## Reading an .srt file

Use [`staticFile()`](https://www.remotion.dev/docs/staticfile) to reference an `.srt` file from your `public/` folder, and [`useDelayRender()`](https://www.remotion.dev/docs/use-delay-render) to hold the render until the file is loaded:

```tsx
import { useState, useEffect, useCallback } from "react";
import { staticFile, useDelayRender } from "remotion";
import { parseSrt } from "@remotion/captions";
import type { Caption } from "@remotion/captions";

export const MyComponent: React.FC = () => {
  const [captions, setCaptions] = useState<Caption[] | null>(null);
  const { delayRender, continueRender, cancelRender } = useDelayRender();
  const [handle] = useState(() => delayRender());

  const fetchCaptions = useCallback(async () => {
    try {
      const response = await fetch(staticFile("subtitles.srt"));
      const text = await response.text();
      const { captions: parsed } = parseSrt({ input: text });
      setCaptions(parsed);
      continueRender(handle);
    } catch (e) {
      cancelRender(e);
    }
  }, [continueRender, cancelRender, handle]);

  useEffect(() => {
    fetchCaptions();
  }, [fetchCaptions]);

  if (!captions) {
    return null;
  }

  return <div>/* Render captions here */</div>;
};
```

Place your `.srt` file in the `public/` folder of your Remotion project.

## Parsing outside of a component

You can also parse an `.srt` file in a standalone script and save the result as JSON for use with [`staticFile()`](https://www.remotion.dev/docs/staticfile):

```tsx
import { readFileSync, writeFileSync } from "fs";
import { parseSrt } from "@remotion/captions";

const input = readFileSync("./public/subtitles.srt", "utf-8");
const { captions } = parseSrt({ input });

writeFileSync("./public/captions.json", JSON.stringify(captions, null, 2));
```

Run with:

```bash
node --strip-types parse-srt.ts
```

Then load `captions.json` in your component as shown in [display-captions.md](display-captions.md).

## Next steps

Once imported, display the captions by following [display-captions.md](display-captions.md).
