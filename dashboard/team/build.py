from pathlib import Path
import json
import re
import sys

source = Path(__file__).resolve().parent.parent
netlify = sys.argv[1] == "--netlify"
out = Path(sys.argv[2] if netlify else sys.argv[1]).resolve()
out.mkdir(parents=True, exist_ok=True)
mime = {'html': 'text/html; charset=utf-8', 'js': 'text/javascript; charset=utf-8', 'css': 'text/css; charset=utf-8'}
assets = {}
web_files = (
    'index.html', 'styles.css', 'app.js', 'report-data.js',
    'monthly-report.html', 'monthly-report.js',
    'content/index.html', 'content/styles.css', 'content/app.js',
)
for name in web_files:
    relative = Path(name)
    path = source / relative
    kind = path.suffix[1:]
    body = path.read_text()
    if kind == 'html':
        scripts = re.findall(r'<script(?: defer)? src="([^"]+)"></script>', body)
        assert scripts
        body = re.sub(r'<script(?: defer)? src="[^"]+"></script>', '', body)
        body = body.replace('</head>', '<link rel="stylesheet" href="/team.css">\n</head>')
        body = body.replace('<body>', '<body class="team-loading">')
        body = body.replace('</body>', '<div id="team-storage-status" role="status"></div>\n'
            '<script id="team-loader" src="/team.js" data-scripts="' + ' '.join(scripts) + '"></script>\n</body>')
    assets['/' + relative.as_posix()] = [mime[kind], body]
assets['/team.css'] = [mime['css'], (source/'team/shared.css').read_text()]
assets['/team.js'] = [mime['js'], (source/'team/client.js').read_text()]
if netlify:
    for asset, (_, body) in assets.items():
        path = out / asset.lstrip('/')
        path.parent.mkdir(parents=True, exist_ok=True)
        if asset.endswith('.html'):
            body = re.sub(
                r'href="/signout-with-chatgpt" target="_top"\s*>로그아웃\s*',
                'href="/login.html" data-team-session target="_top">관리자 로그인',
                body,
            )
            body = body.replace('<html lang="ko">', '<html lang="ko" data-auth="netlify">')
        path.write_text(body)
    for name in ('login.html', 'login.js'):
        (out / name).write_bytes((source / 'netlify' / name).read_bytes())
else:
    worker = (source/'team/worker.mjs').read_text().splitlines(keepends=True)
    assert worker[0].startswith('import { assets }')
    assert worker[2].startswith('import { headers, json, workspace }')
    workspace = (source/'team/workspace.mjs').read_text()
    (out/'index.js').write_text('const assets = ' + json.dumps(assets, ensure_ascii=False) + ';\n' + workspace + ''.join(worker[3:]))
