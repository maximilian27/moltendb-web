import { EnvironmentProviders, InjectionToken, makeEnvironmentProviders } from '@angular/core';
import { MoltenDBOptions } from '@moltendb-web/core';

export interface AngularMoltenDbOptions extends MoltenDBOptions {
  name: string;
}

export const MOLTEN_CONFIG = new InjectionToken<AngularMoltenDbOptions>('MOLTEN_CONFIG');

export function provideMoltenDb(config: AngularMoltenDbOptions): EnvironmentProviders {
  return makeEnvironmentProviders([
    { provide: MOLTEN_CONFIG, useValue: config }
  ]);
}