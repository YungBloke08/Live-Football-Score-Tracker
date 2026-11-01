# Bug Tracker

Bugs found during testing. Update this file whenever a bug is found or fixed; don't delete old entries.

## 1. Halftime shows 45'+ stoppage time instead of "HT"

- **Bug:** During halftime the match card kept showing the first-half clock (e.g. 45'+4') instead of "HT".
- **Cause:** The status text came from ESPN's `displayClock`, which stays frozen at the end of the first half during the break.
- **Fix:** Added `statusInfo()` in `popup.js`. It reads ESPN's status name (`STATUS_HALFTIME`) and short detail, and shows "HT" during the break. In play, it shows the live clock again (46', 47'...). Finished matches show "FT" (or AET / Pens after extra time or penalties). Score fetching and goal detection (`background.js`) were not changed.
- **Status:** Fixed. Checked against simulated ESPN statuses for first half, stoppage time, halftime, second half, full time and extra time. Not yet confirmed on a live match.
