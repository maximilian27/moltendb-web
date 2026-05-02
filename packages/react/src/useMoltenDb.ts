import { MoltenDbClient } from '@moltendb-web/query';
import { useMoltenDbContext } from './MoltenDbContext';

/**
 * Hook to access the MoltenDb Query Client directly.
 * Must be used inside <MoltenDbProvider>.
 */
export function useMoltenDb(): MoltenDbClient {
  return useMoltenDbContext().client;
}
