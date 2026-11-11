/** Sidecar executable. Never import from the normal staging main.ts. */
import {runRhPreviewSidecar} from './dev-rh-preview-main.js';
await runRhPreviewSidecar();
