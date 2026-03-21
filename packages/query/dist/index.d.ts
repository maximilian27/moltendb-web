/** A plain JSON-serialisable value. */
export type JsonValue = string | number | boolean | null | JsonValue[] | {
    [key: string]: JsonValue;
};
/** A document stored in MoltenDB — any object with string keys. */
export type Document = {
    [key: string]: JsonValue;
};
/** A map of document key → document body used in set/update payloads. */
export type DataMap = {
    [key: string]: Document;
};
/** Comparison operators supported in a WHERE clause. */
export interface WhereOperators {
    $eq?: JsonValue;
    $ne?: JsonValue;
    $gt?: number;
    $gte?: number;
    $lt?: number;
    $lte?: number;
    $in?: JsonValue[];
    $nin?: JsonValue[];
    $contains?: JsonValue;
}
/**
 * A WHERE clause: each key is a field path (dot-notation supported),
 * and the value is either a plain value (implicit equality) or an operator object.
 */
export type WhereClause = {
    [field: string]: JsonValue | WhereOperators;
};
/** A single sort specification. */
export interface SortSpec {
    field: string;
    order?: 'asc' | 'desc';
}
/** A single join specification. */
export interface JoinSpec {
    /** The alias under which the joined document is embedded. */
    alias: string;
    /** The collection to join from. */
    from: string;
    /** The foreign-key field path on the main document. */
    on: string;
    /** Optional field projection on the joined document. */
    fields?: string[];
}
/**
 * Inline reference embedding at insert time.
 * Format: { alias: "collection.key" }
 * Example: { ram: "memory.mem4", screen: "display.dsp3" }
 */
export type ExtendsMap = {
    [alias: string]: string;
};
/**
 * The transport layer used by MoltenDBClient to send messages.
 * Implement this interface to connect the query builder to any backend:
 *   - A Web Worker (WASM in-browser)
 *   - A fetch-based HTTP client
 *   - A WebSocket connection
 *   - A mock for testing
 */
export interface MoltenTransport {
    send(action: 'get' | 'set' | 'update' | 'delete', payload: Document): Promise<JsonValue>;
}
/**
 * Default transport that communicates with a MoltenDB Web Worker.
 *
 * The worker must follow the moltendb-worker.js message protocol:
 *   postMessage({ id, action, ...payload })
 *   onmessage → { id, result } | { id, error }
 */
export declare class WorkerTransport implements MoltenTransport {
    private worker;
    private messageId;
    private pending;
    onEvent?: (event: any) => void;
    constructor(worker: Worker, startId?: number);
    send(action: 'get' | 'set' | 'update' | 'delete', payload: Document): Promise<JsonValue>;
}
/**
 * Builder for GET (read/query) operations.
 *
 * Allowed fields: collection, keys, where, fields, excludedFields,
 *                 joins, sort, count, offset
 *
 * @example
 * const rows = await db.collection('laptops')
 *   .get()
 *   .where({ brand: 'Apple' })
 *   .fields(['brand', 'model', 'price'])
 *   .sort([{ field: 'price', order: 'asc' }])
 *   .count(5)
 *   .exec();
 */
export declare class GetQuery {
    private payload;
    private transport;
    /** @internal */
    constructor(transport: MoltenTransport, collection: string);
    /**
     * Fetch a single document by key, or a batch of documents by key array.
     *
     * @param keys - A single key string or an array of key strings.
     *
     * @example
     * // Single key
     * .keys('lp2')
     * // Batch
     * .keys(['lp1', 'lp3', 'lp5'])
     */
    keys(keys: string | string[]): this;
    /**
     * Filter documents using a WHERE clause.
     * Multiple conditions are combined with implicit AND.
     *
     * Supported operators: $eq, $ne, $gt, $gte, $lt, $lte, $in, $nin, $contains
     * Dot-notation is supported for nested fields.
     *
     * @example
     * .where({ brand: 'Apple' })
     * .where({ price: { $gt: 1000, $lt: 3000 } })
     * .where({ 'specs.cpu.brand': 'Intel', in_stock: true })
     */
    where(clause: WhereClause): this;
    /**
     * Project the response to only the specified fields (dot-notation supported).
     * Cannot be combined with {@link excludedFields}.
     *
     * @example
     * .fields(['brand', 'model', 'specs.cpu.ghz'])
     */
    fields(fields: string[]): this;
    /**
     * Return all fields except the specified ones.
     * Cannot be combined with {@link fields}.
     *
     * @example
     * .excludedFields(['price', 'memory_id', 'display_id'])
     */
    excludedFields(fields: string[]): this;
    /**
     * Join related documents from other collections.
     * Each join embeds the related document under the given alias.
     *
     * @example
     * .joins([
     *   { alias: 'ram',    from: 'memory',  on: 'memory_id',  fields: ['capacity_gb', 'type'] },
     *   { alias: 'screen', from: 'display', on: 'display_id', fields: ['refresh_hz', 'panel'] },
     * ])
     */
    joins(specs: JoinSpec[]): this;
    /**
     * Sort the results.
     * Multiple specs are applied in priority order (first = primary sort key).
     *
     * @example
     * .sort([{ field: 'price', order: 'asc' }])
     * .sort([{ field: 'brand', order: 'asc' }, { field: 'price', order: 'desc' }])
     */
    sort(specs: SortSpec[]): this;
    /**
     * Limit the number of results returned (applied after filtering and sorting).
     *
     * @example
     * .count(10)
     */
    count(n: number): this;
    /**
     * Skip the first N results (for pagination, applied after sorting).
     *
     * @example
     * .offset(20).count(10)  // page 3 of 10
     */
    offset(n: number): this;
    /**
     * Build and return the raw JSON payload without sending it.
     * Useful for debugging or passing to a custom transport.
     */
    build(): Document;
    /**
     * Execute the query and return the result.
     * Returns a single document for single-key lookups, or an array for all others.
     */
    exec(): Promise<JsonValue>;
}
/**
 * Builder for SET (insert / upsert) operations.
 *
 * Allowed fields: collection, data, extends
 *
 * @example
 * await db.collection('laptops')
 *   .set({
 *     lp1: { brand: 'Lenovo', model: 'ThinkPad X1', price: 1499 },
 *     lp2: { brand: 'Apple',  model: 'MacBook Pro', price: 3499 },
 *   })
 *   .exec();
 */
export declare class SetQuery {
    private payload;
    private transport;
    /** @internal */
    constructor(transport: MoltenTransport, collection: string, data: DataMap | Document[]);
    /**
     * Embed data from other collections into each document at insert time.
     * The referenced document is fetched once and stored as a snapshot.
     *
     * Format: `{ alias: "collection.key" }`
     *
     * @example
     * .extends({ ram: 'memory.mem4', screen: 'display.dsp3' })
     */
    extends(map: ExtendsMap): this;
    /** Build and return the raw JSON payload without sending it. */
    build(): Document;
    /** Execute the insert/upsert and return `{ count, status }`. */
    exec(): Promise<JsonValue>;
}
/**
 * Builder for UPDATE (partial patch / merge) operations.
 *
 * Allowed fields: collection, data
 *
 * Only the fields present in each patch object are updated —
 * all other fields on the existing document are left unchanged.
 *
 * @example
 * await db.collection('laptops')
 *   .update({ lp4: { price: 1749, in_stock: true } })
 *   .exec();
 */
export declare class UpdateQuery {
    private payload;
    private transport;
    /** @internal */
    constructor(transport: MoltenTransport, collection: string, data: DataMap);
    /** Build and return the raw JSON payload without sending it. */
    build(): Document;
    /** Execute the patch and return `{ count, status }`. */
    exec(): Promise<JsonValue>;
}
/**
 * Builder for DELETE operations.
 *
 * Allowed fields: collection, keys, drop
 *
 * @example
 * // Delete a single document
 * await db.collection('laptops').delete().keys('lp6').exec();
 *
 * // Delete multiple documents
 * await db.collection('laptops').delete().keys(['lp4', 'lp5']).exec();
 *
 * // Drop the entire collection
 * await db.collection('laptops').delete().drop().exec();
 */
export declare class DeleteQuery {
    private payload;
    private transport;
    /** @internal */
    constructor(transport: MoltenTransport, collection: string);
    /**
     * Delete a single document by key, or multiple documents by key array.
     *
     * @example
     * .keys('lp6')
     * .keys(['lp4', 'lp5'])
     */
    keys(keys: string | string[]): this;
    /**
     * Drop the entire collection (deletes all documents).
     * Cannot be combined with {@link keys}.
     *
     * @example
     * .drop()
     */
    drop(): this;
    /** Build and return the raw JSON payload without sending it. */
    build(): Document;
    /** Execute the delete and return `{ count, status }`. */
    exec(): Promise<JsonValue>;
}
/**
 * A handle to a specific collection.
 * Returned by `MoltenDBClient.collection(name)`.
 * Use it to start any of the four operation builders.
 */
export declare class CollectionHandle {
    private transport;
    private collectionName;
    /** @internal */
    constructor(transport: MoltenTransport, collectionName: string);
    /**
     * Start a GET (read/query) builder for this collection.
     *
     * @example
     * db.collection('laptops').get().where({ brand: 'Apple' }).exec()
     */
    get(): GetQuery;
    /**
     * Start a SET (insert/upsert) builder for this collection.
     *
     * @param data - A map of `{ key: document }` pairs, or an array of documents
     *               (keys are auto-generated as UUIDv7 when using array format).
     *
     * @example
     * db.collection('laptops').set({ lp1: { brand: 'Lenovo', price: 1499 } }).exec()
     */
    set(data: DataMap | Document[]): SetQuery;
    /**
     * Start an UPDATE (partial patch) builder for this collection.
     *
     * @param data - A map of `{ key: patch }` pairs. Only the provided fields are updated.
     *
     * @example
     * db.collection('laptops').update({ lp4: { price: 1749 } }).exec()
     */
    update(data: DataMap): UpdateQuery;
    /**
     * Start a DELETE builder for this collection.
     * Chain `.keys(...)` or `.drop()` to specify what to delete.
     *
     * @example
     * db.collection('laptops').delete().keys('lp6').exec()
     */
    delete(): DeleteQuery;
}
/**
 * The main entry point for the MoltenDB query builder.
 *
 * Accepts any {@link MoltenTransport} implementation — use {@link WorkerTransport}
 * to connect to a MoltenDB WASM Web Worker, or provide your own transport
 * for HTTP, WebSocket, or testing.
 *
 * @example
 * // Browser + WASM Web Worker
 * const worker = new Worker('./moltendb-worker.js', { type: 'module' });
 * const transport = new WorkerTransport(worker);
 * const db = new MoltenDBClient(transport);
 *
 * const results = await db.collection('laptops')
 *   .get()
 *   .where({ in_stock: true })
 *   .sort([{ field: 'price', order: 'asc' }])
 *   .count(5)
 *   .exec();
 */
export declare class MoltenDBClient {
    private transport;
    constructor(transport: MoltenTransport);
    /**
     * Select a collection to operate on.
     * Returns a {@link CollectionHandle} from which you can start any query builder.
     *
     * @param name - The collection name (e.g. `'laptops'`).
     */
    collection(name: string): CollectionHandle;
}
//# sourceMappingURL=index.d.ts.map