from http.server import BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs
from urllib.request import urlopen, Request
import json
import html
import os
import re

USER_RE = re.compile(r"^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,37}[a-zA-Z0-9])?$")
REPO_RE = re.compile(r"^[a-zA-Z0-9._-]{1,100}$")
MAX_ROWS = 60

def fetch_json(url, max_bytes=524288):
    headers = {"User-Agent": "RepoMap-Widget"}
    token = os.environ.get("GITHUB_TOKEN")
    if token and "api.github.com" in url:
        headers["Authorization"] = f"Bearer {token}"
    req = Request(url, headers=headers)
    with urlopen(req, timeout=8) as res:
        raw = res.read(max_bytes + 1)
        if len(raw) > max_bytes:
            raise ValueError("Response exceeds maximum allowed size")
        return json.loads(raw.decode("utf-8"))

class handler(BaseHTTPRequestHandler):
    def send_svg_error(self, message, status=400):
        safe_msg = html.escape(message)
        svg = f'''<svg xmlns="http://www.w3.org/2000/svg" width="520" height="60" viewBox="0 0 520 60">
  <rect width="520" height="60" rx="8" fill="#0d1117" stroke="#f85149" stroke-width="1"/>
  <text x="20" y="35" fill="#f85149" font-family="monospace" font-size="13">Error: {safe_msg}</text>
</svg>'''
        self.send_response(status)
        self.send_header("Content-Type", "image/svg+xml; charset=utf-8")
        self.send_header("Content-Security-Policy", "default-src 'none'; sandbox")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.end_headers()
        self.wfile.write(svg.encode("utf-8"))

    def do_GET(self):
        query = parse_qs(urlparse(self.path).query)
        user = query.get("user", ["not2negative"])[0]
        repo = query.get("repo", ["cybersecurity-writeups"])[0]
        branch = query.get("branch", ["main"])[0]

        if not USER_RE.match(user) or not REPO_RE.match(repo) or not REPO_RE.match(branch):
            return self.send_svg_error("Invalid parameters (user, repo, or branch)")
        if repo in (".", "..") or branch in (".", ".."):
            return self.send_svg_error("Path not allowed")

        try:
            tree_data = fetch_json(
                f"https://api.github.com/repos/{user}/{repo}/git/trees/{branch}?recursive=1",
                max_bytes=524288
            )
            try:
                meta = fetch_json(
                    f"https://raw.githubusercontent.com/{user}/{repo}/{branch}/.repomap.json",
                    max_bytes=65536
                )
            except Exception:
                meta = {"ignore": [".repomap.json", ".gitkeep"], "items": {}}

            ignore = set(meta.get("ignore", [".repomap.json", ".gitkeep"]))
            items_meta = meta.get("items", {}) if isinstance(meta.get("items"), dict) else {}

            root = {"name": repo, "path": "", "type": "tree", "children": []}
            nodes = {"": root}

            filtered = [
                x for x in tree_data.get("tree", [])
                if x.get("path") not in ignore and x.get("path", "").split("/")[-1] not in ignore
            ]
            filtered.sort(key=lambda x: (0 if x.get("type") == "tree" else 1, x.get("path", "")))

            for item in filtered:
                parts = item["path"].split("/")
                name = parts.pop()
                parent = "/".join(parts)
                node = {"name": name, "path": item["path"], "type": item["type"], "children": []}
                nodes[item["path"]] = node
                if parent in nodes:
                    nodes[parent]["children"].append(node)

            rows = []
            def walk(node, prefix="", is_last=True, is_root=True):
                if len(rows) >= MAX_ROWS:
                    return
                branch_str = "" if is_root else prefix + ("└── " if is_last else "├── ")
                custom = items_meta.get(node["path"], {})
                if not isinstance(custom, dict):
                    custom = {}
                icon = str(custom.get("icon", "📁" if node["type"] == "tree" else "📄"))[:4]
                label = f"{node['name']}/" if node["type"] == "tree" else node["name"]
                raw_desc = str(custom.get("description", ""))[:75]
                desc = f"# {raw_desc}" if raw_desc else ""
                rows.append((branch_str, icon, label, node["type"] == "tree", desc))
                next_prefix = "" if is_root else prefix + ("    " if is_last else "│   ")
                for idx, child in enumerate(node["children"]):
                    walk(child, next_prefix, idx == len(node["children"]) - 1, False)

            walk(root)

            if len(filtered) + 1 > MAX_ROWS:
                rows.append(("└── ", "⋯", f"... (+{len(filtered) + 1 - MAX_ROWS} items)", False, ""))

            line_height = 26
            height = max(120, len(rows) * line_height + 44)
            svg_lines = []
            for i, (b_str, icon, label, is_dir, desc) in enumerate(rows):
                y = 36 + i * line_height
                color = "#79c0ff" if is_dir else "#58a6ff"
                weight = "bold" if is_dir else "normal"
                left_text = (
                    f'<tspan fill="#7d8590">{html.escape(b_str)}</tspan>'
                    f'{html.escape(icon)} '
                    f'<tspan fill="{color}" font-weight="{weight}">{html.escape(label)}</tspan>'
                )
                desc_svg = (
                    f'<text x="430" y="{y}" fill="#7d8590" font-size="13">{html.escape(desc)}</text>'
                    if desc else ""
                )
                svg_lines.append(f'<text x="24" y="{y}" font-size="14">{left_text}</text>{desc_svg}')

            svg = f'''<svg xmlns="http://www.w3.org/2000/svg" width="840" height="{height}" viewBox="0 0 840 {height}">
  <rect width="840" height="{height}" rx="8" fill="#0d1117" stroke="#30363d" stroke-width="1"/>
  <g font-family="ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace">
    {"".join(svg_lines)}
  </g>
</svg>'''
            self.send_response(200)
            self.send_header("Content-Type", "image/svg+xml; charset=utf-8")
            self.send_header("Content-Security-Policy", "default-src 'none'; sandbox")
            self.send_header("X-Content-Type-Options", "nosniff")
            self.send_header("Cache-Control", "public, s-maxage=600, stale-while-revalidate=300")
            self.end_headers()
            self.wfile.write(svg.encode("utf-8"))
        except Exception as e:
            self.send_svg_error(str(e), status=502)