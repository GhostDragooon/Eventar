# Component porting guide

## Preserve from the prototype

* semantic purpose
* visual hierarchy
* control placement
* interaction order
* expanded and collapsed states
* selected and unselected states
* loading, success and error transitions
* responsive intent
* animation purpose
* focus destination and return
* pointer, keyboard and touch behaviour

## Replace during the port

* React demo state with production state conventions
* demo services with typed request and result contracts
* prototype CSS with production Tailwind utilities
* placeholder data with typed props or production loaders
* timer-decided success with external operation results
* unsupported claims with neutral copy or approved data

## Do not silently simplify

If the source uses a popover, side sheet, two-month calendar, shared element transition, drag interaction or morphing control, preserve that behaviour. If production constraints require a deviation, record it in the category manifest before implementation.

## Service state contract

A component may show working state immediately after a user request. It may show success only after a service result confirms success.

```ts
export type OperationState =
  | "idle"
  | "working"
  | "success"
  | "error"
  | "cancelled";
```

See also `lib/ui-port/foundation-contract.ts`.

## Package boundary

Category packages contain production-oriented code only. They do not repeat this guide. Each package contains a manifest referring to this foundation version.
