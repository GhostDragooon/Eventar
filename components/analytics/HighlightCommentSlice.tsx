import { Slice } from './Slice';

export function HighlightCommentSlice({
  latestQuote,
  latestQuoteAgo,
  totalComments,
}: {
  latestQuote: string | null;
  latestQuoteAgo: string | null; // e.g. "2 hours ago"
  totalComments: number;
}) {
  return (
    <Slice
      icon="campaign"
      iconBg="secondary-container"
      title="Content (Q2)"
      prompt={'"What stood out as a key highlight from this event?"'}
    >
      <div className="w-full flex justify-between items-center">
        <div className="flex flex-col">
          <span className="text-label-md font-label-md text-primary uppercase">Latest Highlight</span>
          <span className="font-headline-sm text-2xl text-on-surface">
            {latestQuote ? `"${latestQuote}"` : 'No comments yet.'}
          </span>
          {latestQuoteAgo && (
            <div className="mt-md flex flex-wrap gap-sm">
              <span className="text-[10px] font-bold text-primary uppercase tracking-tighter bg-primary/5 px-2 py-0.5 rounded border border-primary/20">
                {latestQuoteAgo}
              </span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-md bg-surface-container-low px-lg py-md rounded-xl border border-outline-variant">
          <div className="text-center">
            <span className="block text-label-md font-bold text-on-surface-variant uppercase">Comments</span>
            <span className="text-headline-sm font-bold text-primary">{totalComments}</span>
          </div>
        </div>
      </div>
    </Slice>
  );
}
