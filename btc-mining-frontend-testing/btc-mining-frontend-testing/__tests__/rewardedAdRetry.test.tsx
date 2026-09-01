/**
 * Regression test for the "ads stop loading after a few plays" report.
 *
 * A rewarded request failing with no-fill used to be terminal: ERROR left the
 * hook unloaded and nothing retried, so the button apologised until the app was
 * killed. These tests drive the real hook against a fake ad SDK.
 */
import React from 'react';
import renderer, { act } from 'react-test-renderer';

jest.useFakeTimers();

// Only Platform and AppState are reached from this code path.
let appStateHandler: ((s: string) => void) | null = null;
jest.mock('react-native', () => ({
  Platform: { OS: 'android', select: (o: any) => o.android },
  AppState: {
    addEventListener: (_: string, fn: (s: string) => void) => {
      appStateHandler = fn;
      return { remove: () => { appStateHandler = null; } };
    },
  },
}));

// ---- fake ad SDK -------------------------------------------------------
type Handler = (arg?: any) => void;
const instances: any[] = [];

jest.mock('react-native-google-mobile-ads', () => {
  const RewardedAdEventType = { LOADED: 'rewarded_loaded', EARNED_REWARD: 'rewarded_earned_reward' };
  const AdEventType = { CLOSED: 'closed', ERROR: 'error', OPENED: 'opened', CLICKED: 'clicked' };
  class FakeRewardedAd {
    handlers: Record<string, Handler[]> = {};
    loadCount = 0;
    shown = 0;
    static createForAdRequest() {
      const i = new FakeRewardedAd();
      instances.push(i);
      return i;
    }
    addAdEventListener(type: string, fn: Handler) {
      (this.handlers[type] ||= []).push(fn);
      return () => { this.handlers[type] = (this.handlers[type] || []).filter(h => h !== fn); };
    }
    load() { this.loadCount += 1; }
    show() { this.shown += 1; }
    emit(type: string, arg?: any) { (this.handlers[type] || []).forEach(h => h(arg)); }
  }
  return {
    __esModule: true,
    default: () => ({ setRequestConfiguration: jest.fn(), initialize: jest.fn() }),
    MaxAdContentRating: { PG: 'PG' },
    RewardedAd: FakeRewardedAd,
    RewardedAdEventType,
    AdEventType,
    BannerAdSize: {},
  };
});

jest.mock('../src/services/apptroveAnalytics', () => ({ trackAdFailedToLoad: jest.fn() }));
// googleAds.ts used to import navigationRef from App; mock it so this suite
// can also run against the pre-fix version of the hook.
jest.mock('../App', () => ({ navigationRef: { getCurrentRoute: () => ({ name: 'Test' }) } }), { virtual: true });

import { useRewardedVideoAd } from '../src/services/googleAds';

const latest = () => instances[instances.length - 1];
let state: any = {};
function Harness({ onReward, onClosed }: any) {
  state = useRewardedVideoAd(onReward, { primaryUnitId: 'unit-1' }, onClosed);
  return null;
}
let tree: renderer.ReactTestRenderer | null = null;
const mount = (props: any = {}) => { tree = renderer.create(<Harness {...props} />); return tree; };

beforeEach(() => { instances.length = 0; jest.clearAllTimers(); });
// Without this, a test's outstanding retry timers keep firing during the NEXT
// test's advanceTimersByTime and spawn instances it never asked for.
afterEach(() => { act(() => { tree?.unmount(); }); tree = null; jest.clearAllTimers(); });

test('a failed request is retried with backoff instead of parking forever', () => {
  act(() => { mount(); });
  expect(instances).toHaveLength(1);
  expect(latest().loadCount).toBe(1);

  // no-fill
  act(() => { latest().emit('error', { code: 'no-fill' }); });
  expect(state.loaded).toBe(false);

  // nothing yet...
  act(() => { jest.advanceTimersByTime(1_500); });
  expect(instances).toHaveLength(1);

  // ...then a retry lands
  act(() => { jest.advanceTimersByTime(1_000); });
  expect(instances.length).toBeGreaterThan(1);
  expect(latest().loadCount).toBe(1);
});

test('backoff grows across repeated failures and the ad still recovers', () => {
  act(() => { mount(); });
  const delays = [2_000, 5_000, 15_000, 30_000];
  let seen = instances.length;
  for (const delay of delays) {
    act(() => { latest().emit('error', { code: 'no-fill' }); });
    // Exactly on the boundary, so no surplus accumulates across iterations.
    act(() => { jest.advanceTimersByTime(delay - 1); });
    expect(instances).toHaveLength(seen);          // not yet
    act(() => { jest.advanceTimersByTime(1); });
    expect(instances.length).toBe(seen + 1);       // retried
    seen = instances.length;
  }
  // fill returns
  act(() => { latest().emit('rewarded_loaded'); });
  expect(state.loaded).toBe(true);
});

test('backoff resets after a success, so the next failure retries quickly again', () => {
  act(() => { mount(); });
  act(() => { latest().emit('error', { code: 'no-fill' }); });
  act(() => { jest.advanceTimersByTime(2_000); });
  act(() => { latest().emit('rewarded_loaded'); });
  expect(state.loaded).toBe(true);

  const before = instances.length;
  act(() => { latest().emit('error', { code: 'no-fill' }); });
  act(() => { jest.advanceTimersByTime(2_100); });
  expect(instances.length).toBe(before + 1);
});

test('closing an ad queues the next one', () => {
  act(() => { mount(); });
  act(() => { latest().emit('rewarded_loaded'); });
  act(() => { state.show(); });
  expect(latest().shown).toBe(1);

  const before = instances.length;
  act(() => { latest().emit('closed'); });
  expect(instances.length).toBe(before);           // deliberately not immediate
  act(() => { jest.advanceTimersByTime(600); });
  expect(instances.length).toBe(before + 1);
});

test('four ads in a row keep working', () => {
  act(() => { mount(); });
  for (let i = 0; i < 4; i++) {
    act(() => { latest().emit('rewarded_loaded'); });
    expect(state.loaded).toBe(true);
    act(() => { state.show(); });
    expect(latest().shown).toBe(1);
    act(() => { latest().emit('closed'); });
    act(() => { jest.advanceTimersByTime(600); });
  }
});

test('pressing the button while unloaded starts a request rather than doing nothing', () => {
  act(() => { mount(); });
  act(() => { latest().emit('error', { code: 'no-fill' }); });
  const before = instances.length;
  act(() => { state.show(); });
  expect(instances.length).toBe(before + 1);
  expect(latest().loadCount).toBe(1);
});

test('a request that never resolves is rebuilt by the watchdog', () => {
  act(() => { mount(); });
  const before = instances.length;
  act(() => { jest.advanceTimersByTime(46_000); });
  expect(instances.length).toBe(before + 1);
});

test('returning to the foreground retries immediately', () => {
  act(() => { mount(); });
  act(() => { latest().emit('error', { code: 'no-fill' }); });
  const before = instances.length;
  act(() => { appStateHandler && appStateHandler('active'); });
  expect(instances.length).toBe(before + 1);
});

test('unmounting stops all retries', () => {
  act(() => { mount(); });
  act(() => { latest().emit('error', { code: 'no-fill' }); });
  act(() => { tree!.unmount(); tree = null; });
  const after = instances.length;
  act(() => { jest.advanceTimersByTime(120_000); });
  expect(instances.length).toBe(after);
});
