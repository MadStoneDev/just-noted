// In-memory Supabase fake for billing tests. Unlike a mock, it really applies
// .eq() filters to update/select, so a missing guard (e.g. plan_source) shows up
// as a changed row. Supports: select().eq()…maybeSingle(), update().eq()…
// (awaited), upsert(row, { onConflict }).

type Row = Record<string, any>;

export function fakeSupabase(initial: Record<string, Row[]>) {
  const tables: Record<string, Row[]> = {};
  for (const [k, rows] of Object.entries(initial)) tables[k] = rows.map((r) => ({ ...r }));
  const writes: { table: string; op: "update" | "upsert"; values: Row }[] = [];

  const from = (table: string) => {
    tables[table] ??= [];
    const filters: [string, any][] = [];
    let patch: Row | null = null;
    const matches = (r: Row) => filters.every(([c, v]) => r[c] === v);

    const builder: any = {
      select: () => builder,
      eq: (col: string, val: any) => { filters.push([col, val]); return builder; },
      maybeSingle: async () => ({ data: tables[table].find(matches) ?? null, error: null }),
      update: (values: Row) => { patch = values; return builder; },
      upsert: async (values: Row, opts?: { onConflict?: string }) => {
        writes.push({ table, op: "upsert", values });
        const key = opts?.onConflict ?? "id";
        const existing = tables[table].find((r) => r[key] === values[key]);
        if (existing) Object.assign(existing, values);
        else tables[table].push({ ...values });
        return { data: null, error: null };
      },
      // Awaiting an update().eq()… chain applies it.
      then: (resolve: (v: any) => void, reject?: (e: any) => void) => {
        try {
          if (patch) {
            writes.push({ table, op: "update", values: patch });
            for (const r of tables[table]) if (matches(r)) Object.assign(r, patch);
          }
          resolve({ data: null, error: null });
        } catch (e) {
          reject?.(e);
        }
      },
    };
    return builder;
  };

  return {
    client: { from },
    rows: (table: string) => tables[table] ?? [],
    row: (table: string, userId: string): Row => (tables[table] ?? []).find((r) => r.user_id === userId) as Row,
    writes,
  };
}
