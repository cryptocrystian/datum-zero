"""
Guardrails for the cockpit elevation system (M3-1 CR-38, corrected to the sampled palette by
M3-1R CR-40).

Two silent failures live here — neither errors, neither fails a normal test, and both just make the
UI look wrong indefinitely:

1. INVERSION (CR-38). The surface tokens were backwards: the canvas was the LIGHTEST plane and cards
   were DARKER than the stage they sat on, so every card receded instead of lifting.

2. THE WRONG LEVER (CR-40). Sampling `docs/design/mockups/Dashboard mockup.png` showed canvas->card
   is only 1.115:1 — NARROWER than the 1.148:1 M3-1 shipped — while card->header is 1.391:1 and
   card->inset 1.278:1. The depth is the header band + inset boxes INSIDE the card, ~2.5x the
   canvas->card step. So "it still looks flat" must never again be answered by widening the ramp.

The ramp is therefore asserted as a COMPUTED property of the real CSS — parse the hexes, compute
relative luminance, and require:

    canvas <= panel < card         a card must LIFT off the stage
    inset  <  card                 a field is punched back down INTO the card
    header >  card                 the header band is the primary depth cue
    canvas -> card stays NARROW    widening it walks away from the mockup

Run: pytest tests/guardrails -q
"""
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
GLOBALS_CSS = ROOT / "apps/web/app/globals.css"
ELEVATION_TSX = ROOT / "apps/web/components/ui/elevation.tsx"
DESIGN_SYSTEM = ROOT / "docs/DESIGN-SYSTEM.md"

# The planes, keyed to the app.* token that paints each one (CR-40 — sampled from the mockup).
CANVAS = "app-canvas"
PANEL = "app-panel"
CARD = "app-card"
INSET = "app-inset"
HEADER = "app-card-header"

# Legacy datum-* names still paint the ~25 hand-rolled surfaces that predate <Card>. They must stay
# pinned to the app.* planes, or half the cockpit silently forks off the sampled palette.
LEGACY_ALIASES = {
    "datum-midnight": CANVAS,
    "datum-panel": PANEL,
    "datum-cardbg": CARD,
    "datum-darknavy": INSET,
}

# The canvas->card step measured on Dashboard mockup.png. The mockup is deliberately NARROW here;
# the depth is carried by the header band and the insets instead.
MOCKUP_CANVAS_TO_CARD = 1.115
CANVAS_TO_CARD_CEILING = 1.30


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


def contrast(a: float, b: float) -> float:
    return (max(a, b) + 0.05) / (min(a, b) + 0.05)


def test_all_elevation_planes_are_declared():
    tokens = theme_tokens()
    for plane in (CANVAS, PANEL, CARD, INSET, HEADER):
        assert plane in tokens, f"the elevation ramp needs --color-{plane} (CR-40)"


def test_legacy_aliases_stay_pinned_to_the_sampled_planes():
    """
    Most cockpit surfaces still use the legacy datum-* names. If those drift off the app.* planes,
    half the UI quietly runs on the old navy palette while the other half is on the sampled one —
    and it looks like a rendering bug, not a token bug.
    """
    tokens = theme_tokens()
    for legacy, plane in LEGACY_ALIASES.items():
        assert legacy in tokens, f"--color-{legacy} is still in use by pages; keep it declared"
        assert tokens[legacy].lower() == tokens[plane].lower(), (
            f"--color-{legacy} ({tokens[legacy]}) must equal its app.* plane --color-{plane} "
            f"({tokens[plane]}) — legacy names are aliases, not a second palette (CR-40)"
        )


def test_card_is_gray_and_canvas_is_navy():
    """
    Sampled from the mockup: the instrument card is NEUTRAL GRAY on a NAVY stage. That contrast is
    much of the tactical read — reverting the card to navy is a real regression, not a nuance.
    """
    tokens = theme_tokens()
    cr, cg, cb = (int(tokens[CARD].lstrip("#")[i : i + 2], 16) for i in (0, 2, 4))
    nr, ng, nb = (int(tokens[CANVAS].lstrip("#")[i : i + 2], 16) for i in (0, 2, 4))
    assert (cb - cr) <= 6, (
        f"--color-{CARD} ({tokens[CARD]}) must be NEUTRAL gray, not navy — the mockup's cards are "
        f"#2f2e33 (blue-red delta {cb - cr}); a blue-dominant card walks back the tactical read"
    )
    assert (nb - nr) >= 12, (
        f"--color-{CANVAS} ({tokens[CANVAS]}) must stay NAVY — the gray-card-on-navy-stage contrast "
        "is the point"
    )


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


def test_header_band_is_the_primary_depth_cue():
    tokens = theme_tokens()
    header, card = relative_luminance(tokens[HEADER]), relative_luminance(tokens[CARD])
    assert header > card, (
        f"the card header band (--color-{HEADER} {tokens[HEADER]}) must be LIGHTER than the card "
        f"body (--color-{CARD} {tokens[CARD]}) — it is the mockup's strongest depth cue at 1.39:1"
    )


def test_depth_lives_inside_the_card_not_in_the_fill_ramp():
    """
    The lesson of CR-40, encoded. M3-1 shipped a canvas->card ramp WIDER than the mockup's and the
    cockpit still read flat, because the depth is the header band + insets. If someone answers "it
    looks flat" by widening the ramp again, they walk away from the mockup — so this fails first.
    """
    tokens = theme_tokens()
    lum = {p: relative_luminance(tokens[p]) for p in (CANVAS, CARD, INSET, HEADER)}
    canvas_to_card = contrast(lum[CANVAS], lum[CARD])
    card_to_header = contrast(lum[CARD], lum[HEADER])
    card_to_inset = contrast(lum[CARD], lum[INSET])

    assert canvas_to_card <= CANVAS_TO_CARD_CEILING, (
        f"canvas->card is {canvas_to_card:.3f}:1 — the mockup is {MOCKUP_CANVAS_TO_CARD}:1. Do NOT "
        "widen the fill ramp to chase depth: M3-1 already shipped a wider ramp than the mockup and "
        "it still read flat. The depth is the header band + inset boxes; adopt <Card>/<Field> "
        "instead (CR-40)."
    )
    assert max(card_to_header, card_to_inset) > canvas_to_card, (
        f"the in-card treatment must out-contrast the fill ramp: card->header {card_to_header:.3f} "
        f"and card->inset {card_to_inset:.3f} vs canvas->card {canvas_to_card:.3f} — in the mockup "
        "the in-card steps are ~2.5x the ramp"
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
        "app.* tokens so the ramp stays single-sourced."
    )


def test_each_plane_binds_to_its_token():
    """The components must actually paint the planes they claim to."""
    src = ELEVATION_TSX.read_text()
    for plane in (PANEL, CARD, INSET):
        assert f"bg-{plane}" in src, f"elevation.tsx must apply bg-{plane} for its plane"


def test_card_renders_the_header_band_the_real_depth_cue():
    """
    A Card without its header band is just a flat fill — which is exactly how the cockpit looked
    through M3-1. The band (a lighter plane + hairline rule) is where the depth actually is.
    """
    src = ELEVATION_TSX.read_text()
    # Slice Card's source: from its declaration to the next top-level export (or EOF).
    card = re.search(r"export function Card\b(.*?)(?=\nexport function |\Z)", src, re.S)
    assert card, "elevation.tsx must export a Card"
    body = card.group(1)
    assert re.search(r"border border-app-line/\d+", body), "Card must carry a defined 1px border"
    assert f"bg-{HEADER}" in body, (
        f"Card's header must paint bg-{HEADER} — the band is the mockup's strongest depth cue "
        "(1.391:1); without it the card is a flat fill (CR-40)"
    )


def test_app_gold_is_confined_to_the_focus_ring_and_is_toggleable():
    """
    The app mockup contains ZERO gold (verified by a hue scan outside the photographic regions —
    the ~600 'gold' pixels an earlier scan found were the thermal plume). Gold is the BRAND
    through-line — the insignia and the marketing site — not an app accent. The single in-app
    exception is the focus ring, behind one token so option A (neutral, zero app gold) is a one-line
    flip. Gold on nav / ΔT / the primary action is the rejected option C (CR-40).
    """
    tokens = theme_tokens()
    assert "app-focus" in tokens, (
        "--color-app-focus must exist as the single in-app gold seam, so the A/B call is one line"
    )
    assert "brand-gold" in tokens, "--color-brand-gold is the signature (insignia + marketing)"

    gold = tokens["brand-gold"].lower()
    # The nav-active row is the specific surface option C would have goldened. Keep it navy.
    assert tokens[CANVAS].lower() != gold and tokens[CARD].lower() != gold
    nav = tokens.get("app-nav-active", "")
    assert nav.lower() != gold, (
        "the active nav row must NOT be gold — that is the rejected option C; the mockup's active "
        "row is navy (#162137)"
    )
    # A gold FILL anywhere in app.* is forbidden regardless of the A/B call.
    for name, hexv in tokens.items():
        if name.startswith("app-") and name != "app-focus":
            assert hexv.lower() != gold, (
                f"--color-{name} is gold ({hexv}) — gold is not an app surface/accent. The only "
                "in-app gold seam is --color-app-focus (CR-40)."
            )


def test_design_system_documents_the_sampled_palette():
    """The canonical doc and the code must not drift — DESIGN-SYSTEM.md is the source of truth."""
    doc = DESIGN_SYSTEM.read_text()
    assert re.search(r"Depth", doc), "DESIGN-SYSTEM.md must document where the depth comes from"
    assert "Dashboard mockup.png" in doc, (
        "DESIGN-SYSTEM.md must name the mockup the app palette was sampled from"
    )
    tokens = theme_tokens()
    for plane in (CANVAS, PANEL, CARD, INSET, HEADER):
        assert tokens[plane].lower() in doc.lower(), (
            f"DESIGN-SYSTEM.md must carry the real hex for --color-{plane} ({tokens[plane]}) — the "
            "canonical table drifting from globals.css is how the inversion survived this long"
        )
