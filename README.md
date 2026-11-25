# GitHub Tree Widget

A lightweight, interactive repository tree viewer and dynamic SVG generator for GitHub repositories.

Live instance: [github-tree-widget.vercel.app](https://github-tree-widget.vercel.app/?user=not2negative&repo=cybersecurity-writeups)

## Features

- **Automatic Tree Generation:** Fetches repository structure in real time using the GitHub REST API.
- **Dynamic SVG Card:** Generates an embeddable SVG image (`/api/svg`) compatible with GitHub `README.md` files.
- **Interactive Explorer:** Web viewer with drag-to-pan, bounded zoom levels, and direct links to folders and files.
- **Zero-Database Customization:** Supports optional per-repository descriptions and ignored paths via a `.repomap.json` file.

## Usage

### 1. Embed in a GitHub README

Add the following Markdown snippet to your `README.md`, replacing `<username>` and `<repository>` with your GitHub details:

```markdown
[![Repository Map](https://github-tree-widget.vercel.app/api/svg?user=<username>&repo=<repository>)](https://github-tree-widget.vercel.app/?user=<username>&repo=<repository>)
```

Optional query parameter: `&branch=<branch_name>` (defaults to `main`).

### 2. Embed as an Interactive Frame (GitHub Pages / Websites)

To embed the interactive viewer with zoom and pan controls into an HTML page:

```html
<iframe
  src="https://github-tree-widget.vercel.app/?user=<username>&repo=<repository>"
  width="100%"
  height="460"
  frameborder="0"
  title="Repository Map">
</iframe>
```

## Customization (`.repomap.json`)

To hide specific files or add inline descriptions to nodes, create a `.repomap.json` file in the root of your target repository:

```json
{
  "ignore": [".repomap.json", ".gitkeep", ".gitignore", "docs"],
  "items": {
    "src": {
      "description": "Source code"
    },
    "README.md": {
      "description": "Project documentation"
    }
  }
}
```

Because only repository maintainers can push changes to `.repomap.json`, descriptions remain read-only for visitors.

## Self-Hosting on Vercel

1. Fork or clone this repository.
2. Import the project into [Vercel](https://vercel.com) and deploy.
3. *(Optional)* Add a read-only `GITHUB_TOKEN` environment variable in your Vercel project settings to increase the GitHub API rate limit from 60 to 5,000 requests per hour.