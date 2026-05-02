import { MoltenDbClient } from '@moltendb-web/query';
/**
 * Hook to access the MoltenDb Query Client directly.
 * Must be used inside <MoltenDbProvider>.
 */
export declare function useMoltenDb(): MoltenDbClient;
