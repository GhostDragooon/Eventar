export function happyRate<TRow>(
  rows: TRow[],
  key: keyof TRow,
): number | null {
  let happy = 0;
  let denom = 0;
  for (const row of rows) {
    const v = row[key];
    if (v == null) continue;
    denom++;
    if (v === 'exceeded' || v === 'met') happy++;
  }
  if (denom === 0) return null;
  return happy / denom;
}
