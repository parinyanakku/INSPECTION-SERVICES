type InstallEvent = Event & {
  prompt(): Promise<void>;
  userChoice: Promise<{outcome: 'accepted' | 'dismissed'}>;
};
let pending: InstallEvent | null = null;
export const appRoot = new URL(document.querySelector<HTMLLinkElement>('link[rel="manifest"]')!.href);
const changed = () => window.dispatchEvent(new Event('proelite-install-change'));
window.addEventListener('beforeinstallprompt', event => {
  event.preventDefault();
  pending = event as InstallEvent;
  changed();
});
window.addEventListener('appinstalled', () => { pending = null; changed(); });
export function canPrompt() { return !!pending; }
export async function installApp() {
  const event = pending;
  if (!event) return;
  pending = null;
  changed();
  await event.prompt();
  await event.userChoice;
}
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  void navigator.serviceWorker.register(new URL('proelite-worker.js', appRoot), {
    scope: new URL('./', appRoot).pathname, updateViaCache: 'none'
  }).catch(() => { /* Browser policy can disable installation. Web sign-in still works. */ });
}
