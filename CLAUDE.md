# MiteSDK Development Guide

MiteSDK is an SDK for error and bug reporting.

## Build Commands
- Run typecheck: `bun typescript` or `bun --filter="**" typescript`
- Clean build artifacts: `bun clean`
- Run specs/codegen: `bun spec` (from root) or `bun specs` (from package folder)
- Run example app: `cd example && bun start`
- Run tests: `cd example && bun test`
- Run linter: `cd package && bun lint`

## Code Style & Conventions
- **Formatting**: Using Biome with 2-space indentation, 90 char line width
- **Quotes**: Single quotes for JS/TS, double quotes for JSX
- **Semicolons**: Optional, only when needed
- **Imports**: Organized automatically, grouped by type
- **Types**: Always use TypeScript interfaces for object types, prefer type aliases for unions
- **Error Handling**: Use try/catch blocks with detailed error messages, prefix logs with `[Mite]`
- **Naming**:
  - Classes: PascalCase (e.g., `Mite`)
  - Variables/methods: camelCase
  - Interfaces: PascalCase with descriptive names (e.g., `MiteConfig`)
  - Private class members: Use `private` keyword
- **Comments**: Use JSDoc-style comments for public APIs, normal comments for implementation details
- **Testing**: Jest with snapshot testing for components

## Project Structure
- `/package`: Core SDK code
- `/example`: Demo React Native app using the SDK

## Native Module Development Workflow
1. First define or update TypeScript interfaces in `.nitro.ts` files in `package/src/specs/`
2. Run `bun spec` to generate C++ interface files in `package/nitrogen/generated/`
3. Implement the C++ functionality in `package/cpp/`, `package/ios`, and `package/android` files
4. Always update TS specs first, then generate C++ interfaces before modifying implementation

### Implementation Notes
- Native files are based on the files in `nitrogen/generated/`. For example, MiteSDK.nitro.ts generates HybridMiteSDKSpec.cpp/hpp, and your implementation in HybridMiteSDK.cpp/hpp inherits from HybridMiteSDKSpec.cpp/hpp
- All classes that inherit from a generated `[ClassName]Spec.cpp/hpp` **must**:
  1. Be default-constructible (have a public constructor that takes no arguments)
  2. Initialize with `HybridObject(TAG)` constructor in that default constructor

Example:
```cpp
class HybridMiteSDK: public HybridMiteSDKSpec {
public:
    // Default constructor with no arguments
    HybridMiteSDK(): HybridObject(TAG) { /* initialization */ }
    // ...
};
```
- The constructor initialization is required for proper registration with the Nitro framework
- Any additional initialization should happen within this no-argument constructor
