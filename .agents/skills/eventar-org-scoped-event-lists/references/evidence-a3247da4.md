// 'a, b, c' -> 'a' | 'b' | 'c'. A string literal of plain columns separated by
// ', ' only: no embeds, aliases or casts. A non-literal string yields no columns,
// so every property access fails to compile instead of typing as any.
type Columns<S extends string> = string extends S
  ? never
  : S extends `${infer Head}, ${infer Rest}` ? Head | Columns<Rest> : S;