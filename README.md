# token-radar-anchorband

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/Gobpox/token-radar-anchorband/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/Gobpox/token-radar-anchorband/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

AnchorBand is a token launch radar that prices protocols which record no
token yet by the protocols already trading. The snapshot's traded protocols
(the anchors, one per ticker, exchanges excluded) say what a dollar of TVL
is worth: AnchorBand fits that price per category from the anchors' own
market-cap/TVL multiples — median in log space, shrunk toward the global
median, tilted by a size slope fitted on the anchors — then carries it to
every pre-token protocol, adjusting for seven-day growth, survival time and
chain breadth. Each of the 198 ranked rows carries an uncertainty band taken
from the anchors' residual interquartile range, a FARM / WATCH / THIN verdict,
and a seven-step farm plan whose capital, gas and hold all derive from the
protocol's own record. A leave-one-out test the program runs on itself prices
every anchor blind and prints the fitted price's median error next to a flat
0.25x rule's, on the dashboard's Method view. All 758 protocols in the
snapshot are accounted for: ranked, anchoring the fit, or set aside for a
stated reason. The dashboard is sortable and filterable (search, category,
chain, verdict), with a detail view per protocol showing every tilt that
made its price. It runs offline; the same program re-derives everything from
whatever snapshot it is given.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input ../input/snapshot.json
# writes out/board.json, out/data.js, out/dashboard/, out/screenshots/ and out/dossier.json
```

---

<sub>Entered on [make.fun](https://make.fun/?ref=ab6123w1&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
