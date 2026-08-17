---
"vitest-native": minor
---

jest-compat: `jest.requireActual` and `jest.requireMock` resolve `resolve.alias` specifiers

Both resolve through Node, which knows nothing about the Vite config, so `jest.requireActual('@/services/foo')` threw MODULE_NOT_FOUND while the same specifier resolved everywhere else in the suite. The plugin now passes the alias table to the compat setup, which expands a matching entry — including the extensions Node does not know, so an alias pointing into a TypeScript source tree resolves too. Specifiers that no alias matches are untouched.
