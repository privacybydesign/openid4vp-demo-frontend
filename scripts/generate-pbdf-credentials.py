#!/usr/bin/env python3
"""Generates src/pbdfCredentials.json from a checkout of the pbdf scheme.

The Yivi app registers every credential type of the pbdf scheme with the
Android Credential Manager, so these are the credentials a website can ask
Yivi for through the Digital Credentials API. Run this again after the scheme
changes:

    scripts/generate-pbdf-credentials.py path/to/irma_configuration/pbdf
"""

import json
import sys
import xml.etree.ElementTree as ET
from pathlib import Path


def english(element):
    """The English text of a translated element, or None."""
    if element is None:
        return None
    text = element.findtext("en")
    return text.strip() if text else None


def main():
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    scheme = Path(sys.argv[1])
    scheme_id = ET.parse(scheme / "description.xml").getroot().findtext("Id")

    credentials = []
    for description in sorted(scheme.glob("*/Issues/*/description.xml")):
        issuer_dir = description.parents[2]
        issuer = ET.parse(issuer_dir / "description.xml").getroot()
        credential = ET.parse(description).getroot()

        attributes = [
            {"id": attribute.get("id"), "name": english(attribute.find("Name"))}
            for attribute in credential.iterfind("Attributes/Attribute")
            # A revocation attribute has no id and is never disclosed.
            if attribute.get("id")
        ]
        if not attributes:
            continue

        credentials.append(
            {
                "id": ".".join(
                    [scheme_id, issuer.findtext("ID"), credential.findtext("CredentialID")]
                ),
                "name": english(credential.find("Name")),
                "issuer": english(issuer.find("Name")),
                "deprecated": credential.find("DeprecatedSince") is not None,
                "attributes": attributes,
            }
        )

    output = Path(__file__).resolve().parent.parent / "src" / "pbdfCredentials.json"
    output.write_text(json.dumps(credentials, indent=2, ensure_ascii=False) + "\n")
    print(f"wrote {len(credentials)} credential types to {output}")


if __name__ == "__main__":
    main()
