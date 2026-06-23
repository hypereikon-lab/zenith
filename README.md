# Zenith

Zenith is a Runway-powered production cockpit for fulldome media. It helps artists and immersive-media creators turn rough image references and still domemaster frames into projection-ready moving dome material.

The project was built for the Runway API Hackathon. Its core workflow is:

1. Compose visual plates as a 180-degree fulldome domemaster.
2. Use Runway image generation/inpaint handoff to complete the rough dome image.
3. Review the result in center, theater, orbit, flat, split, and cutaway dome views.
4. Generate a depth map through Runway.
5. Preview and export depth-aware motion locally with WebGPU and WebCodecs.
6. Refine the Seedance motion prompt for the exported MP4 guide.
7. Send the guide to Runway Seedance video-to-video.
8. Save or load a portable project snapshot and export delivery metadata for QC handoff.

## Why It Exists

Most AI image and video tools think in rectangular frames. Fulldome production needs spatial authorship: placement, scale, orientation, projection behavior, depth, and motion all have to be tested before final media generation.

Zenith reframes the pipeline as image-to-space-to-motion instead of blind prompt-to-video.

## Codex Prompt Planning

Zenith has server-side Codex prompt-planning routes for Seedance handoffs. Those routes accept the current domemaster image, depth/motion context, and the repo-local prompt packs, then stream back a structured Seedance prompt, diagnosis, variants, negative terms, and practical warnings. The server/client boundary is in place; dedicated prompt-planning controls are not currently mounted as a first-class workbench UI flow.

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

Open the printed local URL, usually `http://127.0.0.1:5173/`. SvelteKit serves both the workbench and the Runway/Codex API routes.

## Local Production Smoke

Use this when you need to demonstrate the built Node adapter path rather than the Vite dev server:

```sh
npm run smoke:prod
```

The smoke command builds the app, starts `node build` on a local random port with known paid-service environment variables removed from that runtime child process, requests `/api/status`, `/api/runway/status`, and `/`, then shuts the server down. It does not require a Runway key and does not call paid generation routes.

This proves Zenith is production-demonstrable as a local single-user SvelteKit adapter-node app. It does not claim durable project storage, resumable jobs after restart, queues, workers, auth, quotas, multi-process deployment, or hosted observability.

## Environment

- `RUNWAYML_API_SECRET`: server-side Runway API key.
- `CODEX_PROMPT_MODEL`: optional model override for prompt planning.
- `CODEX_PROMPT_REASONING`: optional reasoning effort for prompt planning.
- `SEEDANCE_PROMPT_PACK_DIR`: optional override for prompt-pack files. By default the repo-local `docs/seedance_prompt_pack` is used.
- `SEEDANCE_IMAGE_PROMPT_PACK_DIR`: optional override for still-image-to-video prompt-pack files. By default `docs/seedance_image_prompt_pack` is used.

Do not expose `.env.local` or any API keys in browser code. The app keeps Runway API calls behind `src/routes/api` server endpoints.

Development loads `.env.local` through Vite/SvelteKit. Production `npm run start` runs the built Node adapter, so deployment secrets must be present in the process environment.

## Useful Commands

```sh
npm run typecheck
npm run lint
npm test
npm run test:e2e
npm run build
npm run smoke:prod
npm run start
```

## Project Structure

- `src/routes`: SvelteKit pages and API routes for the fulldome workbench.
- `src/lib/shared`: JSON-safe shared contracts for portable project snapshots and first-class job events/results.
- `src/lib/server`: server-only Runway/Codex integration, Zod request validation, streaming progress, uploads, depth/inpaint/Seedance handoffs, Codex prompt planning, and in-memory depth jobs.
- `src/app`: browser-side command bridge plus focused project persistence, paid operator orchestration, local render operators, and view state.
- `src/stages`: Svelte stage context components for Start State, Motion Draft, End State, Video Take, and Deliverables.
- `src/artifacts`: primary workbench state, artifact graph records, dependencies, jobs, and status logic.
- `src/graphics`: WebGPU/WebGL-style dome rendering, projection geometry, shaders, view cameras.
- `src/plates`: image plate loading, default plate profile, spherical placement, plate-map baking.
- `src/inpaint`: projection-specific inpaint prompts, Runway inpaint handoff, and generated-image selection.
- `src/sketch`: depth maps, WebGPU depth reprojection, MP4 motion export, Seedance handoff.
- `src/media`: media loading, canvas helpers, WebCodecs/Mediabunny export helpers.
- `src/ui`: Svelte UI pieces, stage panels, media viewers, controls, and workbench components.
- `docs/seedance_prompt_pack`: prompt-planning context for repairing 2.5D/depth-warp motion plates with Seedance.
- `docs/seedance_image_prompt_pack`: prompt-planning context for direct Seedance image-to-video from a still dome image.
- `docs/default-depth-motion-config.json`: captured working-profile defaults; active code currently reads its `plateSketch` defaults through `src/plates/default-plate-profile.ts`.
