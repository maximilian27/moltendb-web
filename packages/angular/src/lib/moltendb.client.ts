import { inject } from '@angular/core';
import { MoltenDBClient } from '@moltendb-web/query';
import { MoltenDbService } from './moltendb.service';

/**
 * Functional injection hook to access the MoltenDB Query Client.
 * Removes the need to manually inject MoltenDbService in components.
 */
export function moltendbClient(): MoltenDBClient {
  return inject(MoltenDbService).client;
}