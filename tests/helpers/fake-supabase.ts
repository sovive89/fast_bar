/**
 * Supabase falso, em memória, só com o que a lógica de servidor da operação usa: from/select/
 * insert/update/upsert e os filtros eq/neq/in/is/lt, mais order/limit/single/maybeSingle. As tabelas são
 * listas de objetos — o teste monta o estado inicial e depois confere o que foi gravado.
 *
 * Não é um Postgres: não valida constraints, tipos nem RLS. Serve para testar as regras da
 * aplicação (quem pode abrir/fechar, o que é recusado, o que é gravado), não a migration.
 */

type Row = Record<string, unknown>;
type Filter = (row: Row) => boolean;
type Result = { data: unknown; error: { message: string } | null };

let idCounter = 0;
function newId() {
  idCounter += 1;
  return `00000000-0000-4000-8000-${String(idCounter).padStart(12, "0")}`;
}

class Query implements PromiseLike<Result> {
  private filters: Filter[] = [];
  private mode: "select" | "insert" | "update" | "delete" | "upsert" = "select";
  private upsertKeys: string[] = ["id"];
  private payload: Row | Row[] | null = null;
  private wantSingle: "single" | "maybe" | null = null;
  private wantRows = false;
  private limitCount: number | null = null;

  constructor(
    private readonly db: FakeSupabase,
    private readonly table: string,
  ) {}

  select(_columns?: string) {
    // Depois de insert/update, select só pede as linhas afetadas de volta.
    if (this.mode !== "select") this.wantRows = true;
    return this;
  }
  insert(payload: Row | Row[]) {
    this.mode = "insert";
    this.payload = payload;
    return this;
  }
  /** Grava ou atualiza pela chave de conflito (padrão: id), como o upsert do Supabase. */
  upsert(payload: Row, options?: { onConflict?: string }) {
    this.mode = "upsert";
    this.payload = payload;
    this.upsertKeys = (options?.onConflict ?? "id").split(",").map((key) => key.trim());
    return this;
  }
  update(payload: Row) {
    this.mode = "update";
    this.payload = payload;
    return this;
  }
  delete() {
    this.mode = "delete";
    return this;
  }
  eq(column: string, value: unknown) {
    this.filters.push((row) => row[column] === value);
    return this;
  }
  neq(column: string, value: unknown) {
    this.filters.push((row) => row[column] !== value);
    return this;
  }
  in(column: string, values: unknown[]) {
    this.filters.push((row) => values.includes(row[column]));
    return this;
  }
  is(column: string, value: unknown) {
    this.filters.push((row) => (row[column] ?? null) === value);
    return this;
  }
  lt(column: string, value: unknown) {
    this.filters.push((row) => String(row[column]) < String(value));
    return this;
  }
  order(_column: string, _options?: unknown) {
    return this;
  }
  limit(count: number) {
    this.limitCount = count;
    return this;
  }
  single() {
    this.wantSingle = "single";
    return this;
  }
  maybeSingle() {
    this.wantSingle = "maybe";
    return this;
  }

  private run(): Result {
    const rows = this.db.table(this.table);
    const failure = this.db.failNext.get(`${this.table}:${this.mode}`);
    if (failure) {
      this.db.failNext.delete(`${this.table}:${this.mode}`);
      return { data: null, error: { message: failure } };
    }

    let affected: Row[];
    if (this.mode === "insert") {
      const list = Array.isArray(this.payload) ? this.payload : [this.payload as Row];
      affected = list.map((row) => ({ id: newId(), ...row }));
      // Índices únicos que a lógica testada depende (mesmos da migration).
      for (const row of affected) {
        const conflict = this.db.uniqueKeys[this.table]?.some((keys) =>
          rows.some((existing) => keys.every((key) => existing[key] === row[key])),
        );
        if (conflict) return { data: null, error: { message: "duplicate key" } };
      }
      rows.push(...affected);
    } else if (this.mode === "upsert") {
      const row = this.payload as Row;
      const existing = rows.find((candidate) =>
        this.upsertKeys.every((key) => candidate[key] === row[key]),
      );
      if (existing) {
        Object.assign(existing, row);
        affected = [existing];
      } else {
        affected = [{ id: newId(), ...row }];
        rows.push(...affected);
      }
    } else {
      affected = rows.filter((row) => this.filters.every((filter) => filter(row)));
      if (this.mode === "update") {
        for (const row of affected) Object.assign(row, this.payload);
      }
      if (this.mode === "delete") {
        for (const row of affected) rows.splice(rows.indexOf(row), 1);
      }
    }
    if (this.limitCount !== null) affected = affected.slice(0, this.limitCount);

    if (this.mode !== "select" && !this.wantRows && !this.wantSingle) {
      return { data: null, error: null };
    }
    if (this.wantSingle === "single") {
      return affected.length === 1
        ? { data: { ...affected[0] }, error: null }
        : { data: null, error: { message: "expected one row" } };
    }
    if (this.wantSingle === "maybe") {
      return { data: affected[0] ? { ...affected[0] } : null, error: null };
    }
    return { data: affected.map((row) => ({ ...row })), error: null };
  }

  then<A = Result, B = never>(
    onFulfilled?: ((value: Result) => A | PromiseLike<A>) | null,
    onRejected?: ((reason: unknown) => B | PromiseLike<B>) | null,
  ): PromiseLike<A | B> {
    return Promise.resolve(this.run()).then(onFulfilled, onRejected);
  }
}

export class FakeSupabase {
  private tables = new Map<string, Row[]>();
  /** "tabela:insert" → mensagem de erro a devolver na próxima chamada (simula falha de rede). */
  failNext = new Map<string, string>();
  uniqueKeys: Record<string, string[][]> = {
    fastbar_stock_counts: [["operacao_id"]],
    fastbar_operation_closures: [["operacao_id", "session_id"]],
  };

  table(name: string): Row[] {
    if (!this.tables.has(name)) this.tables.set(name, []);
    return this.tables.get(name)!;
  }
  seed(name: string, rows: Row[]) {
    this.table(name).push(...rows.map((row) => ({ id: newId(), ...row })));
  }
  from(name: string) {
    return new Query(this, name);
  }
  /** Funções SQL (rpc) que o teste registra à mão: nome → resposta. Não executa SQL de verdade. */
  rpcHandlers = new Map<string, (args: Record<string, unknown>) => unknown>();
  rpc(name: string, args: Record<string, unknown>) {
    const handler = this.rpcHandlers.get(name);
    return Promise.resolve(
      handler
        ? { data: handler(args), error: null }
        : { data: null, error: { message: `rpc ${name} não simulada` } },
    );
  }
}
