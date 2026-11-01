# CX-03 evidence (from the episode trace)

The user-lens brief for CX-03 described the visible effect as: a fix to the shared class merger `cn()` (lib/utils.ts) so that type-scale classes such as `text-label-md` stop evicting text-colour classes (and the reverse). Some buttons and badges got smaller (14px or 16px to the token's 12px with letter-spacing), and some buttons that used to render dark text on blue now render white text.

The primary-button label `text-on-primary!` is the colour class that was being evicted. Check its contrast with WCAG relative luminance after any merger change; do not assume it.
