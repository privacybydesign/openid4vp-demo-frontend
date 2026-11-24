# Digital Credentials API Demo

Demo application showcasing the [Digital Credentials API](https://wicg.github.io/digital-credentials/) for requesting verifiable credentials using OpenID4VP protocol.

## Overview

This demo integrates with the Yivi wallet to request and receive credentials through the Android Digital Credentials API.

The Digital Credentials tab sends an unsigned OpenID4VP request (`openid4vp-v1-unsigned`, response mode `dc_api`) straight from the page, without the verifier backend. Yivi shows the site by its origin, as an unknown party, and the page displays the response without verifying it.

You pick the credential and its attributes from the credential types of the `pbdf` scheme, which are what the Yivi app registers with the Android Credential Manager. The list is in `src/pbdfCredentials.json`; regenerate it from a checkout of the scheme with:

```bash
scripts/generate-pbdf-credentials.py path/to/irma_configuration/pbdf
```

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
