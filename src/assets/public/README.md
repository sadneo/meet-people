# Marketing Community video

Drop the real recording here as `community-demo.mp4`.

- Recommended: **1920 × 1080 (16:9), H.264 MP4, 24 or 30 fps**.
- Aim for a calm **12–16 second** loop, ideally **under 6 MB**. Remove the audio
  track. Export with “web optimized” / fast start enabled.
- Record a clean Community build-up: one Pebble, landscape, cottage, friends.
  Hold the completed scene for a few seconds; make the end meet the beginning
  naturally. The video is displayed without a caption overlay.
- Avoid personal information, developer controls, and unrelated app screens.

## Replacement

1. Copy your MP4 to `src/assets/public/community-demo.mp4` (exact spelling).
2. Restart `pnpm dev` and open `/` while signed out. Scroll to Community.
3. The landing page automatically uses the video instead of the illustrated
   build-up. **No JSX, CSS or URL edit is needed.** The optional Vite glob embeds
   the asset URL at build time, without requesting a nonexistent file.
4. For deployment run `pnpm build` and publish through the existing team process.
   Replacing the file requires a new production build.
5. Removing/renaming the MP4 and restarting/rebuilding restores the illustration.

Video is muted, looping and inline. It plays only when visible, motion is enabled,
and the visitor has not paused it. Reduced motion keeps a static poster. A failed
video falls back to the animated illustration; blocked autoplay offers a play
button. The media box stays 16:9 and uses `object-fit: contain`, preserving the
whole recording rather than cropping it.

No real video is supplied yet. The default is a CSS/SVG illustration assembled
from existing Community assets, not a recording or a live account simulation.
