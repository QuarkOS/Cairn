---
name: remotion-create
description: Create a new Remotion project
version: 4.0.513
---

# Create a new Remotion project

## Prerequisites

Before creating a new Remotion project, ask the user which package manager they want to use: npm, yarn, pnpm, or bun.

## Creating the project

Run the following command, replacing `{package-manager}` with the user's choice:

```bash
{package-manager} create video@latest --blank --no-open --no-tailwind
```

The `--blank` flag creates a minimal project without example code.
The `--no-open` flag prevents the Remotion Studio from opening automatically.
The `--no-tailwind` flag creates a project without Tailwind CSS.

## After creation

1. Install dependencies:

   ```bash
   cd <project-name> && {package-manager} install
   ```

2. Start the Remotion Studio:

   ```bash
   {package-manager} exec remotion studio
   ```

3. Open the URL printed in the terminal in the browser.
