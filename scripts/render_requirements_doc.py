from __future__ import annotations

from pathlib import Path

import markdown


HTML_TEMPLATE = """<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>{title}</title>
  <style>
    :root {{
      --bg: #f6f8fb;
      --card: #ffffff;
      --text: #162130;
      --muted: #5c6b7a;
      --line: #d7e0ea;
      --accent: #12324a;
      --accent-2: #c9a84c;
      --code-bg: #0f1720;
      --code-text: #e6edf3;
    }}
    * {{ box-sizing: border-box; }}
    body {{
      margin: 0;
      font-family: "Segoe UI", Arial, sans-serif;
      background: linear-gradient(180deg, #eef3f8 0%, var(--bg) 100%);
      color: var(--text);
      line-height: 1.6;
    }}
    .shell {{
      max-width: 1180px;
      margin: 0 auto;
      padding: 32px 20px 64px;
    }}
    .doc {{
      background: var(--card);
      border: 1px solid var(--line);
      border-radius: 18px;
      padding: 40px 44px;
      box-shadow: 0 12px 40px rgba(16, 32, 48, 0.08);
    }}
    h1, h2, h3, h4 {{
      color: var(--accent);
      line-height: 1.25;
      margin-top: 1.5em;
    }}
    h1 {{
      margin-top: 0;
      font-size: 2rem;
      border-bottom: 3px solid var(--accent-2);
      padding-bottom: 10px;
    }}
    h2 {{
      font-size: 1.45rem;
      border-bottom: 1px solid var(--line);
      padding-bottom: 6px;
    }}
    h3 {{
      font-size: 1.15rem;
    }}
    p, li {{
      color: var(--text);
    }}
    ul, ol {{
      padding-left: 1.4rem;
    }}
    table {{
      width: 100%;
      border-collapse: collapse;
      margin: 16px 0 24px;
      font-size: 0.96rem;
    }}
    th, td {{
      border: 1px solid var(--line);
      padding: 10px 12px;
      vertical-align: top;
      text-align: left;
    }}
    th {{
      background: #eef4f8;
      color: var(--accent);
    }}
    code {{
      background: #eef4f8;
      color: var(--accent);
      padding: 0.15rem 0.35rem;
      border-radius: 6px;
      font-size: 0.92em;
    }}
    pre {{
      background: var(--code-bg);
      color: var(--code-text);
      padding: 16px;
      border-radius: 12px;
      overflow: auto;
    }}
    pre code {{
      background: transparent;
      color: inherit;
      padding: 0;
    }}
    hr {{
      border: none;
      border-top: 1px solid var(--line);
      margin: 28px 0;
    }}
    .mermaid-wrap {{
      margin: 18px 0 28px;
      padding: 18px;
      border: 1px solid var(--line);
      border-radius: 14px;
      background: #fbfcfe;
      overflow: auto;
    }}
    .meta {{
      color: var(--muted);
      margin-bottom: 24px;
    }}
    @media print {{
      body {{
        background: #fff;
      }}
      .shell {{
        max-width: none;
        padding: 0;
      }}
      .doc {{
        box-shadow: none;
        border: none;
        border-radius: 0;
        padding: 0;
      }}
    }}
  </style>
</head>
<body>
  <div class="shell">
    <div class="doc">
{body}
    </div>
  </div>
  <script type="module">
    import mermaid from 'https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs';

    mermaid.initialize({{
      startOnLoad: false,
      theme: 'default',
      securityLevel: 'loose',
      fontFamily: 'Segoe UI, Arial, sans-serif',
      flowchart: {{ useMaxWidth: false, htmlLabels: true }},
      sequence: {{ useMaxWidth: false }},
    }});

    const blocks = [...document.querySelectorAll('pre code.language-mermaid')];
    for (const block of blocks) {{
      const wrapper = document.createElement('div');
      wrapper.className = 'mermaid-wrap';
      const mermaidNode = document.createElement('div');
      mermaidNode.className = 'mermaid';
      mermaidNode.textContent = block.textContent;
      wrapper.appendChild(mermaidNode);
      const pre = block.closest('pre');
      pre.replaceWith(wrapper);
    }}

    await mermaid.run({{
      nodes: document.querySelectorAll('.mermaid')
    }});
  </script>
</body>
</html>
"""


def render_markdown(source: Path, target: Path) -> None:
    text = source.read_text(encoding="utf-8")
    body = markdown.markdown(
        text,
        extensions=[
            "tables",
            "fenced_code",
            "toc",
            "sane_lists",
            "attr_list",
        ],
    )
    html = HTML_TEMPLATE.format(title=source.stem.replace("_", " "), body=indent_html(body))
    target.write_text(html, encoding="utf-8")


def indent_html(text: str) -> str:
    return "\n".join(f"      {line}" if line else "" for line in text.splitlines())


def main() -> None:
    root = Path(__file__).resolve().parents[1]
    source = root / "SPECTRA_Software_Requirements_and_Design_Document.md"
    target = root / "SPECTRA_Software_Requirements_and_Design_Document.html"
    render_markdown(source, target)
    print(f"Rendered {target}")


if __name__ == "__main__":
    main()
