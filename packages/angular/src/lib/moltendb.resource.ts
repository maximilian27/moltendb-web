import { inject, signal, effect, Signal, untracked } from '@angular/core';
import { MoltenDbClient } from '@moltendb-web/query';
import { MoltenDbService } from './moltendb.service';

export interface MoltenDbResource<T> {
  value: Signal<T | undefined>;
  isLoading: Signal<boolean>;
  error: Signal<any | null>;
}

export function moltenDbResource<T>(
    collection: string,
    //  Automatically infer the return type of .collection()
    queryFn: (collection: ReturnType<MoltenDbClient['collection']>, client: MoltenDbClient) => Promise<T>
): MoltenDbResource<T> {
  const molten = inject(MoltenDbService);

  const value = signal<T | undefined>(undefined);
  const isLoading = signal<boolean>(false);
  const error = signal<any | null>(null);

  const fetchData = async () => {
    untracked(() => isLoading.set(true));

    try {
      // ⚡ Pre-bind the collection and pass it in!
      const result = await queryFn(molten.client.collection(collection), molten.client);
      value.set(result);
      error.set(null);
    } catch (err: any) {
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

    const unsubscribe = molten.db.subscribe((evt) => {
      if (evt.collection === collection) fetchData();
    });

    onCleanup(() => unsubscribe());
  });

  return {
    value: value.asReadonly(),
    isLoading: isLoading.asReadonly(),
    error: error.asReadonly()
  };
}