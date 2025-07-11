# FileManager Native - iOS Encrypted File Manager

A React Native iOS app for secure file management with full compatibility with the web version.

## Features

- **Cross-Platform Crypto Compatibility**: Uses the same AES-GCM encryption as the web app
- **Seamless File Migration**: Move encrypted files between web and mobile versions
- **iOS-Only Focus**: Optimized specifically for iOS devices
- **Secure Storage**: Files encrypted with PBKDF2 key derivation and AES-GCM encryption

## Crypto Compatibility

This React Native app uses the exact same cryptographic implementation as the web app:

- **Algorithm**: AES-GCM (Galois/Counter Mode)
- **Key Derivation**: PBKDF2 with SHA-256, 100,000 iterations
- **Salt Length**: 16 bytes
- **IV Length**: 12 bytes (same as web app)
- **Key Length**: 256 bits

### Implementation Details

The crypto implementation uses `@noble/ciphers` and `@noble/hashes` libraries to match the Web Crypto API behavior exactly.

## File Migration

### Exporting Files to Web App

```typescript
import { MigrationUtils } from './src/utils/MigrationUtils';

// Export a file for use in web app
const webFormat = await MigrationUtils.exportToWebFormat(uuid, password);
```

### Importing Files from Web App

```typescript
// Import encrypted files from web app
const importedFile = await MigrationUtils.importFromWebFormat(
  encryptedFile,
  encryptedMetadata,
  encryptedPreview,
  password
);
```

## Installation

1. **Install Dependencies**: `npm install`
2. **iOS Setup**: `cd ios && pod install && cd ..`
3. **Run on iOS**: `npm run ios`

## iOS-Only Configuration

This app is configured for iOS-only deployment with Android scripts removed.

### Build Commands

- Development: `npm run ios`
- Device deployment: `npm run ios-device`
- Simulator: `npm run ios-simulator`

## Security Notes

- All files are encrypted before storage using the same algorithm as the web app
- Passwords are never stored - only used for key derivation
- Files encrypted on one platform can be decrypted on the other
- Uses cryptographically secure random number generation
- Metadata is also encrypted to protect file information

