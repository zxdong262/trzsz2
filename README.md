# trzsz2

[中文](README.cn.md) | [English](README.md)

> trzsz.js's derivative project providing a pure protocol implementation for Node.js and browser environments.

## Notice

**This project is based on [trzsz-js](https://github.com/trzsz/trzsz.js) by [Lonny Wong](https://github.com/lonnywong).**

All credits for the original trzsz protocol implementation go to Lonny Wong. This is a derived work that:

- Removes file system (`fs`) and browser-specific dependencies from the original codebase
- Focuses on providing a pure protocol implementation suitable for Node.js environments
- Maintains compatibility with browser usage through the browser build

## Installation

```bash
npm install trzsz2
```

## Building from Source

```bash
# Clone the repository
git clone https://github.com/zxdong262/trzsz2.git
cd trzsz2

# Install dependencies
npm install

# Build all formats
npm run build

# Build specific format
npm run build:esm    # ESM only
npm run build:cjs    # CommonJS only
npm run build:cjs-full  # Bundled CommonJS
npm run build:browser  # Browser bundle
```

## Testing

```bash
# Run unit tests
npm test

# Run integration tests (requires Docker)
npm run test:upload
npm run test:download

# Watch mode
npm run test:watch
```

## TODO

- [ ] Browser usage documentation and examples
- [ ] Browser environment testing and demos
- [ ] WebRTC data channel integration example

## Related Projects

- [trzsz-js](https://github.com/trzsz/trzsz.js) - Original trzsz implementation with file system support by Lonny Wong
- [trzsz](https://github.com/trzsz/trzsz) - The main trzsz project

## License

MIT
