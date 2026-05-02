import { useEffect, useRef, useState } from 'react';
import { MoltenDbClient } from '@moltendb-web/query';
import { useMoltenDbContext } from './MoltenDbContext';

export interface MoltenDbResourceResult<T> {
  value: T | undefined;
  isLoading: boolean;
  error: any | null;
}

/**
 * Hook to reactively fetch data from a MoltenDb collection.
 * Automatically re-fetches when the collection changes.
 * Must be used inside <MoltenDbProvider>.
 *
 * @param collection - The collection name to query.
 * @param queryFn - A function receiving the pre-bound collection accessor and the full client.
 */
export function useMoltenDbResource<T>(
  collection: string,
  queryFn: (collection: ReturnType<MoltenDbClient['collection']>, client: MoltenDbClient) => Promise<T>
): MoltenDbResourceResult<T> {
  const { db, client, isReady } = useMoltenDbContext();

  const [value, setValue] = useState<T | undefined>(undefined);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<any | null>(null);

  // Keep latest queryFn in a ref to avoid stale closures without re-subscribing
  const queryFnRef = useRef(queryFn);
  queryFnRef.current = queryFn;

  useEffect(() => {
    if (!isReady) return;

    let cancelled = false;

    const fetchData = async () => {
      setIsLoading(true);
      try {
        const result = await queryFnRef.current(client.collection(collection), client);
        if (!cancelled) {
          setValue(result);
          setError(null);
        }
      } catch (err: any) {
        if (!cancelled) {
          if (err.message?.includes('404')) {
            setValue([] as any);
            setError(null);
          } else {
            setError(err);
          }
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    fetchData();

    const unsubscribe = db.subscribe((evt: any) => {
      if (evt.collection === collection) fetchData();
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [isReady, collection, db, client]);

  return { value, isLoading, error };
}
