import { useEffect, useRef, useState } from "react";
import { MoltenDbClient } from "@moltendb-web/query";
import { useMoltenDbContext } from "./MoltenDbContext";

export interface MoltenDbResourceResult<T> {
  value: T | undefined;
  isLoading: boolean;
  error: any | null;
}

export interface MoltenDbResourceOptions<T> {
  /**
   * Value the `value` state starts with, before the first fetch resolves in
   * the browser — and what it stays at (unchanged) on the server, since no
   * fetch is ever attempted there. Defaults to `undefined` when omitted.
   */
  initialValue?: T;
}

/**
 * Hook to reactively fetch data from a MoltenDb collection.
 * Automatically re-fetches when the collection changes.
 * Must be used inside <MoltenDbProvider>.
 *
 * On the server (SSR/prerendering), MoltenDb never boots — `isReady` stays
 * `false` forever there — so this resolves synchronously to `isLoading: false`,
 * `error: null`, and `value: options?.initialValue` (or `undefined` if none was
 * given), with no fetch attempted and no hang.
 *
 * @param collection - The collection name to query.
 * @param queryFn - A function receiving the pre-bound collection accessor and the full client.
 * @param options - Optional settings, e.g. `{ initialValue }` to seed `value` instead of `undefined`.
 */
export function useMoltenDbResource<T>(
  collection: string,
  queryFn: (
    collection: ReturnType<MoltenDbClient["collection"]>,
    client: MoltenDbClient
  ) => Promise<T>,
  options?: MoltenDbResourceOptions<T>
): MoltenDbResourceResult<T> {
  const { db, client, isReady } = useMoltenDbContext();

  const [value, setValue] = useState<T | undefined>(options?.initialValue);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<any | null>(null);

  // Keep latest queryFn in a ref to avoid stale closures without re-subscribing
  const queryFnRef = useRef(queryFn);
  queryFnRef.current = queryFn;

  useEffect(() => {
    // `isReady` never flips true on the server (see MoltenDbContext), and
    // effects never run during server rendering anyway — this keeps the
    // "don't fetch on the server" contract explicit either way.
    if (!isReady) return;

    let cancelled = false;

    const fetchData = async () => {
      setIsLoading(true);
      try {
        const result = await queryFnRef.current(
          client.collection(collection),
          client
        );
        if (!cancelled) {
          setValue(result);
          setError(null);
        }
      } catch (err: any) {
        if (!cancelled) {
          if (err.message?.includes("404")) {
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
