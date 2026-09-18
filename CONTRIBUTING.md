# Contributing

Small fixes, accessibility improvements, and clearer documentation are welcome. Keep the diary simple, usable offline, and free of analytics or health-data uploads by default.

1. Fork the repository and create a branch for your change.
2. Use artificial notes and prescription files only. Never attach real health records to an issue or pull request.
3. Build with `node scripts/build.mjs` and test the affected flow on mobile and desktop. For storage, backup, or offline changes, run both browser smoke scripts described in the README.
4. Explain the problem, the resulting behavior, and what you checked in your pull request.

Preserve existing IndexedDB records and older backup compatibility. Update the PRD and README when behavior or limits change. Avoid third-party runtime requests. Please discuss large changes before implementing them; cloud sync and medical recommendations are outside the current scope.

By contributing, you agree that your changes will be available under this repository's MIT license.
