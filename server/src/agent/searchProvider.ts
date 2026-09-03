export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

export interface SearchProvider {
  search(query: string, maxResults?: number): Promise<SearchResult[]>;
}

function cleanHtml(s: string): string {
  return s
    .replace(/<[^>]*>/g, '')
    .replace(/&ensp;|&nbsp;/g, ' ')
    .replace(/&#\d+;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * 必应中国（cn.bing.com）联网检索：国内可达、无需 key。
 * 通过解析搜索结果 HTML（h2 标题 + b_lineclamp 摘要）提取标题/链接/摘要。
 */
export class BingProvider implements SearchProvider {
  async search(query: string, maxResults = 5): Promise<SearchResult[]> {
    try {
      const url = `https://cn.bing.com/search?q=${encodeURIComponent(query)}`;
      const res = await fetch(url, {
        signal: AbortSignal.timeout(8000),
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
        },
      });
      if (!res.ok) return [];
      const html = await res.text();
      const titles = [...html.matchAll(/<h2[^>]*><a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a><\/h2>/g)];
      const snippets = [...html.matchAll(/<p class="b_lineclamp[^"]*"[^>]*>([\s\S]*?)<\/p>/g)];
      const out: SearchResult[] = [];
      const n = Math.min(titles.length, snippets.length, maxResults);
      for (let i = 0; i < n; i++) {
        const title = cleanHtml(titles[i][2]);
        const snippet = cleanHtml(snippets[i][1]);
        if (title && snippet) out.push({ title, url: titles[i][1], snippet });
      }
      return out;
    } catch {
      return [];
    }
  }
}

/**
 * DuckDuckGo 检索（海外备选）：先 Instant Answer API，无结果退 HTML 端点。
 * 国内直连通常不可达，保留供海外部署使用。
 */
export class DuckDuckGoProvider implements SearchProvider {
  async search(query: string, maxResults = 5): Promise<SearchResult[]> {
    const results = await this.searchInstantAnswer(query);
    if (results.length) return results.slice(0, maxResults);
    const html = await this.searchHtml(query);
    return html.slice(0, maxResults);
  }

  private async searchInstantAnswer(query: string): Promise<SearchResult[]> {
    try {
      const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`;
      const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
      if (!res.ok) return [];
      const data = (await res.json()) as {
        AbstractText?: string;
        AbstractURL?: string;
        Heading?: string;
        RelatedTopics?: Array<{ Text?: string; FirstURL?: string }>;
      };
      const out: SearchResult[] = [];
      if (data.AbstractText) {
        out.push({ title: data.Heading || query, url: data.AbstractURL || '', snippet: data.AbstractText });
      }
      for (const t of data.RelatedTopics || []) {
        if (t?.Text) out.push({ title: query, url: t.FirstURL || '', snippet: t.Text });
      }
      return out.filter((r) => r.snippet);
    } catch {
      return [];
    }
  }

  private async searchHtml(query: string): Promise<SearchResult[]> {
    try {
      const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
      const res = await fetch(url, {
        signal: AbortSignal.timeout(8000),
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
      });
      if (!res.ok) return [];
      const html = await res.text();
      const out: SearchResult[] = [];
      const itemRe = /<a[^>]*class="result__a"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g;
      let m: RegExpExecArray | null;
      while ((m = itemRe.exec(html)) !== null) {
        const title = cleanHtml(m[2]);
        const snippet = cleanHtml(m[3]);
        if (title && snippet) out.push({ title, url: this.normalizeUrl(m[1]), snippet });
      }
      return out;
    } catch {
      return [];
    }
  }

  private normalizeUrl(u: string): string {
    if (u.startsWith('//')) return `https:${u}`;
    if (u.startsWith('/')) return `https://duckduckgo.com${u}`;
    return u;
  }
}
