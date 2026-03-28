import { EnvironmentProviders, InjectionToken, makeEnvironmentProviders } from '@angular/core';
import { MoltenDBOptions } from '@moltendb-web/core';

export interface AngularMoltenOptions extends MoltenDBOptions {
  name: string;
}

export const MOLTEN_CONFIG = new InjectionToken<AngularMoltenOptions>('MOLTEN_CONFIG');

export function provideMoltenDB(config: AngularMoltenOptions): EnvironmentProviders {
  return makeEnvironmentProviders([
    { provide: MOLTEN_CONFIG, useValue: config }
  ]);
}