/**
 * Ask the browser to make the lesson immersive while the originating click still counts
 * as a user gesture. Fullscreen is optional: unsupported devices and denied requests
 * continue into the lesson normally.
 */
export function enterLessonFullscreen(): void {
  if (typeof document === "undefined" || document.fullscreenElement) return;
  const request = document.documentElement.requestFullscreen;
  if (!request) return;
  void request.call(document.documentElement).catch(() => undefined);
}
