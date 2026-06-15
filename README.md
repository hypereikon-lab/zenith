# Zenith

Zenith is a Runway-powered production cockpit for fulldome media. It helps artists and immersive-media creators turn rough image references and still domemaster frames into projection-ready moving dome material.

The project was built for the Runway API Hackathon. Its core workflow is:

1. Compose visual plates as a 180-degree fulldome domemaster.
2. Use Runway image generation/inpaint handoff to complete the rough dome image.
3. Review the result in center, theater, orbit, flat, split, and cutaway dome views.
4. Generate a depth map through Runway.
5. Preview and export depth-aware motion locally with WebGPU and WebCodecs.
6. Plan a Seedance motion-plate repair prompt with Codex.
7. Send the exported MP4 guide to Runway Seedance video-to-video.
8. Or plan a still-image motion prompt and send the inpainted image directly to Seedance image-to-video.

## Why It Exists

Most AI image and video tools think in rectangular frames. Fulldome production needs spatial authorship: placement, scale, orientation, projection behavior, depth, and motion all have to be tested before final media generation.

Zenith reframes the pipeline as image-to-space-to-motion instead of blind prompt-to-video.

## Codex Prompt Planning

Zenith can use Codex as a local prompt planner for Seedance handoffs. The SvelteKit app sends the current domemaster image, depth/motion context, and the repo-local prompt packs to `server.mjs`, then streams back a structured Seedance prompt, diagnosis, variants, negative terms, and practical warnings.

The prompt packs live in:

- `docs/seedance_prompt_pack`: repairs depth-warped MP4 motion plates with Seedance video-to-video.
- `docs/seedance_image_prompt_pack`: creates still-image-to-video motion prompts from a single dome image.

## Run Locally

```sh
npm install
cp .env.example .env.local
# Fill RUNWAYML_API_SECRET in .env.local
npm run dev
```

On Windows PowerShell, use `Copy-Item .env.example .env.local` instead of `cp`.

Open the printed local URL, usually `http://127.0.0.1:5173/`. The custom server keeps the Runway/Codex API routes and serves the SvelteKit workbench.

## Environment

- `RUNWAYML_API_SECRET`: server-side Runway API key.
- `CODEX_PROMPT_MODEL`: optional model override for prompt planning.
- `CODEX_PROMPT_REASONING`: optional reasoning effort for prompt planning.
- `SEEDANCE_PROMPT_PACK_DIR`: optional override for prompt-pack files. By default the repo-local `docs/seedance_prompt_pack` is used.
- `SEEDANCE_IMAGE_PROMPT_PACK_DIR`: optional override for still-image-to-video prompt-pack files. By default `docs/seedance_image_prompt_pack` is used.

Do not expose `.env.local` or any API keys in browser code. The app keeps Runway API calls behind `server.mjs`.

## Useful Commands

```sh
npm test
npm run build
npm run lint
```

## Project Structure

- `server.mjs`: local server, Runway API routes, streaming progress, uploads, depth/inpaint/Seedance handoffs, Codex prompt planning.
- `src/routes`: SvelteKit client-only shell for the fulldome workbench.
- `src/app`: pipeline state, artifact DAG, command bridge, defaults, and view state.
- `src/lanes`: Svelte lane components for Source, Sketch, Repair, Depth, Motion, Bridge, Video, and Deliver.
- `src/artifacts`: artifact graph nodes, dependencies, and status logic.
- `src/graphics`: WebGPU/WebGL-style dome rendering, projection geometry, shaders, view cameras.
- `src/plates`: image plate loading, spherical placement, plate-map baking.
- `src/inpaint`: Runway inpaint handoff and generated-image selection.
- `src/sketch`: depth maps, WebGPU depth reprojection, MP4 motion export, Seedance handoff.
- `src/media`: media loading, canvas helpers, WebCodecs/Mediabunny export helpers.
- `src/ui`: Svelte UI pieces, DOM actions, HUD rendering, pointer tools, progress buttons.
- `docs/seedance_prompt_pack`: prompt-planning context for repairing 2.5D/depth-warp motion plates with Seedance.
- `docs/seedance_image_prompt_pack`: prompt-planning context for direct Seedance image-to-video from a still dome image.
- `docs/default-depth-motion-config.json`: the default dome placement, inpaint, depth-motion, and Seedance settings captured from the current working profile.
