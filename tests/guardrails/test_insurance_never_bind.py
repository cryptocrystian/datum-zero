"""
Guardrail — insurance is VERIFY-only, we NEVER bind or collect (CR-03/10).

We verify proof of coverage against the client's requirement profile and refer on-demand coverage
(M2-4b); we never bind a policy, collect a premium, or resell insurance. Pilot.stripeConnectId is
payout-only (never an insurance premium). These tests assert there is NO such code path.

Run: pytest tests/guardrails -q
"""
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
WEB = ROOT / "apps/web"
INSURANCE = WEB / "lib/insurance"

# Insurance-brokerage identifiers that must not exist ANYWHERE in the app (code identifiers, not prose —
# so a comment like "never collect a premium" does not trip this).
BROKERAGE = re.compile(
    r"\b(bindPolicy|purchasePolicy|bindCoverage|collectPremium|chargePremium|premiumAmount|premiumCents|sellPolicy|resellInsurance)\b"
)
# Payment-processor identifiers that must not appear in the INSURANCE modules at all (verify only).
PAYMENTS = re.compile(r"\b(createCharge|paymentIntent|createPaymentIntent|createSubscription)\b|\bstripe\b", re.I)
# A charge/premium/bind IDENTIFIER (not prose) sharing a file with stripeConnectId => not payout-only.
STRIPE_MISUSE = re.compile(
    r"\b(createCharge|chargePremium|collectPremium|premiumAmount|premiumCents|bindPolicy|paymentIntent|createSubscription)\b"
)


def _src_files(root: Path):
    for f in list(root.rglob("*.ts")) + list(root.rglob("*.tsx")):
        if "node_modules" in f.parts or ".next" in f.parts:
            continue
        yield f


def test_no_insurance_brokerage_path_anywhere():
    offenders = []
    for f in _src_files(WEB):
        for m in BROKERAGE.finditer(f.read_text(errors="ignore")):
            offenders.append(f"{f.relative_to(ROOT)}: {m.group(0)}")
    assert not offenders, "insurance is verify-only — no bind/collect/resell path allowed (CR-03):\n" + "\n".join(offenders)


def test_insurance_modules_never_touch_payments():
    assert INSURANCE.exists(), "lib/insurance is missing"
    offenders = []
    for f in _src_files(INSURANCE):
        for m in PAYMENTS.finditer(f.read_text(errors="ignore")):
            offenders.append(f"{f.relative_to(ROOT)}: {m.group(0)}")
    assert not offenders, "insurance modules must never process payments (verify only, CR-03):\n" + "\n".join(offenders)


def test_stripe_connect_is_payout_only():
    """Wherever Pilot.stripeConnectId is referenced, no charge/premium/bind verb may share the file."""
    offenders = []
    for f in _src_files(WEB):
        text = f.read_text(errors="ignore")
        if "stripeConnectId" in text and STRIPE_MISUSE.search(text):
            offenders.append(str(f.relative_to(ROOT)))
    assert not offenders, "Pilot.stripeConnectId must be payout-only — never an insurance premium (CR-03):\n" + "\n".join(offenders)
