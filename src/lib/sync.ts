import { activePjVerId } from '../state/workspace';

const CHANNEL_NAME = 'baekji_tab_sync';
const tabId = Math.random().toString(36).substring(2, 15);

interface SyncMessage {
  type: 'PROJECT_OPEN';
  pjVerId: string;
  label: string;
  senderTabId: string;
}

let channel: BroadcastChannel | null = null;

export function initTabSync() {
  if (typeof BroadcastChannel === 'undefined') return;
  if (channel) return;

  channel = new BroadcastChannel(CHANNEL_NAME);
  channel.onmessage = (event: MessageEvent<SyncMessage>) => {
    const msg = event.data;
    if (msg.type === 'PROJECT_OPEN') {
      if (msg.pjVerId === activePjVerId() && msg.senderTabId !== tabId) {
        // Use hash-based navigation to redirect
        window.location.hash = `/paused?pj=${encodeURIComponent(msg.label)}`;
      }
    }
  };
}

export function notifyProjectOpen(pjVerId: string, label: string) {
  if (!channel) return;
  channel.postMessage({
    type: 'PROJECT_OPEN',
    pjVerId,
    label,
    senderTabId: tabId,
  });
}
