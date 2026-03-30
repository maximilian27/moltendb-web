import { EnvironmentProviders, InjectionToken, makeEnvironmentProviders } from '@angular/core';
import { MoltenDbOptions } from '@moltendb-web/core';

export interface AngularMoltenDbOptions extends MoltenDbOptions {
  name: string;
}

export const MOLTEN_CONFIG = new InjectionToken<AngularMoltenDbOptions>('MOLTEN_CONFIG');

export function provideMoltenDb(config: AngularMoltenDbOptions): EnvironmentProviders {
  return makeEnvironmentProviders([
    { provide: MOLTEN_CONFIG, useValue: config }
  ]);
}