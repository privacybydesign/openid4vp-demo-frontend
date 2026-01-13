# Digital Credentials API Demo

Demo application showcasing the [Digital Credentials API](https://wicg.github.io/digital-credentials/) for requesting verifiable credentials using OpenID4VP protocol.

## Overview

This demo integrates with the Yivi wallet to request and receive credentials through the Android Digital Credentials API.

## Requirements

- Chrome 128+ on Android
- Enable `chrome://flags/#digital-credentials`
- Yivi app with Digital Credentials support
- HTTPS connection (or localhost for development)

## Development

```bash
npm install
npm run dev
```

## Documentation

- [Digital Credentials API Specification](https://wicg.github.io/digital-credentials/)
- [OpenID for Verifiable Presentations](https://openid.net/specs/openid-4-verifiable-presentations-1_0.html)
