# Agent API panel

## Sub-features

- Segmented tabs: Recall, Assert, Retract (`role="tablist"`, `aria-label="Request type"`)
- Request JSON editor (textarea)
- **Send request** button
- Response pane (JSON `pre` block)
- Collapsible **Install** section

## How to get to it (user POV)

1. Open the desk at `/`
2. Right sidebar card titled **Agent API**
3. Pick a tab, edit JSON, click **Send request**

## Driving it with browser (CDP / Browser-use)

1. Open verify desk
2. Click tab **Assert** (`role=tab`, accessible name `Assert`)
3. Set a unique `idempotencyKey` and distinct `draft.attribute` (e.g. `desk.verify.marker`)
4. Click button **Send request**
5. Response pane must contain `"kind": "asserted"`
6. Left table must show the new attribute within one refresh cycle (desk reloads beliefs after send)

Repeat with **Recall** tab — response `"kind": "recalled"` and beliefs array includes prior assert.

## Gotchas

- Invalid JSON shows an inline error under the button; response pane unchanged.
- While `busy`, **Send request** label reads `Sending…` and **Retract** row buttons disable.
- Tab switch replaces editor content with the built-in sample for that kind.
