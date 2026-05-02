import { MoltenDbClient } from '@moltendb-web/query';
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
export declare function useMoltenDbResource<T>(collection: string, queryFn: (collection: ReturnType<MoltenDbClient['collection']>, client: MoltenDbClient) => Promise<T>): MoltenDbResourceResult<T>;
