import { inject, signal, effect, Signal, untracked } from '@angular/core';
import { MoltenDbClient } from '@moltendb-web/query';
import { MoltenDbService } from './moltendb.service';

export interface MoltenDbResource<T> {
  /** The current data snapshot. Returns undefined while loading or on error. */
  value: Signal<T | undefined>;
  /** True if a fetch (initial or refresh) is currently in progress. */
  isLoading: Signal<boolean>;
  /** The error object if the last operation failed. */
  error: Signal<any | null>;
  /** Manually trigger a refresh. */
  reload: () => Promise<void>;
}

export function moltenDbResource<T>(
    collection: string,
    queryFn: (client: MoltenDbClient) => Promise<T>
): MoltenDbResource<T> {
  const molten = inject(MoltenDbService);

  const value = signal<T | undefined>(undefined);
  const isLoading = signal<boolean>(false);
  const error = signal<any | null>(null);

  const fetchData = async () => {
    // ⚡ Break the dependency chain so the calling effect doesn't loop
    untracked(() => isLoading.set(true));

    try {
      const result = await queryFn(molten.client);
      value.set(result);
      error.set(null);
    } catch (err: any) {
      // Graceful 404 handling: if collection is missing, it's just empty data
      if (err.message?.includes('404')) {
        value.set([] as any);
        error.set(null);
      } else {
        error.set(err);
      }
    } finally {
      isLoading.set(false);
    }
  };

  effect((onCleanup) => {
    if (!molten.isReady()) return;

    fetchData();

    // Auto-refresh when the underlying collection changes
    const unsubscribe = molten.db.subscribe((evt) => {
      if (evt.collection === collection) fetchData();
    });

    onCleanup(() => unsubscribe());
  });

  return {
    value: value.asReadonly(),
    isLoading: isLoading.asReadonly(),
    error: error.asReadonly(),
    reload: fetchData
  };
}