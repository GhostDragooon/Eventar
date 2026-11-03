  // create_event_with_blocks stores the client's display_order (update_event_with_blocks uses the array position), so
  // the action must overwrite it with the sorted index or a stale client's own numbers decide the stored order.
  it('overwrites a client-supplied display_order with the sorted position', async () => {
  // Saved in start-time order. create_event_with_blocks stores the display_order it is sent, so write the sorted
  // position over whatever the client supplied (update_event_with_blocks uses the array position itself).
  const orderedBlocks = startOrder(blockParse.data).map((i, pos) => ({ ...blockParse.data[i]!, display_order: pos }));
  // Backtest M2 (Ivan's ruling 2026-11-02): the agenda is saved in start-time order. The form sorted; the action did
  // not, so any other client saved display_order = whatever order it sent.