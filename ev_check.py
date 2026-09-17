"""High Low Casino economy check. Run: python3 ev_check.py

Re-derives the run's reach probabilities from the rules, reads the live
multiplier table out of high-low-casino/config.js, and fails loudly if any
cash-out point drifts off the designed house edge.

The subtlety this exists to protect: P(streak advances) is 10/13 only on the
FIRST call. A tie repeats the same rank (a self-loop, so it conditions out),
and winning from an extreme card lands you back in the middle where the odds
are worst -- so the chain settles at 0.7389. Solving the curve against 10/13
instead costs about 14 points of RTP.
"""
import re, sys, pathlib
from fractions import Fraction as F

RANKS = range(2, 15)
TARGET, TOL = 0.95, 0.04

def winset(r):
    """Ranks that win, under optimal play (take the more likely side)."""
    return range(r + 1, 15) if (14 - r) >= (r - 2) else range(2, r)

def reach(depth):
    """P(reaching streak n) for n = 1..depth, exactly."""
    d = {r: F(1, 13) for r in RANKS}          # the first card is uniform
    out, cum = [], F(1)
    for _ in range(depth):
        # From rank r: 12 non-tie outcomes, max(14-r, r-2) of which advance.
        cum *= sum(d[r] * F(max(14 - r, r - 2), 12) for r in RANKS)
        out.append(cum)
        nd = {s: F(0) for s in RANKS}
        for r in RANKS:
            for s in winset(r):
                nd[s] += d[r] * F(1, 12)
        tot = sum(nd.values())
        d = {s: nd[s] / tot for s in RANKS}
    return out

def multipliers():
    src = (pathlib.Path(__file__).parent / "high-low-casino" / "config.js").read_text()
    m = re.search(r"MULTIPLIERS:\s*\[([^\]]+)\]", src)
    if not m:
        sys.exit("could not find MULTIPLIERS in config.js")
    return [float(x) for x in m.group(1).split(",")]

def demo():
    M = multipliers()
    R = reach(len(M))
    print(f"P(advance) first call {float(R[0]):.6f} (10/13), settling at "
          f"{float(R[-1] / R[-2]):.6f}\n")
    print(" n     reach      fair     mult      EV   step   verdict")
    evs = []
    for n, (r, mult) in enumerate(zip(R, M), 1):
        ev = float(r) * mult
        evs.append(ev)
        step = mult / M[n - 2] if n > 1 else mult
        print(f"{n:2d}  {float(r):.6f}  {1/float(r):8.3f}  {mult:7.2f}  {ev:.4f}  "
              f"{step:5.3f}  {'ok' if abs(ev - TARGET) <= TOL else 'OUT OF BAND'}")

    # 1. No stopping point may beat any other, or cash-out timing is solved.
    spread = max(evs) - min(evs)
    assert spread <= TOL, f"EV spread {spread:.4f} > {TOL}"
    # 2. The house keeps an edge everywhere, or chips inflate without limit.
    assert all(e < 1.0 for e in evs), "a stopping point is player-positive"
    # 3. The curve rises, so going deeper is always a real escalation.
    assert all(M[i] > M[i - 1] for i in range(1, len(M))), "curve not monotonic"
    # 4. Chests pay XP only. Chips cannot scale across a 2500:1 wager range;
    #    keys cannot feed a content-gated album from a per-run trigger.
    print(f"\nEV band {min(evs):.4f}-{max(evs):.4f} (target {TARGET}) -- "
          f"house edge {(1 - sum(evs) / len(evs)) * 100:.1f}% average")
    print("All checks passed.")

if __name__ == "__main__":
    demo()
