// ─── MoltenDB Query Builder ───────────────────────────────────────────────────
// Chainable, type-safe query builder for MoltenDB.
//
// Each operation has its own builder class that only exposes the methods
// that are valid for that operation — matching the server's allowed-property
// lists exactly:
//
//   GET_ALLOWED:    collection, keys, where, fields, excludedFields,
//                   joins, sort, count, offset
//   SET_ALLOWED:    collection, data, extends
//   UPDATE_ALLOWED: collection, data
//   DELETE_ALLOWED: collection, keys, drop
//
// Usage (vanilla JS or TypeScript):
//
//   const db = new MoltenDBClient(worker);
//
//   // GET — chainable query
//   const results = await db.collection('laptops')
//     .get()
//     .where({ brand: 'Apple' })
//     .fields(['brand', 'model', 'price'])
//     .sort([{ field: 'price', order: 'asc' }])
//     .count(10)
//     .exec();
//
//   // SET — insert/upsert
//   await db.collection('laptops')
//     .set({ lp1: { brand: 'Lenovo', price: 1499 } })
//     .exec();
//
//   // UPDATE — partial patch
//   await db.collection('laptops')
//     .update({ lp4: { price: 1749, in_stock: true } })
//     .exec();
//
//   // DELETE — single key, batch, or drop
//   await db.collection('laptops').delete().keys('lp6').exec();
//   await db.collection('laptops').delete().keys(['lp4', 'lp5']).exec();
//   await db.collection('laptops').delete().drop().exec();
// ─────────────────────────────────────────────────────────────────────────────

// ─── Types ────────────────────────────────────────────────────────────────────

/** A plain JSON-serialisable value. */
export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

/** A document stored in MoltenDB — any object with string keys. */
export type Document = { [key: string]: JsonValue };

/** A map of document key → document body used in set/update payloads. */
export type DataMap = { [key: string]: Document };

// ── WHERE operators ───────────────────────────────────────────────────────────

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

// ── Sort ──────────────────────────────────────────────────────────────────────

/** A single sort specification. */
export interface SortSpec {
  field: string;
  order?: 'asc' | 'desc';
}

// ── Join ──────────────────────────────────────────────────────────────────────

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

// ── Extends ───────────────────────────────────────────────────────────────────

/**
 * Inline reference embedding at insert time.
 * Format: { alias: "collection.key" }
 * Example: { ram: "memory.mem4", screen: "display.dsp3" }
 */
export type ExtendsMap = { [alias: string]: string };

// ── Transport interface ───────────────────────────────────────────────────────

/**
 * The transport layer used by MoltenDBClient to send messages.
 * Implement this interface to connect the query builder to any backend:
 *   - A Web Worker (WASM in-browser)
 *   - A fetch-based HTTP client
 *   - A WebSocket connection
 *   - A mock for testing
 */
export interface MoltenTransport {
  sendMessage(action: 'get' | 'set' | 'update' | 'delete', payload: Document): Promise<JsonValue>;
}

// ─── WorkerTransport ──────────────────────────────────────────────────────────

/**
 * Default transport that communicates with a MoltenDB Web Worker.
 *
 * The worker must follow the moltendb-worker.js message protocol:
 *   postMessage({ id, action, ...payload })
 *   onmessage → { id, result } | { id, error }
 */
export class WorkerTransport implements MoltenTransport {
  private worker: Worker;
  private messageId: number;
  private pending = new Map<number, { resolve: (v: JsonValue) => void; reject: (e: Error) => void }>();
  public onEvent?: (event: any) => void;

  constructor(worker: Worker, startId = 0) {
    this.messageId = startId;
    this.worker = worker;
    this.worker.addEventListener('message', (event: MessageEvent) => {
      // 1. Intercept unsolicited broadcast events from the Rust core
      if (event.data && event.data.type === 'event') {
        if (this.onEvent) this.onEvent(event.data);
        return; // Don't try to process this as a promise resolution
      }

      // 2. Standard request/response routing
      const { id, result, error } = event.data as { id: number; result?: JsonValue; error?: string };
      const p = this.pending.get(id);
      if (!p) return;

      this.pending.delete(id);
      if (error) p.reject(new Error(error));
      else p.resolve(result ?? null);
    });
  }

  sendMessage(action: 'get' | 'set' | 'update' | 'delete', payload: Document): Promise<JsonValue> {
    return new Promise((resolve, reject) => {
      const id = this.messageId++;
      this.pending.set(id, { resolve, reject });
      this.worker.postMessage({ id, action, ...payload });
    });
  }
}

// ─── GetQuery ─────────────────────────────────────────────────────────────────

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
export class GetQuery {
  private payload: Document;
  private transport: MoltenTransport;

  /** @internal */
  constructor(transport: MoltenTransport, collection: string) {
    this.transport = transport;
    this.payload = { collection };
  }

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
  keys(keys: string | string[]): this {
    this.payload['keys'] = keys as JsonValue;
    return this;
  }

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
  where(clause: WhereClause): this {
    this.payload['where'] = clause as unknown as JsonValue;
    return this;
  }

  /**
   * Project the response to only the specified fields (dot-notation supported).
   * Cannot be combined with {@link excludedFields}.
   *
   * @example
   * .fields(['brand', 'model', 'specs.cpu.ghz'])
   */
  fields(fields: string[]): this {
    this.payload['fields'] = fields as JsonValue;
    return this;
  }

  /**
   * Return all fields except the specified ones.
   * Cannot be combined with {@link fields}.
   *
   * @example
   * .excludedFields(['price', 'memory_id', 'display_id'])
   */
  excludedFields(fields: string[]): this {
    this.payload['excludedFields'] = fields as JsonValue;
    return this;
  }

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
  joins(specs: JoinSpec[]): this {
    this.payload['joins'] = specs.map(({ alias, from, on, fields }) => ({
      [alias]: fields ? { from, on, fields } : { from, on },
    })) as unknown as JsonValue;
    return this;
  }

  /**
   * Sort the results.
   * Multiple specs are applied in priority order (first = primary sort key).
   *
   * @example
   * .sort([{ field: 'price', order: 'asc' }])
   * .sort([{ field: 'brand', order: 'asc' }, { field: 'price', order: 'desc' }])
   */
  sort(specs: SortSpec[]): this {
    this.payload['sort'] = specs as unknown as JsonValue;
    return this;
  }

  /**
   * Limit the number of results returned (applied after filtering and sorting).
   *
   * @example
   * .count(10)
   */
  count(n: number): this {
    this.payload['count'] = n;
    return this;
  }

  /**
   * Skip the first N results (for pagination, applied after sorting).
   *
   * @example
   * .offset(20).count(10)  // page 3 of 10
   */
  offset(n: number): this {
    this.payload['offset'] = n;
    return this;
  }

  /**
   * Build and return the raw JSON payload without sending it.
   * Useful for debugging or passing to a custom transport.
   */
  build(): Document {
    return { ...this.payload };
  }

  /**
   * Execute the query and return the result.
   * Returns a single document for single-key lookups, or an array for all others.
   */
  exec(): Promise<JsonValue> {
    return this.transport.sendMessage('get', this.payload);
  }
}

// ─── SetQuery ─────────────────────────────────────────────────────────────────

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
export class SetQuery {
  private payload: Document;
  private transport: MoltenTransport;

  /** @internal */
  constructor(transport: MoltenTransport, collection: string, data: DataMap | Document[]) {
    this.transport = transport;
    this.payload = { collection, data: data as unknown as JsonValue };
  }

  /**
   * Embed data from other collections into each document at insert time.
   * The referenced document is fetched once and stored as a snapshot.
   *
   * Format: `{ alias: "collection.key" }`
   *
   * @example
   * .extends({ ram: 'memory.mem4', screen: 'display.dsp3' })
   */
  extends(map: ExtendsMap): this {
    // The extends map is applied to every document in data.
    // We store it at the top level; the server resolves it per-document.
    const data = this.payload['data'];
    if (Array.isArray(data)) {
      // Array format — inject extends into each item
      this.payload['data'] = (data as Document[]).map((doc) => ({
        ...doc,
        extends: map as unknown as JsonValue,
      })) as unknown as JsonValue;
    } else if (data && typeof data === 'object') {
      // Object format — inject extends into each document value
      const updated: DataMap = {};
      for (const [key, doc] of Object.entries(data as DataMap)) {
        updated[key] = { ...(doc as Document), extends: map as unknown as JsonValue };
      }
      this.payload['data'] = updated as unknown as JsonValue;
    }
    return this;
  }

  /** Build and return the raw JSON payload without sending it. */
  build(): Document {
    return { ...this.payload };
  }

  /** Execute the insert/upsert and return `{ count, status }`. */
  exec(): Promise<JsonValue> {
    return this.transport.sendMessage('set', this.payload);
  }
}

// ─── UpdateQuery ──────────────────────────────────────────────────────────────

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
export class UpdateQuery {
  private payload: Document;
  private transport: MoltenTransport;

  /** @internal */
  constructor(transport: MoltenTransport, collection: string, data: DataMap) {
    this.transport = transport;
    this.payload = { collection, data: data as unknown as JsonValue };
  }

  /** Build and return the raw JSON payload without sending it. */
  build(): Document {
    return { ...this.payload };
  }

  /** Execute the patch and return `{ count, status }`. */
  exec(): Promise<JsonValue> {
    return this.transport.sendMessage('update', this.payload);
  }
}

// ─── DeleteQuery ──────────────────────────────────────────────────────────────

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
export class DeleteQuery {
  private payload: Document;
  private transport: MoltenTransport;

  /** @internal */
  constructor(transport: MoltenTransport, collection: string) {
    this.transport = transport;
    this.payload = { collection };
  }

  /**
   * Delete a single document by key, or multiple documents by key array.
   *
   * @example
   * .keys('lp6')
   * .keys(['lp4', 'lp5'])
   */
  keys(keys: string | string[]): this {
    this.payload['keys'] = keys as JsonValue;
    return this;
  }

  /**
   * Drop the entire collection (deletes all documents).
   * Cannot be combined with {@link keys}.
   *
   * @example
   * .drop()
   */
  drop(): this {
    this.payload['drop'] = true;
    return this;
  }

  /** Build and return the raw JSON payload without sending it. */
  build(): Document {
    return { ...this.payload };
  }

  /** Execute the delete and return `{ count, status }`. */
  exec(): Promise<JsonValue> {
    return this.transport.sendMessage('delete', this.payload);
  }
}

// ─── CollectionHandle ─────────────────────────────────────────────────────────

/**
 * A handle to a specific collection.
 * Returned by `MoltenDBClient.collection(name)`.
 * Use it to start any of the four operation builders.
 */
export class CollectionHandle {
  private transport: MoltenTransport;
  private collectionName: string;

  /** @internal */
  constructor(transport: MoltenTransport, collectionName: string) {
    this.transport = transport;
    this.collectionName = collectionName;
  }

  /**
   * Start a GET (read/query) builder for this collection.
   *
   * @example
   * db.collection('laptops').get().where({ brand: 'Apple' }).exec()
   */
  get(): GetQuery {
    return new GetQuery(this.transport, this.collectionName);
  }

  /**
   * Start a SET (insert/upsert) builder for this collection.
   *
   * @param data - A map of `{ key: document }` pairs, or an array of documents
   *               (keys are auto-generated as UUIDv7 when using array format).
   *
   * @example
   * db.collection('laptops').set({ lp1: { brand: 'Lenovo', price: 1499 } }).exec()
   */
  set(data: DataMap | Document[]): SetQuery {
    return new SetQuery(this.transport, this.collectionName, data);
  }

  /**
   * Start an UPDATE (partial patch) builder for this collection.
   *
   * @param data - A map of `{ key: patch }` pairs. Only the provided fields are updated.
   *
   * @example
   * db.collection('laptops').update({ lp4: { price: 1749 } }).exec()
   */
  update(data: DataMap): UpdateQuery {
    return new UpdateQuery(this.transport, this.collectionName, data);
  }

  /**
   * Start a DELETE builder for this collection.
   * Chain `.keys(...)` or `.drop()` to specify what to delete.
   *
   * @example
   * db.collection('laptops').delete().keys('lp6').exec()
   */
  delete(): DeleteQuery {
    return new DeleteQuery(this.transport, this.collectionName);
  }
}

// ─── MoltenDBClient ───────────────────────────────────────────────────────────

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
export class MoltenDBClient {
  private transport: MoltenTransport;

  constructor(transport: MoltenTransport) {
    this.transport = transport;
  }

  /**
   * Select a collection to operate on.
   * Returns a {@link CollectionHandle} from which you can start any query builder.
   *
   * @param name - The collection name (e.g. `'laptops'`).
   */
  collection(name: string): CollectionHandle {
    return new CollectionHandle(this.transport, name);
  }
}

