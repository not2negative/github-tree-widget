const USER_RE = /^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,37}[a-zA-Z0-9])?$/;
const REPO_RE = /^[a-zA-Z0-9._-]{1,100}$/;

const params = new URLSearchParams(window.location.search);
let USER = params.get("user") || "not2negative";
let REPO = params.get("repo") || "cybersecurity-writeups";
let BRANCH = params.get("branch") || "main";

const ZOOM_STEPS = [0.85, 1.0, 1.2];
let zoomIdx = 1;
let panX = 0;
let panY = 0;
let isDragging = false;
let startX = 0;
let startY = 0;

const viewport = document.getElementById("viewport");
const canvas = document.getElementById("canvas");
const container = document.getElementById("tree-container");
const zoomInBtn = document.getElementById("zoom-in");
const zoomOutBtn = document.getElementById("zoom-out");
const zoomLabel = document.getElementById("zoom-label");
const mdOutput = document.getElementById("markdown-output");

function applyTransform() {
  const scale = ZOOM_STEPS[zoomIdx];
  canvas.style.transform = `translate(${panX}px, ${panY}px) scale(${scale})`;
  zoomLabel.textContent = `${Math.round(scale * 100)}%`;
  zoomOutBtn.disabled = zoomIdx === 0;
  zoomInBtn.disabled = zoomIdx === ZOOM_STEPS.length - 1;
}

zoomInBtn.addEventListener("click", () => {
  if (zoomIdx < ZOOM_STEPS.length - 1) {
    zoomIdx++;
    applyTransform();
  }
});

zoomOutBtn.addEventListener("click", () => {
  if (zoomIdx > 0) {
    zoomIdx--;
    applyTransform();
  }
});

document.getElementById("reset-view").addEventListener("click", () => {
  zoomIdx = 1;
  panX = 0;
  panY = 0;
  applyTransform();
});

viewport.addEventListener("mousedown", (e) => {
  if (e.target.tagName === "A") return;
  isDragging = true;
  canvas.classList.add("dragging");
  startX = e.clientX - panX;
  startY = e.clientY - panY;
});

window.addEventListener("mousemove", (e) => {
  if (!isDragging) return;
  panX = Math.max(-220, Math.min(220, e.clientX - startX));
  panY = Math.max(-180, Math.min(180, e.clientY - startY));
  applyTransform();
});

window.addEventListener("mouseup", () => {
  isDragging = false;
  canvas.classList.remove("dragging");
});

document.getElementById("toggle-builder").addEventListener("click", () => {
  document.getElementById("builder-panel").classList.toggle("hidden");
});

document.getElementById("copy-md").addEventListener("click", async () => {
  await navigator.clipboard.writeText(mdOutput.value);
  const btn = document.getElementById("copy-md");
  btn.textContent = "Copied!";
  setTimeout(() => (btn.textContent = "Copy Markdown"), 1800);
});

document.getElementById("repo-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const u = document.getElementById("input-user").value.trim();
  const r = document.getElementById("input-repo").value.trim();
  const b = document.getElementById("input-branch").value.trim() || "main";

  if (!USER_RE.test(u) || !REPO_RE.test(r) || !REPO_RE.test(b)) {
    alert("Invalid username, repository, or branch format.");
    return;
  }

  USER = u;
  REPO = r;
  BRANCH = b;
  const nextUrl = `${window.location.pathname}?user=${encodeURIComponent(USER)}&repo=${encodeURIComponent(REPO)}&branch=${encodeURIComponent(BRANCH)}`;
  window.history.replaceState({}, "", nextUrl);
  loadRepo();
});

function updateSnippet() {
  const origin = window.location.origin;
  const qs = `user=${encodeURIComponent(USER)}&repo=${encodeURIComponent(REPO)}&branch=${encodeURIComponent(BRANCH)}`;
  mdOutput.value = `[![Repository Map](${origin}/api/svg?${qs})](${origin}/?${qs})`;
}

function encodePath(path) {
  return path.split("/").map(encodeURIComponent).join("/");
}

function buildHierarchy(treeItems, ignoreList) {
  const root = { name: REPO, path: "", type: "tree", children: [] };
  const map = { "": root };

  const filtered = treeItems.slice(0, 200).filter((item) => {
    const baseName = item.path.split("/").pop();
    return !ignoreList.includes(item.path) && !ignoreList.includes(baseName);
  });

  filtered.sort((a, b) => {
    if (a.type !== b.type) return a.type === "tree" ? -1 : 1;
    return a.path.localeCompare(b.path);
  });

  for (const item of filtered) {
    const parts = item.path.split("/");
    const name = parts.pop();
    const parentPath = parts.join("/");
    const node = { name, path: item.path, type: item.type, children: [] };
    map[item.path] = node;
    if (map[parentPath]) {
      map[parentPath].children.push(node);
    }
  }
  return root;
}

function renderNode(node, metaItems, prefix = "", isLast = true, isRoot = true) {
  const row = document.createElement("div");
  row.className = "tree-row";

  const left = document.createElement("div");
  left.className = "tree-left";

  const branchSpan = document.createElement("span");
  branchSpan.className = "branch";
  branchSpan.textContent = isRoot ? "" : prefix + (isLast ? "└── " : "├── ");

  const custom = metaItems[node.path] || {};
  const iconSpan = document.createElement("span");
  iconSpan.className = "icon";
  iconSpan.textContent = String(custom.icon || (node.type === "tree" ? "📁" : "📄")).slice(0, 4);

  const link = document.createElement("a");
  link.className = `node-link ${node.type === "tree" ? "folder" : ""}`;
  link.target = "_blank";
  link.rel = "noopener";
  link.textContent = node.type === "tree" ? `${node.name}/` : node.name;
  link.href = isRoot
    ? `https://github.com/${USER}/${REPO}`
    : `https://github.com/${USER}/${REPO}/${node.type === "tree" ? "tree" : "blob"}/${BRANCH}/${encodePath(node.path)}`;

  left.append(branchSpan, iconSpan, link);
  row.appendChild(left);

  if (custom.description) {
    const desc = document.createElement("span");
    desc.className = "node-desc";
    desc.textContent = `# ${String(custom.description).slice(0, 80)}`;
    row.appendChild(desc);
  }

  container.appendChild(row);

  const nextPrefix = isRoot ? "" : prefix + (isLast ? "    " : "│   ");
  node.children.forEach((child, index) => {
    renderNode(child, metaItems, nextPrefix, index === node.children.length - 1, false);
  });
}

async function loadRepo() {
  if (!USER_RE.test(USER) || !REPO_RE.test(REPO) || !REPO_RE.test(BRANCH) || REPO === ".." || BRANCH === "..") {
    container.textContent = "Invalid repository parameters.";
    return;
  }

  document.getElementById("input-user").value = USER;
  document.getElementById("input-repo").value = REPO;
  document.getElementById("input-branch").value = BRANCH;
  updateSnippet();

  const repoLink = document.getElementById("repo-link");
  repoLink.textContent = `${USER} / ${REPO}`;
  repoLink.href = `https://github.com/${USER}/${REPO}`;

  try {
    const [treeRes, metaRes] = await Promise.all([
      fetch(`https://api.github.com/repos/${USER}/${REPO}/git/trees/${BRANCH}?recursive=1`),
      fetch(`https://raw.githubusercontent.com/${USER}/${REPO}/${BRANCH}/.repomap.json`)
    ]);

    if (!treeRes.ok) throw new Error("Repository not found or API rate limit exceeded");
    const treeData = await treeRes.json();
    const meta = metaRes.ok ? await metaRes.json() : { ignore: [".repomap.json", ".gitkeep"], items: {} };

    const root = buildHierarchy(treeData.tree || [], meta.ignore || [".repomap.json", ".gitkeep"]);
    container.innerHTML = "";
    renderNode(root, meta.items || {});
    document.getElementById("stats").textContent = `${(treeData.tree || []).length} items`;
    zoomIdx = 1;
    panX = 0;
    panY = 0;
    applyTransform();
  } catch (err) {
    container.textContent = `Error: ${err.message}`;
  }
}

loadRepo();