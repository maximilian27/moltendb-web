import React from 'react';
import { MoltenDb, MoltenDbOptions } from '@moltendb-web/core';
import { MoltenDbClient } from '@moltendb-web/query';
export interface ReactMoltenDbOptions extends MoltenDbOptions {
    name: string;
}
export interface MoltenDbContextValue {
    db: MoltenDb;
    client: MoltenDbClient;
    isReady: boolean;
}
export declare const MoltenDbContext: React.Context<MoltenDbContextValue | null>;
export interface MoltenDbProviderProps {
    config: ReactMoltenDbOptions;
    children: React.ReactNode;
}
export declare function MoltenDbProvider({ config, children }: MoltenDbProviderProps): import("react/jsx-runtime").JSX.Element;
export declare function useMoltenDbContext(): MoltenDbContextValue;
