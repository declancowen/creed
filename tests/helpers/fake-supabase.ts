// A small in-memory fake of the Supabase client surface the server libs use.
//
// The DB-touching libs cast an untyped `client: unknown` to a chainable
// `SupabaseLikeClient` and call `.from(table).select/insert/update/upsert/...`
// with `.eq/.is/.not/.in/.order/.limit/.maybeSingle/.single` and `await`. This
// fake backs each table with an in-memory array so those chains behave
// realistically enough to assert the design's correctness properties.
//
// It is intentionally minimal: it implements only the operators these libs use
// and returns `{ data, error }` shaped results. Selection projection is a no-op
// (full rows are returned); the mappers in the libs read specific fields.

type Row = Record<string, unknown>;

type Result = { data: unknown; error: { message: string } | null };

type Op = "select" | "insert" | "update" | "upsert" | "delete";

type Filter =
  | { kind: "eq"; column: string; value: unknown }
  | { kind: "is"; column: string; value: unknown }
  | { kind: "not"; column: string; operator: string; value: unknown }
  | { kind: "in"; column: string; values: unknown[] }
  | { kind: "gte"; column: string; value: unknown }
  | { kind: "lte"; column: string; value: unknown };

let idCounter = 0;
function nextId(prefix: string) {
  idCounter += 1;
  return `${prefix}-${idCounter.toString().padStart(6, "0")}`;
}

function normalizeNullish(value: unknown) {
  return value === undefined ? null : value;
}

function matches(row: Row, filters: Filter[]): boolean {
  return filters.every((filter) => {
    switch (filter.kind) {
      case "eq":
        return row[filter.column] === filter.value;
      case "is":
        return normalizeNullish(row[filter.column]) === normalizeNullish(filter.value);
      case "not": {
        // Only the `.not(col, "is", null)` form is used by the libs.
        if (filter.operator === "is") {
          return normalizeNullish(row[filter.column]) !== normalizeNullish(filter.value);
        }
        return row[filter.column] !== filter.value;
      }
      case "in":
        return filter.values.includes(row[filter.column]);
      case "gte":
        return (row[filter.column] as number) >= (filter.value as number);
      case "lte":
        return (row[filter.column] as number) <= (filter.value as number);
      default:
        return true;
    }
  });
}

export class FakeSupabaseClient {
  private tables = new Map<string, Row[]>();

  /** Seed a table with rows (deep-cloned so callers can't mutate stored state). */
  seed(table: string, rows: Row[]) {
    this.tables.set(table, rows.map((row) => ({ ...row })));
  }

  /** Read the current rows of a table (clones) for assertions in tests. */
  rows(table: string): Row[] {
    return (this.tables.get(table) ?? []).map((row) => ({ ...row }));
  }

  count(table: string): number {
    return (this.tables.get(table) ?? []).length;
  }

  private store(table: string): Row[] {
    let rows = this.tables.get(table);
    if (!rows) {
      rows = [];
      this.tables.set(table, rows);
    }
    return rows;
  }

  from(table: string) {
    return {
      select: (_columns?: string, _options?: Record<string, unknown>) =>
        new FakeQuery(this, table, "select"),
      insert: (values: unknown, _options?: Record<string, unknown>) =>
        new FakeQuery(this, table, "insert", values),
      update: (values: unknown) => new FakeQuery(this, table, "update", values),
      upsert: (values: unknown, _options?: Record<string, unknown>) =>
        new FakeQuery(this, table, "upsert", values),
      delete: () => new FakeQuery(this, table, "delete"),
    };
  }

  // Internal execution used by FakeQuery once a terminal is reached.
  execute(
    table: string,
    op: Op,
    payload: unknown,
    filters: Filter[],
    order: { column: string; ascending: boolean } | null,
    limit: number | null
  ): { rows: Row[] } {
    const store = this.store(table);

    if (op === "select") {
      let result = store.filter((row) => matches(row, filters));
      if (order) {
        const dir = order.ascending ? 1 : -1;
        result = [...result].sort((a, b) => {
          const av = a[order.column];
          const bv = b[order.column];
          if (av === bv) return 0;
          return (av as number) > (bv as number) ? dir : -dir;
        });
      }
      if (limit !== null) result = result.slice(0, limit);
      return { rows: result.map((row) => ({ ...row })) };
    }

    if (op === "insert") {
      const values = Array.isArray(payload) ? payload : [payload];
      const inserted = values.map((value) => {
        const row: Row = { ...(value as Row) };
        if (row.id === undefined) row.id = nextId(table);
        if (row.created_at === undefined) row.created_at = new Date().toISOString();
        store.push(row);
        return { ...row };
      });
      return { rows: inserted };
    }

    if (op === "update") {
      const patch = payload as Row;
      const updated: Row[] = [];
      for (const row of store) {
        if (matches(row, filters)) {
          Object.assign(row, patch);
          updated.push({ ...row });
        }
      }
      return { rows: updated };
    }

    if (op === "upsert") {
      const values = Array.isArray(payload) ? payload : [payload];
      const out: Row[] = [];
      for (const value of values) {
        const incoming = value as Row;
        // Match on `id` (the singleton pattern used by the libs keys on `id`).
        const existing = store.find((row) => row.id === incoming.id);
        if (existing) {
          Object.assign(existing, incoming);
          out.push({ ...existing });
        } else {
          const row: Row = { ...incoming };
          if (row.id === undefined) row.id = nextId(table);
          if (row.created_at === undefined) row.created_at = new Date().toISOString();
          store.push(row);
          out.push({ ...row });
        }
      }
      return { rows: out };
    }

    // delete
    const kept: Row[] = [];
    const removed: Row[] = [];
    for (const row of store) {
      if (matches(row, filters)) removed.push({ ...row });
      else kept.push(row);
    }
    this.tables.set(table, kept);
    return { rows: removed };
  }
}

class FakeQuery implements PromiseLike<Result> {
  private filters: Filter[] = [];
  private orderBy: { column: string; ascending: boolean } | null = null;
  private limitCount: number | null = null;

  constructor(
    private client: FakeSupabaseClient,
    private table: string,
    private op: Op,
    private payload: unknown = undefined
  ) {}

  eq(column: string, value: unknown) {
    this.filters.push({ kind: "eq", column, value });
    return this;
  }

  is(column: string, value: unknown) {
    this.filters.push({ kind: "is", column, value });
    return this;
  }

  not(column: string, operator: string, value: unknown) {
    this.filters.push({ kind: "not", column, operator, value });
    return this;
  }

  in(column: string, values: unknown[]) {
    this.filters.push({ kind: "in", column, values });
    return this;
  }

  gte(column: string, value: unknown) {
    this.filters.push({ kind: "gte", column, value });
    return this;
  }

  lte(column: string, value: unknown) {
    this.filters.push({ kind: "lte", column, value });
    return this;
  }

  order(column: string, options?: Record<string, unknown>) {
    this.orderBy = { column, ascending: options?.ascending !== false };
    return this;
  }

  limit(count: number) {
    this.limitCount = count;
    return this;
  }

  // `.select()` after a mutation (insert/update/upsert/delete) just narrows the
  // returned columns in real Supabase; here it is a passthrough that keeps the
  // pending operation intact so the terminal still applies the mutation.
  select(_columns?: string, _options?: Record<string, unknown>) {
    return this;
  }

  private run(): Result {
    const { rows } = this.client.execute(
      this.table,
      this.op,
      this.payload,
      this.filters,
      this.orderBy,
      this.limitCount
    );
    return { data: rows, error: null };
  }

  async maybeSingle(): Promise<Result> {
    const { data } = this.run();
    const rows = data as Row[];
    return { data: rows[0] ?? null, error: null };
  }

  async single(): Promise<Result> {
    const { data } = this.run();
    const rows = data as Row[];
    if (rows.length === 0) {
      return { data: null, error: { message: "No rows returned for single()." } };
    }
    return { data: rows[0], error: null };
  }

  then<TResult1 = Result, TResult2 = never>(
    onfulfilled?: ((value: Result) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ): Promise<TResult1 | TResult2> {
    return Promise.resolve(this.run()).then(onfulfilled, onrejected);
  }
}

/**
 * Build a fake client pre-seeded with a single document. Returns the client and
 * the document id so tests can drive edits/proposals against it.
 */
export function createFakeClientWithDocument(
  overrides: Partial<Row> = {}
): { client: FakeSupabaseClient; documentId: string } {
  const client = new FakeSupabaseClient();
  const documentId = (overrides.id as string) ?? "doc-1";
  const now = new Date().toISOString();
  client.seed("creed_documents", [
    {
      id: documentId,
      slug: "test-doc",
      title: "Test Doc",
      description: "",
      content: "# Test Doc\nOriginal body.",
      path: "test-doc.md",
      folder_id: null,
      github_repo_owner: null,
      github_repo_name: null,
      github_branch: "main",
      github_path: "test-doc.md",
      last_remote_sha: null,
      last_synced_content_hash: null,
      last_synced_revision: null,
      sync_status: "local-ahead",
      revision: 1,
      document_type: "feature",
      stage: "discovery",
      lifecycle: "ideation",
      status: "backlog",
      priority: "medium",
      size: "m",
      archived_at: null,
      updated_at: now,
      ...overrides,
    },
  ]);
  return { client, documentId };
}
