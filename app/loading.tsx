// Route-transition skeleton — pages no longer hang on a blank screen while
// the server component streams. Neutral shimmer blocks in the page rhythm.
export default function Loading() {
  return (
    <div className="w-full max-w-[90rem] mx-auto p-grid-margin" aria-busy="true" aria-label="Loading">
      <div className="animate-pulse">
        <div className="h-[0.75rem] w-[5.625rem] rounded-full bg-surface-container-high mb-sm" />
        <div className="h-[2.125rem] w-[20rem] max-w-full rounded-lg bg-surface-container-high mb-lg" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-sm mb-lg">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-[5.375rem] rounded-xl bg-surface-container-high" />
          ))}
        </div>
        <div className="flex flex-col gap-sm">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-[6rem] rounded-[1rem] bg-surface-container-high" />
          ))}
        </div>
      </div>
    </div>
  );
}
