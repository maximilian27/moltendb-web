import { Injectable, inject, signal } from '@angular/core';
import { MoltenDB } from '@moltendb-web/core';
import { MoltenDBClient } from '@moltendb-web/query';
import { MOLTEN_CONFIG } from './moltendb.provider';

@Injectable({ providedIn: 'root' })
export class MoltenDbService {
  public db: MoltenDB;
  public client: MoltenDBClient;

  // A Signal components can watch to know when WASM is booted and Leader Election is done
  public isReady = signal<boolean>(false);

  constructor() {
    // 🚀 Modern Angular Injection (No constructor decorators needed!)
    const config = inject(MOLTEN_CONFIG);

    this.db = new MoltenDB(config.name, config);
    this.client = new MoltenDBClient(this.db);

    // Boot the engine and update the signal when done
    this.db.init().then(() => {
      this.isReady.set(true);
    }).catch(err => {
      console.error('[MoltenDB] Failed to initialize', err);
    });
  }
}