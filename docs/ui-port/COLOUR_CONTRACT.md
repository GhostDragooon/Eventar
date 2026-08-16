# Eventar production colour contract

## Source of truth

`app/globals.css`, including the production root, Tailwind theme registration and dark mode blocks.

External prototype CSS is not a token source.

## Fixed role mapping

```text
Prototype visual role        Production implementation
Primary filled background    bg-primary
Text on primary fill         text-on-primary
Primary text on pale surface text-primary-ink
General text                 text-on-surface
Supporting text              text-on-surface-variant
Base surface                 bg-surface
Lowest raised surface        bg-surface-container-lowest
Muted surface                bg-surface-container
Higher muted surface         bg-surface-container-high
Border                       border-outline-variant
Error surface                bg-error-container
Error content                text-on-error-container
Success surface              bg-success-container
Success content              text-on-success-container
Focus treatment              focus:ring-primary
In-range calendar day        bg-primary-container text-on-primary-container
Selected calendar edge       bg-primary text-on-primary
Today indicator              ring-1 ring-primary
Drag-active drop zone        border-primary + bg-primary-container
Progress (uploading)         bg-primary
Progress (complete)          bg-success
Progress (error)             bg-error
Status label complete        text-success
Status label error           text-error
```

## Primary role rule

Primary fill and primary ink must never be collapsed.

Use:

```tsx
className="bg-primary text-on-primary"
```

for a filled primary control.

Use:

```tsx
className="text-primary-ink"
```

for small primary-coloured text on white, pale or container surfaces.

Do not use `text-primary` as a substitute for primary ink.

## Status rule

Use existing semantic roles:

```text
error    bg-error-container text-on-error-container
success  bg-success-container text-on-success-container
warning  existing production warning container and on-container roles
```

Primary blue must not communicate approval, verification, completion or success.

## Dark mode rule

Dark mode must be inherited from the existing production token system.

Forbidden during a port:

* component-level colour palettes
* `data-theme`
* duplicate dark selectors
* hard-coded dark colours
* new theme persistence logic

## Calendar range contract

```tsx
// In-range day
className="bg-primary-container text-on-primary-container rounded-sm"

// Start or end edge
className="bg-primary text-on-primary rounded-full"

// Today when not selected
className="ring-1 ring-primary"
```

## Upload / evidence contract

```tsx
// Drag-active drop zone
className="border-primary bg-primary-container"

// Progress fill while uploading
className="bg-primary"

// Progress fill on complete
className="bg-success"

// Progress fill on error
className="bg-error"
```
