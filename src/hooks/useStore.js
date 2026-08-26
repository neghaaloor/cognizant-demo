import { useSyncExternalStore } from 'react';
import { subscribe, getRevision } from '../services/storageService';

/**
 * Re-render the calling component whenever the store changes — a local write,
 * a queued write landing, or a live update pushed from another device.
 *
 * Pages keep reading through the synchronous getters; this just tells React
 * when those getters would return something new.
 */
export default function useStore() {
  return useSyncExternalStore(subscribe, getRevision, getRevision);
}
