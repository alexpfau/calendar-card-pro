# Fix Lit Production Build - Remove Development Mode Warnings

## Problem
The bundled `calendar-card-pro.js` file was including Lit in development mode, causing:
- Console warnings in production Home Assistant installations
- Larger bundle size (260KB)
- Potential performance degradation
- Development-only code included in production builds

## Root Cause
The Rollup configuration was not properly configuring bundler plugins to use production exports from Lit. This resulted in:
1. Development version of Lit being bundled
2. Missing `NODE_ENV=production` definition during compilation
3. No explicit production export conditions in module resolution

## Solution

### 1. Fixed Rollup Configuration (`rollup.config.mjs`)

**esbuild plugin**: Added explicit `NODE_ENV` definition
```javascript
esbuild({
  tsconfig: 'tsconfig.json',
  target: 'es2017',
  sourceMap: true,
  define: {
    'process.env.NODE_ENV': JSON.stringify('production'),
  },
})
```

**resolve plugin**: Configured to prefer production exports
```javascript
resolve({
  browser: true,
  exportConditions: ['production', 'default'],
  mainFields: ['browser', 'module', 'main'],
})
```

**terser plugin**: Enhanced production optimizations
```javascript
terser({
  compress: {
    drop_console: false,
    drop_debugger: true,
    pure_funcs: ['console.debug'],
  },
  format: {
    comments: false,
  },
})
```

### 2. Fixed TypeScript Configuration (`tsconfig.json`)

Resolved deprecated TypeScript 7.0 options:
- Changed `moduleResolution` from `"Node"` (deprecated) to `"Bundler"`
- Removed deprecated `baseUrl` and updated `paths` to use absolute paths from root

## Results

✅ **Bundle size reduced**: 260KB → 240KB (~8% reduction)  
✅ **No development mode warnings**: Verified no Lit development strings in bundle  
✅ **Production-optimized**: Lit now uses production exports  
✅ **TypeScript errors fixed**: No more deprecation warnings  

## Testing

1. Built production bundle: `npm run build`
2. Verified bundle size reduction
3. Searched for development mode strings: none found
4. Deployed to Home Assistant and verified no console warnings
5. Confirmed all TypeScript compilation errors resolved

## Breaking Changes
None. This is a build configuration fix that doesn't affect the API or functionality.

## Migration Guide
Users should:
1. Update to this version
2. Clear browser cache (Ctrl+Shift+R / Cmd+Shift+R)
3. Reload Home Assistant

No configuration changes required.
