export interface MoltenDBOptions {
    /** URL or path to moltendb-worker.js. */
    workerUrl?: string | URL;
}
export interface DBEvent {
    type: 'event';
    event: 'change' | 'delete' | 'drop';
    collection: string;
    key: string;
    new_v: number | null;
}
export declare class MoltenDB {
    readonly dbName: string;
    readonly workerUrl?: string | URL;
    worker: Worker | null;
    private pendingRequests;
    isLeader: boolean;
    private bc;
    /** Legacy global hook. Use `subscribe()` for multi-component listeners. */
    onEvent?: (event: DBEvent) => void;
    private eventListeners;
    constructor(dbName?: string, options?: MoltenDBOptions);
    /**
     * ⚡ Subscribe to real-time DB mutations.
     * @returns An unsubscribe function to prevent memory leaks in UI frameworks.
     */
    subscribe(listener: (event: DBEvent) => void): () => void;
    /** Manually remove a specific listener */
    unsubscribe(listener: (event: DBEvent) => void): void;
    private dispatchEvent;
    private initialized;
    init(): Promise<void>;
    private startAsLeader;
    private startAsFollower;
    sendMessage(action: string, payload?: Record<string, unknown>): Promise<any>;
    set(collection: string, key: string, value: any): Promise<void>;
    get(collection: string, key: string): Promise<unknown>;
    getAll(collection: string): Promise<unknown[]>;
    delete(collection: string, key: string): Promise<void>;
    compact(): Promise<unknown>;
    disconnect(): void;
    terminate(): void;
}
