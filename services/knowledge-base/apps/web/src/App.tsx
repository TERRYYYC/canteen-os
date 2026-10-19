import { useEffect, useRef, useState } from 'react';
import { errorMessage, request } from './api';
import { label } from './types';
import type { RecipeList, Summary } from './types';
import { date } from './Fields';
import { Editor } from './Editor';

const routeFromHash = () => decodeURIComponent(location.hash.slice(1));

export default function App() {
  const [route, setRoute] = useState(routeFromHash);
  const [refresh, setRefresh] = useState(0);
  const guard = useRef<(() => boolean) | null>(null);
  const previous = useRef(route);
  const [flash, setFlash] = useState('');
  useEffect(() => {
    function changed() {
      const next = routeFromHash();
      if (next === previous.current) return;
      if (guard.current && !guard.current()) { history.replaceState(null, '', `#${previous.current}`); return; }
      previous.current = next; setRoute(next); setFlash(''); window.scrollTo(0, 0);
    }
    window.addEventListener('hashchange', changed);
    return () => window.removeEventListener('hashchange', changed);
  }, []);
  function navigate(next: string) {
    if (next === route) return;
    if (guard.current && !guard.current()) return;
    guard.current = null; previous.current = next;
    history.pushState(null, '', next ? `#${next}` : location.pathname);
    setRoute(next); setFlash(''); window.scrollTo(0, 0);
  }
  return <div className="shell"><header className="topbar"><button className="brand" onClick={() => navigate('')}><span className="brand-mark">拾</span><span>拾味<span className="brand-sub">菜谱知识库</span></span></button><nav><button className={route ? 'quiet' : 'nav-active'} onClick={() => navigate('')}>我的菜谱</button><button className="primary compact" onClick={() => navigate('new')}>＋ 收藏菜谱</button></nav></header>
    <main>{flash && <p role="status" className="notice success">{flash}</p>}{route ? <Editor key={route} id={route === 'new' ? undefined : route} guard={guard} onBack={() => navigate('')} onSaved={(id, created) => {
      setRefresh(x => x + 1);
      if (created) { guard.current = null; previous.current = id; history.replaceState(null, '', `#${id}`); setRoute(id); setFlash('已收藏这款菜谱，可以继续补充。'); }
    }} onArchived={() => { guard.current = null; navigate(''); setFlash('菜谱已归档。'); setRefresh(x => x + 1); }} /> : <Library refresh={refresh} onOpen={navigate} />}</main>
    <footer>每一种做法，都值得留下。<span>同名菜谱也可以各自收藏。</span></footer>
  </div>;
}

function Library({ refresh, onOpen }: { refresh: number; onOpen: (id: string) => void }) {
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');
  const [tag, setTag] = useState('');
  const [items, setItems] = useState<Summary[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const generation = useRef(0);
  useEffect(() => { const timer = setTimeout(() => setSearch(query.trim()), 280); return () => clearTimeout(timer); }, [query]);
  const path = (after?: string) => `/recipes?${new URLSearchParams({ limit: '20', ...(search ? { q: search } : {}), ...(tag ? { tag } : {}), ...(after ? { cursor: after } : {}) })}`;
  useEffect(() => {
    const current = ++generation.current;
    const controller = new AbortController();
    setLoading(true); setError(''); setItems([]); setCursor(null);
    request<RecipeList>(`/recipes?${new URLSearchParams({ limit: '20', ...(search ? { q: search } : {}), ...(tag ? { tag } : {}) })}`, { signal: controller.signal })
      .then(result => { if (current === generation.current) { setItems(result.items); setCursor(result.nextCursor); } })
      .catch(e => { if (!controller.signal.aborted) setError(errorMessage(e)); })
      .finally(() => { if (current === generation.current) setLoading(false); });
    return () => { controller.abort(); generation.current++; };
  }, [search, tag, refresh, retry]);
  async function loadMore() {
    if (!cursor) return;
    const current = generation.current; setLoading(true); setError('');
    try { const result = await request<RecipeList>(path(cursor)); if (current === generation.current) { setItems(prev => [...prev, ...result.items.filter(item => !prev.some(p => p.id === item.id))]); setCursor(result.nextCursor); } }
    catch (e) { if (current === generation.current) setError(errorMessage(e)); }
    finally { if (current === generation.current) setLoading(false); }
  }
  return <><section className="library-heading"><div><p className="eyebrow">YOUR RECIPE COLLECTION</p><h1>把喜欢的做法，<br />慢慢收集起来。</h1><p className="muted">一款红烧肉，也可以有很多种答案。先记下菜名，再补全故事。</p></div><div className="heading-note"><span>从一道菜开始</span><strong>菜名 · 食材 · 做法<br />图片 · 视频 · 来源</strong></div></section>
    <section aria-label="菜谱库"><div className="library-toolbar"><h2>我的菜谱</h2><label className="search"><span className="sr-only">搜索菜名或食材</span><span aria-hidden="true">⌕</span><input value={query} onChange={e => setQuery(e.target.value)} placeholder="搜索菜名或食材…" /></label></div>
      {tag && <div className="filter-banner">标签：{tag}<button className="quiet" onClick={() => setTag('')}>清除筛选 ×</button></div>}
      {error && <div className="notice error" role="alert">{error}<button onClick={() => { if (cursor) void loadMore(); else setRetry(n => n + 1); }}>重试</button></div>}
      {!loading && !error && items.length === 0 && <div className="empty"><div className="empty-mark">＋</div><h3>{search || tag ? '还没有找到这道菜' : '你的第一道菜，会是什么？'}</h3><p>{search || tag ? '试试其他菜名或食材，或收藏一款新的做法。' : '只填写菜名就能收藏，配料和做法以后慢慢补充。'}</p><button className="primary" onClick={() => onOpen('new')}>收藏第一款菜谱</button></div>}
      <div className="recipe-grid">{items.map((item, index) => <article key={item.id} className="recipe-card"><button className="card-main" onClick={() => onOpen(item.id)}><span className="card-index">{String(index + 1).padStart(2, '0')}</span><h3>{label(item.title)}</h3><p>{label(item.description) || '还没有补充描述，等待下一次灵感。'}</p><span className="card-date">{date(item.updatedAt)} · 第 {item.version} 版</span></button><div className="tags">{item.tags?.map(t => <button key={t} className="tag" onClick={() => setTag(t)}>{t}</button>)}</div></article>)}</div>
      {loading && <p className="loading" role="status">正在翻开菜谱…</p>}{cursor && !loading && <div className="load-more"><button onClick={() => void loadMore()}>加载更多</button></div>}
    </section></>;
}
