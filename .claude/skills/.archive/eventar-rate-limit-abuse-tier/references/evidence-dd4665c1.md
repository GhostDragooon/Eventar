// proxy.ts turns an ended session into a redirect before a door action runs,
// so the action fails with a generic error and never reaches its own
// "signed out" branch. Ask the auth server which case it was (Ivan, 2026-10-15).
const s = await checkDoorSession();
return s === 'ended' || s === 'signed_out';