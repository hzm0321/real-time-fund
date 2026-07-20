# components/ui/ — shadcn/ui Primitives

## OVERVIEW

15 shadcn/ui components (new-york style, JSX). Low-level primitives — do NOT modify manually.

## WHERE TO LOOK

```
accordion.jsx    button.jsx       dialog.jsx       drawer.jsx
field.jsx        input-otp.jsx    label.jsx        progress.jsx
radio-group.jsx  select.jsx       separator.jsx    sonner.jsx
spinner.jsx      switch.jsx       tabs.jsx
```

## CONVENTIONS

- **Add via CLI**: `npx shadcn@latest add <component>` — never copy-paste manually
- **Style**: new-york, CSS variables enabled, neutral base color
- **Icons**: lucide-react
- **Path aliases**: `@/components/ui/*`, `@/lib/utils` (cn helper)
- **forwardRef pattern** — all components use React.forwardRef
- **Styling**: tailwind-merge via `cn()` in `lib/utils.js`

## ANTI-PATTERNS (THIS DIRECTORY)

- **Do not edit** — manual changes will be overwritten by shadcn CLI updates
- **No custom components here** — app-specific components belong in `app/components/`
