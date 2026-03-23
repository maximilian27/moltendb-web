export interface MoltenDBOptions {
    /** URL or path to moltendb-worker.js. */
    workerUrl?: string | URL;
    /** Enable WebSocket sync with a MoltenDB server. Default: false. */
    syncEnabled?: boolean;
    /** WebSocket server URL. Default: 'wss://localhost:1538/ws'. */
    serverUrl?: string;
    /** Sync batch flush interval in ms. Default: 5000. */
    syncIntervalMs?: number;
    /** JWT token for WebSocket authentication. */
    authToken?: string;
}
export type SyncCallback = (update: {
    event: 'change' | 'delete' | 'drop';
    collection: string;
    key: string;
    new_v: number | null;
}) => void;
export declare class MoltenDB {
    readonly dbName: string;
    readonly workerUrl?: string | URL;
    worker: Worker | null;
    private messageId;
    private pendingRequests;
    isLeader: boolean;
    private bc;
    private syncEnabled;
    private serverUrl;
    private syncIntervalMs;
    private authToken?;
    private ws;
    private syncCallbacks;
    private syncQueue;
    private syncTimer;
    /** ⚡ Hook to listen to native real-time DB mutations (works on all tabs) */
    onEvent?: (event: any) => void;
    constructor(dbName?: string, options?: MoltenDBOptions);
    init(): Promise<void>;
    private startAsLeader;
    private startAsFollower;
    sendMessage(action: string, payload?: Record<string, unknown>): Promise<any>;
    set(collection: string, key: string, value: Record<string, unknown>, options?: {
        skipSync?: boolean;
    }): Promise<void>;
    get(collection: string, key: string): Promise<unknown>;
    getAll(collection: string): Promise<unknown>;
    delete(collection: string, key: string, options?: {
        skipSync?: boolean;
    }): Promise<void>;
    compact(): Promise<unknown>;
    private startSync;
    onSyncEvent(callback: SyncCallback): void;
    disconnect(): void;
    terminate(): void;
}
