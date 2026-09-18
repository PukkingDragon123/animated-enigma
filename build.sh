#!/bin/sh
# Regenerate the single-file build (play.html) from index.html + style.css + src/*.js
python3 - <<'PY'
import re
html = open('index.html').read()
scripts = re.findall(r'<script src="([^"]+)"></script>', html)
css = open('style.css').read()
js = '\n'.join('/* ===== %s ===== */\n%s' % (s, open(s).read()) for s in scripts)
open('play.html','w').write("""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>MANATEE VS BOATS</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
%s
</style>
</head>
<body>
<div id="wrap">
  <canvas id="screen" width="640" height="360"></canvas>
</div>
<script>
%s
</script>
</body>
</html>
""" % (css, js))
print('play.html rebuilt from', len(scripts), 'scripts')
PY
