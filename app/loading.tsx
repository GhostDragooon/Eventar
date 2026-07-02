// Route-transition skeleton — pages no longer hang on a blank screen while
// the server component streams. Neutral shimmer blocks in the page rhythm.
export default function Loading() {
  return (
    <div className="w-full max-w-[1440px] mx-auto p-grid-margin" aria-busy="true" aria-label="Loading">
      <div className="animate-pulse">
        <div className="h-[12px] w-[90px] rounded-full bg-surface-container-high mb-sm" />
        <div className="h-[34px] w-[320px] max-w-full rounded-[10px] bg-surface-container-high mb-lg" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-sm mb-lg">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-[86px] rounded-[14px] bg-surface-container-high" />
          ))}
        </div>
        <div className="flex flex-col gap-sm">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-[96px] rounded-[16px] bg-surface-container-high" />
          ))}
        </div>
      </div>
    </div>
  );
}
