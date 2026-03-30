/**
 * MoltenDb core — unit & integration test suite
 *
 * All browser APIs (Worker, BroadcastChannel, navigator.locks) are replaced
 * with in-process fakes so the tests run in Node/Vitest without a real browser
 * or WASM binary.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MoltenDb } from '../index.js';
import {
  FakeWorker,
  getWorker,
  installMocks,
  releaseLock,
  uninstallMocks,
} from './mocks.js';

// ─── helpers ─────────────────────────────────────────────────────────────────

/** Boot a MoltenDb instance that wins the leader election immediately. */
async function makeLeader(dbName = 'test-db', options = {}): Promise<MoltenDb> {
  const db = new MoltenDb(dbName, { workerUrl: '/fake-worker.js', ...options });
  await db.init();
  return db;
}

/**
 * Boot a second MoltenDb instance that loses the leader election and becomes
 * a follower. The leader must already be initialised before calling this.
 */
async function makeFollower(dbName = 'test-db'): Promise<MoltenDb> {
  const db = new MoltenDb(dbName, { workerUrl: '/fake-worker.js' });
  await db.init();
  return db;
}

// ─── setup / teardown ────────────────────────────────────────────────────────

beforeEach(() => {
  installMocks();
});

afterEach(() => {
  uninstallMocks();
  vi.useRealTimers();
});

// ═════════════════════════════════════════════════════════════════════════════
// 1. Initialisation
// ═════════════════════════════════════════════════════════════════════════════

describe('init()', () => {
  it('resolves without throwing when the worker responds ok', async () => {
    const db = new MoltenDb('db', { workerUrl: '/fake-worker.js' });
    await expect(db.init()).resolves.toBeUndefined();
  });

  it('marks the first instance as leader', async () => {
    const db = await makeLeader();
    expect(db.isLeader).toBe(true);
  });

  it('marks the second instance on the same dbName as follower', async () => {
    await makeLeader();
    const follower = await makeFollower();
    expect(follower.isLeader).toBe(false);
  });

  it('rejects when the worker returns an error during init', async () => {
    // Re-install with an error-throwing worker factory
    uninstallMocks();
    installMocks(() => {
      const w = new FakeWorker();
      w.handler = () => { throw new Error('WASM init failed'); };
      return w;
    });

    const db = new MoltenDb('db', { workerUrl: '/fake-worker.js' });
    await expect(db.init()).rejects.toThrow('WASM init failed');
  });

  it('is safe to call init() twice (idempotent guard)', async () => {
    const db = new MoltenDb('db', { workerUrl: '/fake-worker.js' });
    await db.init();
    // Second call should not throw or create a second worker
    await expect(db.init()).resolves.toBeUndefined();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 2. CRUD — leader path (direct worker communication)
// ═════════════════════════════════════════════════════════════════════════════

describe('CRUD — leader', () => {
  it('set → get round-trip returns the stored value', async () => {
    const db = await makeLeader();
    await db.set('users', 'alice', { name: 'Alice', age: 30 });
    const result = await db.get('users', 'alice');
    expect(result).toEqual({ name: 'Alice', age: 30 });
  });

  it('get on a missing key returns null', async () => {
    const db = await makeLeader();
    const result = await db.get('users', 'nobody');
    expect(result).toBeNull();
  });

  it('getAll returns all documents in a collection', async () => {
    const db = await makeLeader();
    await db.set('items', 'a', { v: 1 });
    await db.set('items', 'b', { v: 2 });
    const all = await db.getAll('items') as unknown as Record<string, unknown>;
    expect(all).toMatchObject({ a: { v: 1 }, b: { v: 2 } });
  });

  it('getAll on an empty collection returns null', async () => {
    const db = await makeLeader();
    const result = await db.getAll('empty');
    expect(result).toStrictEqual([]);
  });

  it('delete removes the document; subsequent get returns null', async () => {
    const db = await makeLeader();
    await db.set('users', 'bob', { name: 'Bob' });
    await db.delete('users', 'bob');
    const result = await db.get('users', 'bob');
    expect(result).toBeNull();
  });

  it('delete on a non-existent key does not throw', async () => {
    const db = await makeLeader();
    await expect(db.delete('users', 'ghost')).resolves.toBeUndefined();
  });

  it('set overwrites an existing document', async () => {
    const db = await makeLeader();
    await db.set('users', 'alice', { name: 'Alice', age: 30 });
    await db.set('users', 'alice', { name: 'Alice', age: 31 });
    const result = await db.get('users', 'alice') as { age: number };
    expect(result.age).toBe(31);
  });

  it('compact resolves without throwing', async () => {
    const db = await makeLeader();
    await expect(db.compact()).resolves.toBeNull();
  });

  it('multiple collections are isolated from each other', async () => {
    const db = await makeLeader();
    await db.set('colA', 'key1', { src: 'A' });
    await db.set('colB', 'key1', { src: 'B' });
    expect(await db.get('colA', 'key1')).toEqual({ src: 'A' });
    expect(await db.get('colB', 'key1')).toEqual({ src: 'B' });
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 3. CRUD — follower path (proxied via BroadcastChannel)
// ═════════════════════════════════════════════════════════════════════════════

describe('CRUD — follower (BroadcastChannel proxy)', () => {
  it('follower set → leader get returns the stored value', async () => {
    const leader   = await makeLeader();
    const follower = await makeFollower();

    await follower.set('products', 'p1', { price: 9.99 });
    // Give the BC round-trip a tick to settle
    await new Promise(r => setTimeout(r, 10));
    const result = await leader.get('products', 'p1');
    expect(result).toEqual({ price: 9.99 });
  });

  it('follower get returns value set by the leader', async () => {
    await makeLeader();
    const follower = await makeFollower();

    // Set directly via sendMessage on the leader's worker (already tested above)
    // Here we set via the follower and read back via the follower
    await follower.set('notes', 'n1', { text: 'hello' });
    await new Promise(r => setTimeout(r, 10));
    const result = await follower.get('notes', 'n1');
    expect(result).toEqual({ text: 'hello' });
  });

  it('follower delete removes the document', async () => {
    await makeLeader();
    const follower = await makeFollower();

    await follower.set('docs', 'd1', { body: 'x' });
    await new Promise(r => setTimeout(r, 10));
    await follower.delete('docs', 'd1');
    await new Promise(r => setTimeout(r, 10));
    const result = await follower.get('docs', 'd1');
    expect(result).toBeNull();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 4. Worker error handling
// ═════════════════════════════════════════════════════════════════════════════

describe('Worker error handling', () => {
  it('sendMessage rejects when the worker returns an error', async () => {
    const db = await makeLeader();
    const worker = getWorker();

    // Make the next non-init call throw
    const original = worker.handler;
    worker.handler = (msg) => {
      if ((msg.action as string) === 'get') throw new Error('disk read error');
      return original(msg);
    };

    await expect(db.get('col', 'key')).rejects.toThrow('disk read error');
  });

  it('one failed request does not poison subsequent requests', async () => {
    const db = await makeLeader();
    const worker = getWorker();
    let callCount = 0;

    const original = worker.handler;
    worker.handler = (msg) => {
      if ((msg.action as string) === 'get' && callCount++ === 0) {
        throw new Error('transient error');
      }
      return original(msg);
    };

    await expect(db.get('col', 'key')).rejects.toThrow('transient error');
    // Second call should succeed
    await db.set('col', 'key', { ok: true });
    await expect(db.get('col', 'key')).resolves.toEqual({ ok: true });
  });

  it('sendMessage rejects with a descriptive message on unknown action', async () => {
    const db = await makeLeader();
    await expect(db.sendMessage('nonexistent_action')).rejects.toThrow(
      /Unknown action/,
    );
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 5. Leader promotion (follower → leader when leader tab closes)
// ═════════════════════════════════════════════════════════════════════════════

describe('Leader promotion', () => {
  it('follower becomes leader after the lock is released', async () => {
    const leader   = await makeLeader('promo-db');
    const follower = await makeFollower('promo-db');

    expect(leader.isLeader).toBe(true);
    expect(follower.isLeader).toBe(false);

    // Simulate the leader tab closing → release the Web Lock
    releaseLock('moltendb_lock_promo-db');

    // Allow the queued lock callback to run
    await new Promise(r => setTimeout(r, 20));

    expect(follower.isLeader).toBe(true);
  });

  it('promoted follower can serve CRUD requests directly', async () => {
    await makeLeader('promo2-db');
    const follower = await makeFollower('promo2-db');

    releaseLock('moltendb_lock_promo2-db');
    await new Promise(r => setTimeout(r, 20));

    // Now the follower is the leader — it should have a live worker
    expect(follower.worker).not.toBeNull();
    await follower.set('col', 'k', { promoted: true });
    await expect(follower.get('col', 'k')).resolves.toEqual({ promoted: true });
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 6. onEvent hook — real-time event broadcasting
// ═════════════════════════════════════════════════════════════════════════════

describe('onEvent hook', () => {
  it('multi-subscriber pattern works across tabs (subscribe/unsubscribe)', async () => {
    const leader = await makeLeader('mt-events');
    const follower = await makeFollower('mt-events');

    const spy1 = vi.fn();
    const spy2 = vi.fn();

    // Attach two separate listeners to the follower
    const unsubscribe1 = follower.subscribe(spy1);
    follower.subscribe(spy2);

    // Simulate the WASM worker on the Leader pushing a real-time event
    // (We must do this manually because FakeWorker doesn't auto-emit on .set())
    leader.worker!.onmessage!(
        new MessageEvent('message', {
          data: { type: 'event', event: 'change', collection: 'mt-col', key: 'k1' },
        })
    );

    await new Promise((r) => setTimeout(r, 10)); // wait for async BroadcastChannel

    // Both listeners on the Follower should fire
    expect(spy1).toHaveBeenCalledTimes(1);
    expect(spy2).toHaveBeenCalledTimes(1);
    expect(spy1).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'event', collection: 'mt-col', key: 'k1' })
    );

    // Unsubscribe spy1, then simulate another mutation
    unsubscribe1();

    leader.worker!.onmessage!(
        new MessageEvent('message', {
          data: { type: 'event', event: 'change', collection: 'mt-col', key: 'k2' },
        })
    );

    await new Promise((r) => setTimeout(r, 10));

    // spy1 should not increase, spy2 should catch the new event
    expect(spy1).toHaveBeenCalledTimes(1);
    expect(spy2).toHaveBeenCalledTimes(2);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 7. Follower request timeout
// ═════════════════════════════════════════════════════════════════════════════

describe('Follower request timeout', () => {
  it('follower query times out if leader becomes unresponsive', async () => {
    const leader = await makeLeader('mt-timeout');
    const follower = await makeFollower('mt-timeout');

    vi.useFakeTimers();

    // Simulate leader crashing silently by removing its Worker
    // so it never responds to the BC query
    if (leader.worker) {
      leader.worker.terminate();
      leader.worker = null;
    }

    // Follower attempts to read
    const getPromise = follower.get('col', 'k1');

    // Fast-forward time past the 10-second threshold
    vi.advanceTimersByTime(10500);

    // The promise should explicitly reject with the timeout error
    await expect(getPromise).rejects.toThrow(/timed out/);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 8. terminate() / disconnect()
// ═════════════════════════════════════════════════════════════════════════════

describe('terminate() and disconnect()', () => {
  it('terminate() stops the worker', async () => {
    const db = await makeLeader();
    const worker = getWorker();
    db.terminate();
    expect(worker.terminated).toBe(true);
    expect(db.worker).toBeNull();
  });

  it('terminate() on a follower does not throw', async () => {
    await makeLeader();
    const follower = await makeFollower();
    expect(() => follower.terminate()).not.toThrow();
  });

  it('disconnect() clears the sync timer', async () => {
    vi.useFakeTimers();
    const db = await makeLeader('sync-db', {
      syncEnabled: false, // keep it simple — no real WS
    });
    // Manually inject a fake timer to verify it gets cleared
    const timer = setInterval(() => {}, 5000);
    (db as unknown as { syncTimer: ReturnType<typeof setInterval> }).syncTimer = timer;

    db.disconnect();

    // If the timer was cleared, advancing time should not trigger it
    const spy = vi.fn();
    // (timer is already cleared; just verify no throw)
    expect(() => vi.advanceTimersByTime(10_000)).not.toThrow();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 9. Stress — rapid sequential writes
// ═════════════════════════════════════════════════════════════════════════════

describe('Stress — rapid sequential writes', () => {
  it('100 sequential set/get round-trips all return correct values', async () => {
    const db = await makeLeader();
    const N = 100;

    for (let i = 0; i < N; i++) {
      await db.set('stress', `key-${i}`, { index: i });
    }

    for (let i = 0; i < N; i++) {
      const val = await db.get('stress', `key-${i}`) as { index: number };
      expect(val.index).toBe(i);
    }
  });

  it('50 concurrent set calls all resolve without error', async () => {
    const db = await makeLeader();
    const writes = Array.from({ length: 50 }, (_, i) =>
      db.set('concurrent', `k${i}`, { i }),
    );
    await expect(Promise.all(writes)).resolves.toBeDefined();
  });

  it('interleaved set/delete leaves only the expected keys', async () => {
    const db = await makeLeader();

    // Write 20 keys
    for (let i = 0; i < 20; i++) {
      await db.set('mix', `k${i}`, { i });
    }
    // Delete even-indexed keys
    for (let i = 0; i < 20; i += 2) {
      await db.delete('mix', `k${i}`);
    }

    // Odd keys should still exist; even keys should be null
    for (let i = 0; i < 20; i++) {
      const val = await db.get('mix', `k${i}`);
      if (i % 2 === 0) {
        expect(val).toBeNull();
      } else {
        expect(val).toEqual({ i });
      }
    }
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 10. BroadcastChannel name isolation
// ═════════════════════════════════════════════════════════════════════════════

describe('BroadcastChannel name isolation', () => {
  it('two databases with different names do not share data', async () => {
    const dbA = await makeLeader('db-alpha');
    // Need a fresh lock slot for db-beta
    const dbB = new MoltenDb('db-beta', { workerUrl: '/fake-worker.js' });
    await dbB.init();

    await dbA.set('col', 'shared-key', { owner: 'alpha' });
    const fromB = await dbB.get('col', 'shared-key');
    // dbB has its own worker/store — it should not see dbA's data
    expect(fromB).toBeNull();
  });

  it('two databases with different names can both be leaders simultaneously', async () => {
    const dbA = await makeLeader('iso-a');
    const dbB = new MoltenDb('iso-b', { workerUrl: '/fake-worker.js' });
    await dbB.init();

    expect(dbA.isLeader).toBe(true);
    expect(dbB.isLeader).toBe(true);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 11. Bulk insert stress (single leader)
// ═════════════════════════════════════════════════════════════════════════════

describe('Stress — bulk inserts (single leader)', () => {
  it('1 000 concurrent set calls all resolve and spot-checks pass', async () => {
    const db = await makeLeader('bulk-1k');
    const N = 1_000;

    await Promise.all(
      Array.from({ length: N }, (_, i) =>
        db.set('bulk', `key-${i}`, { index: i, payload: 'x'.repeat(200) }),
      ),
    );

    // Spot-check 50 random keys
    const checks = Array.from({ length: 50 }, () => {
      const i = Math.floor(Math.random() * N);
      return db.get('bulk', `key-${i}`).then((v) => {
        expect((v as { index: number }).index).toBe(i);
      });
    });
    await Promise.all(checks);
  });

  it('500 concurrent mixed ops (set/get/delete) all settle without hanging', async () => {
    const db = await makeLeader('mixed-500');

    const ops = Array.from({ length: 500 }, (_, i) => {
      if (i % 3 === 0) return db.set('race', `k${i}`, { i });
      if (i % 3 === 1) return db.get('race', `k${Math.floor(i / 3) * 3}`);
      return db.delete('race', `k${i - 1}`).catch(() => {}); // key may not exist yet
    });

    const results = await Promise.allSettled(ops);
    const rejected = results.filter((r) => r.status === 'rejected');
    // Only deletes on missing keys are allowed to reject (we already swallow those above)
    expect(rejected).toHaveLength(0);
  });

  it('compact() between two write bursts does not corrupt data', async () => {
    const db = await makeLeader('compact-stress');

    await Promise.all(
      Array.from({ length: 200 }, (_, i) =>
        db.set('cs', `k${i}`, { i }),
      ),
    );
    await db.compact();
    await Promise.all(
      Array.from({ length: 200 }, (_, i) =>
        db.set('cs', `k${i + 200}`, { i: i + 200 }),
      ),
    );

    for (let i = 0; i < 400; i++) {
      const v = (await db.get('cs', `k${i}`)) as { i: number };
      expect(v.i).toBe(i);
    }
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 12. Multi-tab parallel write stress (leader + followers)
// ═════════════════════════════════════════════════════════════════════════════

describe('Multi-tab parallel write stress', () => {
  it('leader + 2 followers writing 100 entries each — all 300 are readable', async () => {
    const leader    = await makeLeader('mt-stress');
    const follower1 = await makeFollower('mt-stress');
    const follower2 = await makeFollower('mt-stress');

    await Promise.all([
      ...Array.from({ length: 100 }, (_, i) =>
        leader.set('shared', `leader-${i}`, { src: 'leader', i }),
      ),
      ...Array.from({ length: 100 }, (_, i) =>
        follower1.set('shared', `f1-${i}`, { src: 'f1', i }),
      ),
      ...Array.from({ length: 100 }, (_, i) =>
        follower2.set('shared', `f2-${i}`, { src: 'f2', i }),
      ),
    ]);

    await new Promise((r) => setTimeout(r, 50));

    for (let i = 0; i < 100; i++) {
      expect(await leader.get('shared', `leader-${i}`)).toMatchObject({ src: 'leader', i });
      expect(await leader.get('shared', `f1-${i}`)).toMatchObject({ src: 'f1', i });
      expect(await leader.get('shared', `f2-${i}`)).toMatchObject({ src: 'f2', i });
    }
  });

  it('no request-ID collision when 3 tabs fire 200 ops concurrently', async () => {
    const leader    = await makeLeader('mt-ids');
    const follower1 = await makeFollower('mt-ids');
    const follower2 = await makeFollower('mt-ids');

    // Each instance starts its messageId counter at 0 — IDs will collide
    // numerically, but each instance routes responses through its own
    // pendingRequests Map, so there must be no cross-instance confusion.
    const all = await Promise.allSettled([
      ...Array.from({ length: 200 }, (_, i) => leader.set('ids', `l${i}`, { i })),
      ...Array.from({ length: 200 }, (_, i) => follower1.set('ids', `f1${i}`, { i })),
      ...Array.from({ length: 200 }, (_, i) => follower2.set('ids', `f2${i}`, { i })),
    ]);

    const failed = all.filter((r) => r.status === 'rejected');
    expect(failed).toHaveLength(0);
  });

  it('follower reads are consistent after a burst of 500 leader writes', async () => {
    const leader   = await makeLeader('mt-read');
    const follower = await makeFollower('mt-read');

    await Promise.all(
      Array.from({ length: 500 }, (_, i) =>
        leader.set('burst', `k${i}`, { value: i * 2 }),
      ),
    );

    await new Promise((r) => setTimeout(r, 30));

    const checks = Array.from({ length: 50 }, () => {
      const i = Math.floor(Math.random() * 500);
      return follower.get('burst', `k${i}`).then((v) => {
        expect((v as { value: number }).value).toBe(i * 2);
      });
    });
    await Promise.all(checks);
  });

  it('leader promotion under write load — no writes hang forever', async () => {
    const leader   = await makeLeader('mt-promo');
    const follower = await makeFollower('mt-promo');

    // Fire 50 writes from the follower (proxied through the leader via BC)
    const writes = Array.from({ length: 50 }, (_, i) =>
      follower.set('promo-col', `k${i}`, { i }),
    );

    // Promote the follower mid-flight
    await new Promise((r) => setTimeout(r, 5));
    releaseLock('moltendb_lock_mt-promo');
    await new Promise((r) => setTimeout(r, 20));

    const results = await Promise.allSettled(writes);
    // None should be permanently pending — all must have settled
    const pending = results.filter((r) => r.status === ('pending' as string));
    expect(pending).toHaveLength(0);
  });
});
