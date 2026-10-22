#!/bin/sh
# Runs tests.html in headless Chrome and prints the results. Exits 1 if any test fails.
# The page reports each result to a throwaway local server, whose request log we read.
set -u
cd "$(dirname "$0")/.."

# sw.js lists every file, and each language's copies match the English files they come from.
python3 release.py --check || exit 1

CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
PORT=$((20000 + $(od -An -N2 -tu2 /dev/urandom | tr -d ' ') % 10000))
WORK=$(mktemp -d /tmp/bible-scroll-tests.XXXXXX)

python3 -m http.server "$PORT" --bind 127.0.0.1 2>"$WORK/server.log" >/dev/null &
SERVER=$!
"$CHROME" --headless=new --disable-gpu --no-first-run --user-data-dir="$WORK/profile" \
  "http://127.0.0.1:$PORT/tests.html" >/dev/null 2>&1 &
BROWSER=$!

# Wait up to 30s for the summary line.
i=0
while [ $i -lt 60 ] && ! grep -q '__test?DONE' "$WORK/server.log" 2>/dev/null; do
  sleep 0.5
  i=$((i + 1))
done
{ kill "$BROWSER" "$SERVER"; wait; } 2>/dev/null

grep -o '__test?[^ ]*' "$WORK/server.log" \
  | python3 -c 'import sys, urllib.parse; [print(urllib.parse.unquote(l.strip()[7:])) for l in sys.stdin]' \
  > "$WORK/results.txt"
cat "$WORK/results.txt"

if ! grep -q '^DONE' "$WORK/results.txt"; then echo 'Timed out before the tests finished.'; exit 1; fi
if grep -q '^FAIL' "$WORK/results.txt"; then exit 1; fi
