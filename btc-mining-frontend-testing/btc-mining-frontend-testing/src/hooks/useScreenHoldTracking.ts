import { useRef, useCallback } from 'react';
import { trackScreenHold } from '../services/apptroveAnalytics';
import { navigationRef } from '../../App';

// Minimum hold duration before the event fires (milliseconds)
const HOLD_THRESHOLD_MS = 800;

/**
 * Returns onTouchStart / onTouchEnd / onTouchCancel handlers to attach to
 * the root View. After the user holds the screen for HOLD_THRESHOLD_MS the
 * current screen name and actual hold duration are sent to Apptrove.
 */
export function useScreenHoldTracking() {
  const pressStartRef = useRef<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    pressStartRef.current = null;
  }, []);

  const onTouchStart = useCallback(() => {
    pressStartRef.current = Date.now();
    timerRef.current = setTimeout(() => {
      const screenName = navigationRef.getCurrentRoute()?.name ?? 'Unknown';
      const holdDuration = Date.now() - (pressStartRef.current ?? Date.now());
      trackScreenHold(screenName, holdDuration);
      // Clear refs so a second fire can't happen for the same touch
      pressStartRef.current = null;
      timerRef.current = null;
    }, HOLD_THRESHOLD_MS);
  }, []);

  const onTouchEnd = useCallback(() => {
    clearTimer();
  }, [clearTimer]);

  const onTouchCancel = useCallback(() => {
    clearTimer();
  }, [clearTimer]);

  return { onTouchStart, onTouchEnd, onTouchCancel };
}
