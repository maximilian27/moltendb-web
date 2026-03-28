import { inject, signal, effect, DestroyRef, Signal } from '@angular/core';
import { MoltenDBClient } from '@moltendb-web/query';
import { MoltenService } from './moltendb.service';

export interface LiveQueryResult<T> {
  data: Signal<T | undefined>;
  isLoading: Signal<boolean>;
  error: Signal<Error | null>;
}

/**
 * A reactive hook that binds to MoltenDB.
 * Automatically handles loading states, real-time cross-tab updates, and memory cleanup.
 */
export function injectLiveQuery<T>(
    collection: string,
    queryFn: (client: MoltenDBClient) => Promise<T>
): LiveQueryResult<T> {
  const molten = inject(MoltenService);
  const destroyRef = inject(DestroyRef);

  const data = signal<T | undefined>(undefined);
  const isLoading = signal<boolean>(true);
  const error = signal<Error | null>(null);

  // effect() runs immediately, and re-runs if molten.isReady() changes state
  effect((onCleanup) => {
    if (!molten.isReady()) return;

    // 1. Fetch logic
    const fetchData = async () => {
      isLoading.set(true);
      try {
        const result = await queryFn(molten.client);
        data.set(result);
        error.set(null);
      } catch (err) {
        error.set(err as Error);
      } finally {
        isLoading.set(false);
      }
    };

    // 2. Fetch initial data snapshot
    fetchData();

    // 3. Subscribe to the real-time event stream
    const unsubscribe = molten.db.subscribe((evt) => {
      if (evt.collection === collection) {
        fetchData(); // Background re-fetch on mutation!
      }
    });

    // 4. Automatically clean up the listener when the effect is destroyed or component unmounts
    onCleanup(() => {
      unsubscribe();
    });
  });

  return { data, isLoading, error };
}