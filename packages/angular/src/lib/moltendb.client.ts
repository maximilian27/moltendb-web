import { inject } from '@angular/core';
import { MoltenDbClient } from '@moltendb-web/query';
import { MoltenDbService } from './moltendb.service';

/**
 * Functional injection hook to access the MoltenDb Query Client.
 * Removes the need to manually inject MoltenDbService in components.
 */
export function moltendbClient(): MoltenDbClient {
  return inject(MoltenDbService).client;
}