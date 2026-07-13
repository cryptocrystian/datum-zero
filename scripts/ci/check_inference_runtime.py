"""
Runtime self-check for the inference image (M2-6b, CR-35). Run INSIDE the built image (the script is
not baked — it is piped over stdin), which has NO DJI SDK, exactly like production CI:

    docker run --rm -i dz-inference:ci python - < scripts/ci/check_inference_runtime.py

Asserts the radiometric registry boots, FLIR + radiometric-TIFF decoders are usable, and the DJI path
FAILS CLOSED (DjiSdkUnavailable) when the Confidential SDK is absent — rather than crashing the
service. Exits non-zero on any failure so CI fails the build.
"""
import sys

from app.radiometric import (
    DjiRjpegDecoder,
    DjiSdkUnavailable,
    FlirRjpegDecoder,
    RadiometricTiffDecoder,
    build_default_port,
)

# The default registry boots (imports FLIR/TIFF/DJI decoders) without the DJI SDK or flyr present.
build_default_port()

# FLIR + radiometric-TIFF are usable with no SDK.
FlirRjpegDecoder()
RadiometricTiffDecoder()

# DJI MUST fail closed (not crash) when the Confidential SDK wrapper is absent (as in CI).
try:
    DjiRjpegDecoder().decode(b"\xff\xd8\xff\xe1fake-dji", {"Make": "DJI"})
    print("FAIL: DJI decode returned without the SDK — expected DjiSdkUnavailable", file=sys.stderr)
    sys.exit(1)
except DjiSdkUnavailable:
    pass

print("OK: registry boots; FLIR+TIFF serve; DJI fails closed (DjiSdkUnavailable) without the SDK")
