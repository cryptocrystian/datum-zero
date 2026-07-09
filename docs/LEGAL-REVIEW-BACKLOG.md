# Legal Review Backlog

Third-party dependencies and integrations that carry license conditions worth re-checking before a
distribution-model change (on-prem, edge, redistributed binaries, open-sourcing a component). The
platform is a **SaaS backend** today; these are fine in that posture. Tracked per CR-22.

| Item | License | Current use | Revisit when |
|---|---|---|---|
| **`flyr`** (FLIR radiometric decode, M2-1a) | EUPL-1.2 (light copyleft) | Used UNMODIFIED as a library behind `app/radiometric/flir.py::_extract` — wrapped, never forked; all Datum Zero logic stays outside `flyr`. SaaS backend only; nothing `flyr`-linked is distributed. | Before any **on-prem / edge / redistributed** build — EUPL copyleft can require source availability of a derivative work. Consider a clean-room raw-extraction backend if redistribution is needed. |
| **DJI Thermal SDK (DIRP)** (DJI R-JPEG decode, M2-1a) | Proprietary — DJI EULA §14 **Confidential** | Runs ONLY on DJI-captured imagery; called as-is (no modification/reverse-engineering). SDK binary/source/headers **and the DJI wrapper module are never committed** — gitignored, loaded from an env-configured vendored path (`DJI_THERMAL_SDK_PATH`), guardrail-enforced-absent. CI mocks the DIRP boundary. | Before shipping the DJI path to any environment; confirm EULA field-of-use + confidentiality still hold for the deployment. |
