"""
Guardrails for M3-1 — the cockpit elevation system (CR-38).

The cockpit read as "flat" for a reason that no component pass could fix: the surface tokens were
INVERTED. The canvas (#1A253A) was the LIGHTEST plane and cards (#151926) were DARKER than the stage
they sat on — a 1.14:1 card/canvas ratio — so every card receded instead of lifting.

That is a silent failure: nothing errors, no test fails, the tokens are all "correct" brand hexes,
and the UI just looks wrong forever. So the ramp is asserted here as a COMPUTED property of the real
CSS — parse the hexes, compute relative luminance, and require the ordering to hold:

    canvas <= panel < card      (a card must LIFT off the stage)
    inset  <  card              (a field is punched back down INTO the card)

Also asserts the component set stays token-driven — a hex literal in a component silently forks the
ramp, which is how design systems rot.

Run: pytest tests/guardrails -q
"""
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
GLOBALS_CSS = ROOT / "apps/web/app/globals.css"
ELEVATION_TSX = ROOT / "apps/web/components/ui/elevation.tsx"
DESIGN_SYSTEM = ROOT / "docs/DESIGN-SYSTEM.md"

# The four planes, darkest -> most lifted, keyed to the token that paints each one.
CANVAS = "datum-midnight"
PANEL = "datum-panel"
CARD = "datum-cardbg"
INSET = "datum-darknavy"


def relative_luminance(hex_color: str) -> float:
    """WCAG relative luminance. Used for ORDERING surfaces, not for text-contrast compliance."""
    h = hex_color.lstrip("#")
    assert len(h) == 6, f"expected a 6-digit hex, got {hex_color!r}"
    channels = [int(h[i : i + 2], 16) / 255 for i in (0, 2, 4)]
    linear = [c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4 for c in channels]
    r, g, b = linear
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def theme_tokens() -> dict[str, str]:
    """Parse the @theme color tokens out of the real stylesheet."""
    css = GLOBALS_CSS.read_text()
    block = re.search(r"@theme\s*\{(.*?)\n\}", css, re.S)
    assert block, "globals.css must declare an @theme block"
    tokens = dict(re.findall(r"--color-([a-z0-9-]+)\s*:\s*(#[0-9a-fA-F]{6})\s*;", block.group(1)))
    assert tokens, "no --color-* tokens parsed from @theme"
    return tokens


def test_all_four_elevation_planes_are_declared():
    tokens = theme_tokens()
    for plane in (CANVAS, PANEL, CARD, INSET):
        assert plane in tokens, f"the elevation ramp needs --color-{plane} (M3-1/CR-38)"


def test_card_lifts_off_the_canvas():
    """
    THE regression this whole guardrail exists for. If a card is not lighter than the canvas, the
    cockpit is flat again — and nothing else will tell you.
    """
    tokens = theme_tokens()
    canvas, card = relative_luminance(tokens[CANVAS]), relative_luminance(tokens[CARD])
    assert card > canvas, (
        f"the card plane (--color-{CARD} {tokens[CARD]}, luminance {card:.5f}) must be LIGHTER than "
        f"the canvas (--color-{CANVAS} {tokens[CANVAS]}, luminance {canvas:.5f}). It is not, so "
        "every card recedes into the stage instead of lifting — this is the exact inversion M3-1 "
        "fixed (CR-38). Do not 'fix' this by swapping the assertion."
    )


def test_elevation_ramp_is_monotonic():
    tokens = theme_tokens()
    canvas, panel, card = (relative_luminance(tokens[p]) for p in (CANVAS, PANEL, CARD))
    assert canvas <= panel < card, (
        f"the ramp must ascend canvas <= panel < card, got canvas={canvas:.5f} "
        f"panel={panel:.5f} card={card:.5f}"
    )


def test_inset_is_punched_back_down_into_the_card():
    tokens = theme_tokens()
    inset, card = relative_luminance(tokens[INSET]), relative_luminance(tokens[CARD])
    assert inset < card, (
        f"the inset field plane (--color-{INSET} {tokens[INSET]}) must be DARKER than the card "
        f"(--color-{CARD} {tokens[CARD]}) — a field is punched INTO the card, not raised off it"
    )


def test_elevation_components_exist_and_are_token_driven():
    assert ELEVATION_TSX.exists(), "the Panel/Card/Field set must live at components/ui/elevation.tsx"
    src = ELEVATION_TSX.read_text()
    for component in ("export function Panel", "export function Card", "export function Field"):
        assert component in src, f"elevation.tsx must export {component.split()[-1]}"

    # A hex literal here silently forks the ramp away from the tokens.
    body = "\n".join(ln for ln in src.splitlines() if not ln.strip().startswith("*"))
    hexes = re.findall(r"#[0-9a-fA-F]{6}\b", body)
    assert not hexes, (
        f"elevation.tsx must be token-driven — found hardcoded hex literal(s) {hexes}. Use the "
        "--color-datum-* tokens so the ramp stays single-sourced."
    )


def test_each_plane_binds_to_its_token():
    """The components must actually paint the planes they claim to."""
    src = ELEVATION_TSX.read_text()
    for plane in (PANEL, CARD, INSET):
        assert f"bg-{plane}" in src, f"elevation.tsx must apply bg-{plane} for its plane"


def test_card_is_defined_by_a_border_not_fill_alone():
    """The ramp is deliberately subtle; the 1px border is what makes the lift legible."""
    src = ELEVATION_TSX.read_text()
    # Slice Card's source: from its declaration to the next top-level export (or EOF).
    card = re.search(r"export function Card\b(.*?)(?=\nexport function |\Z)", src, re.S)
    assert card, "elevation.tsx must export a Card"
    assert re.search(r"border border-datum-slate/\d+", card.group(1)), (
        "Card must carry a defined 1px border (M3-1: 'card (lifted, defined 1px border)')"
    )


def test_design_system_documents_the_ramp():
    """The canonical doc and the code must not drift — DESIGN-SYSTEM.md is the source of truth."""
    doc = DESIGN_SYSTEM.read_text()
    assert re.search(r"##\s*Elevation", doc, re.I), "DESIGN-SYSTEM.md must document the elevation ramp"
    tokens = theme_tokens()
    for plane in (CANVAS, PANEL, CARD, INSET):
        assert tokens[plane].lower() in doc.lower(), (
            f"DESIGN-SYSTEM.md must carry the real hex for --color-{plane} ({tokens[plane]}) — the "
            "canonical table drifting from globals.css is how the inversion survived this long"
        )
