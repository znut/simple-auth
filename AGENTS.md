# AGENTS.md

## Project Context

This is Simple Authen webapp

- Sveltekit for user management UI
- export package `simple-auth-lib` for app to verify auth token

## Dev Environment

- Use `bun install` for dependencies.
- Must `bun run check` and make sure it always passed without error or warning
- Must `bun run lint` and make sure it always passed without error or warning
- When editing database schemas, DO NOT modify migrations file manually, run `bun db:generate` to automatically generate migration

## Testing Instructions

- Run `bun run test` to execute all tests.
- For specfic test `bun run test:unit` or `bun run test:e2e`
- ALWAYS make sure all tests passed

## Code Style & Conventions

- Run linter and prettier before any check or test
- Do not leave unused locals, parameters, or variables in the codebase. And DO NOT prefix ignored values with `_`.
- Use components provided by DaisyUI first before creating custom components. Customize DaisyUI theme as needed so it applied App-wide and not just look and feel in one specific place.
