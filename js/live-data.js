/* Public project metrics and dated Scholar snapshots, with daily browser caches. */
(() => {
  'use strict';
  const integer = value => Number.isSafeInteger(value) && value >= 0;
  const dayFormat = new Intl.DateTimeFormat('en',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'});
  const calendarDay = (time=Date.now()) => {
    const parts=dayFormat.formatToParts(time);
    return ['year','month','day'].map(type => parts.find(part => part.type===type).value).join('-');
  };
  const today = () => calendarDay();
  const dateIsValid = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
  const formatMetric = value => Intl.NumberFormat('en-US', value < 1_000_000 ? {} : {notation:'compact', maximumFractionDigits:1}).format(value);
  const snapshotsFrom = (rows, through=today()) => Array.isArray(rows) ? rows.filter(row =>
    row && dateIsValid(row.d) && row.d <= through && integer(row.total) && integer(row.h)
  ).map(row => ({d:row.d, total:row.total, h:row.h})).sort((a,b) => a.d.localeCompare(b.d)) : [];
  function recordedPoints(rows=[]) {
    const valid=Array.isArray(rows) ? rows.filter(row =>
      Array.isArray(row) && dateIsValid(row[0]) && row[0]<=today() && integer(row[1])
    ).map(([date,value])=>[date,value]) : [];
    return [...new Map(valid)].sort((a,b)=>a[0].localeCompare(b[0]))
      .map(([date,value])=>({date,value,kind:'snapshot'}));
  }
  function seriesWithHistory(history=[],snapshots=[],kind='history') {
    const recorded=recordedPoints(snapshots),first=recorded[0]?.date;
    const earlier=recordedPoints(history).filter(point=>!first || point.date<first)
      .map(point=>({...point,kind}));
    return [...earlier,...recorded];
  }
  function mergeScholar(points, baseline, snapshots=[], hindexPoints=[]) {
    const saved=rows=>recordedPoints(rows.filter(p=>p?.kind==='snapshot').map(p=>[p.date,p.value]));
    const recorded = new Map(saved(points).map(p => [p.date, p.value]));
    const hRecorded = new Map(saved(hindexPoints).map(p => [p.date,p.value]));
    let latest = {...baseline};
    for (const row of snapshotsFrom(snapshots)) {
      recorded.set(row.d, row.total);
      hRecorded.set(row.d, row.h);
      // An older upstream feed must never replace a newer, verified local snapshot.
      if (row.d > latest.date) latest = {date:row.d, total:row.total, h:row.h};
    }
    recorded.set(baseline.date, baseline.total);
    hRecorded.set(baseline.date, baseline.h);
    const data=seriesWithHistory(points.filter(p=>p.kind==='history').map(p=>[p.date,p.value]),[...recorded]);
    const hindex=seriesWithHistory(hindexPoints.filter(p=>p.kind==='partial').map(p=>[p.date,p.value]),[...hRecorded],'partial');
    return {data, latest, hindex};
  }
  function metricFrom(provider, payload, date=today()) {
    if (!payload || !dateIsValid(date)) return null;
    if (provider === 'github' && integer(payload.stargazers_count)) return {stars:payload.stargazers_count,date};
    // downloads is a recent window; only downloadsAllTime matches the site's total label.
    if (provider === 'huggingface' && integer(payload.downloadsAllTime)) {
      return {downloads:payload.downloadsAllTime,date};
    }
    return null;
  }
  const modelId = value => typeof value==='string' && /^[\w.-]+\/[\w.-]+$/.test(value);
  const modelVariants = base => [base,base+'-FP8',base+'-BF16'];
  function modelSeriesFrom(payload,bases,date=today(),requiredMembers=[]) {
    if (!Array.isArray(payload) || !dateIsValid(date) || !Array.isArray(bases) || !bases.length ||
      !bases.every(modelId) || new Set(bases).size!==bases.length || !Array.isArray(requiredMembers)) return null;
    const allowed=new Set(bases.flatMap(modelVariants)),members={};
    for (const row of payload) {
      if (!row || !allowed.has(row.id)) continue;
      // Never substitute recent downloads, or count a repository twice across API pages.
      if (!integer(row.downloadsAllTime)) return null;
      if (Object.hasOwn(members,row.id) && members[row.id]!==row.downloadsAllTime) return null;
      members[row.id]=row.downloadsAllTime;
    }
    if (![...bases,...requiredMembers].every(id => allowed.has(id) && Object.hasOwn(members,id))) return null;
    const downloads=Object.values(members).reduce((total,value) => total+value,0);
    return integer(downloads) ? {scope:'series',downloads,date,bases:[...bases],members} : null;
  }
  function metricDescription(provider, metric, en=false) {
    const exact=value => value.toLocaleString('en-US');
    if (provider==='huggingface' && metric.scope==='series') {
      const label=metric.bases[0].split('/')[1];
      const scope=en ? `${label} series · ${exact(metric.downloads)} all-time downloads` : `${label} 系列 · ${exact(metric.downloads)} 历史累计下载`;
      const breakdown=metric.bases.map(base => `${base.split('/')[1]}: ${exact(modelVariants(base).reduce((total,id) => total+(metric.members[id] || 0),0))}`);
      return [`Hugging Face · ${scope} · ${en ? 'as of' : '截至'} ${metric.date}`,
        en ? 'Official model repositories, including FP8 / BF16 variants.' : '统计官方模型仓库，包含 FP8 / BF16 版本。',...breakdown].join('\n');
    }
    return provider === 'github'
      ? `GitHub · ${exact(metric.stars)} stars · ${en ? 'as of' : '截至'} ${metric.date}`
      : `Hugging Face · ${exact(metric.downloads)} ${en ? 'total downloads' : '累计下载'} · ${en ? 'as of' : '截至'} ${metric.date}`;
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = {snapshotsFrom,recordedPoints,seriesWithHistory,mergeScholar,metricFrom,modelSeriesFrom,metricDescription,formatMetric,calendarDay};
  if (typeof document === 'undefined') return;

  const en=document.documentElement.lang.startsWith('en');
  const readCache = key => {try {return JSON.parse(localStorage.getItem(key));} catch (_) {return null;}};
  const writeCache = (key,value) => {try {localStorage.setItem(key,JSON.stringify(value));} catch (_) {}};
  const fresh = cached => cached && Number.isFinite(cached.checkedAt) && cached.checkedAt > 0 && cached.checkedAt <= Date.now() &&
    calendarDay(cached.checkedAt) === today();
  const editing = () => document.body.classList.contains('is-reviewing') || new URLSearchParams(location.search).get('edit') === '1';
  const fetchJSON = async (url,withLinks=false) => {
    const controller=new AbortController(), timer=setTimeout(() => controller.abort(),5500);
    try {
      const response=await fetch(url,{signal:controller.signal,credentials:'omit',referrerPolicy:'no-referrer'});
      if (!response.ok) throw Error('Public data unavailable');
      const data=await response.json();
      return withLinks ? {data,links:response.headers.get('Link') || ''} : data;
    } finally {clearTimeout(timer);}
  };
  const fetchModelSeries = async (project,series) => {
    const [,owner,name]=project.split('/');
    let url='https://huggingface.co/api/models?author='+encodeURIComponent(owner)+'&search='+encodeURIComponent(name)+'&expand[]=downloadsAllTime&limit=1000';
    const visited=new Set(),rows=[];
    while (url) {
      const parsed=new URL(url);
      if (visited.has(url) || visited.size>=10 || parsed.origin!=='https://huggingface.co' || parsed.pathname!=='/api/models' ||
        parsed.searchParams.get('author')!==owner || parsed.searchParams.get('search')!==name) throw Error('Incomplete model listing');
      visited.add(url);
      const page=await fetchJSON(url,true);
      if (!Array.isArray(page.data)) throw Error('Invalid model listing');
      rows.push(...page.data);
      const next=page.links.split(/,(?=\s*<)/).find(link => /;\s*rel\s*=\s*["']?next(?:["';\s]|$)/i.test(link));
      const target=next?.match(/<([^>]+)>/)?.[1];
      url=target ? new URL(target,url).href : null;
    }
    return modelSeriesFrom(rows,series.bases,today(),series.requiredMembers);
  };
  const getFeed = async (url, parse) => {
    const fallback=url.replace('https://raw.githubusercontent.com/lr-tsinghua11/lr-tsinghua11.github.io/scholar-data/',
      'https://cdn.jsdelivr.net/gh/lr-tsinghua11/lr-tsinghua11.github.io@scholar-data/');
    for (const source of new Set([url,fallback])) {
      try {const data=parse(await fetchJSON(source)); if (data.length) return data;} catch (_) {}
    }
    throw Error('No valid Scholar records');
  };

  const refreshers=[];
  document.querySelectorAll('[data-scholar-feed]').forEach(node => {
    const config=JSON.parse(node.textContent), section=node.closest('.citations-section');
    const figure=section.querySelector('[data-citation-metric="citations"]');
    const hFigure=section.querySelector('[data-citation-metric="hindex"]');
    const original=JSON.parse(figure.querySelector('[data-citation-data]').textContent);
    const originalH=hFigure ? JSON.parse(hFigure.querySelector('[data-citation-data]').textContent) : [];
    const key='rui-profile:scholar:v1', status=section.querySelector('[data-scholar-status]');
    let cached=readCache(key), busy=false, pending=null;
    const apply = () => {
      if (!pending || editing()) return;
      const {data,latest,hindex}=pending;
      section.querySelector('[data-scholar-total]').textContent=latest.total.toLocaleString('en-US');
      section.querySelector('[data-scholar-hindex]').textContent=latest.h;
      const date=section.querySelector('[data-scholar-date]');
      date.textContent=latest.date;date.dateTime=latest.date;
      const dates=[...data,...hindex].map(point=>point.date).sort();
      section.dataset.citationStart=dates[0];
      section.dataset.citationEnd=dates.at(-1);
      figure.dispatchEvent(new CustomEvent('lr:citations-updated',{detail:data}));
      hFigure?.dispatchEvent(new CustomEvent('lr:citations-updated',{detail:hindex}));
    };
    const accept = payload => {
      if (!payload || !Array.isArray(payload.snapshots)) return;
      // Keep the site's labelled history; cached history cannot replace it or the snapshots.
      pending=mergeScholar(original,config.snapshot,payload.snapshots,originalH);
      apply();
    };
    const checked = (date, latest) => {
      status.dataset.checkedDate=date;
      status.title=en ? `Last checked ${date}; latest record: ${latest}.` : `上次检查：${date}；最新记录：${latest}。`;
    };
    accept(cached?.payload);
    if (Number.isFinite(cached?.checkedAt) && cached.checkedAt > 0 && cached.checkedAt <= Date.now()) checked(calendarDay(cached.checkedAt),pending?.latest.date || config.snapshot.date);
    const refresh = async () => {
      if (busy || fresh(cached)) return;
      busy=true;
      try {
        const payload={snapshots:await getFeed(config.sources.snapshots,snapshotsFrom)};
        cached={checkedAt:Date.now(),payload};writeCache(key,cached);accept(payload);
        checked(today(),pending.latest.date);
        status.dataset.refreshState='checked';
      } catch (_) {
        status.dataset.refreshState='offline';
        status.title=en ? 'Citations could not be updated. Showing the latest saved record.' : '引用数据暂时无法更新，当前显示最近保存的记录。';
      }
      busy=false;
    };
    document.addEventListener('lr:review-mode',apply);
    refreshers.push(refresh);
  });

  const projects=new Map();
  document.querySelectorAll('[data-project-metric]').forEach(node => {
    const {provider,project}=node.dataset;
    let series=null;
    if (provider==='huggingface' && /^series\/[\w.-]+\/[\w.-]+$/.test(project)) {
      try {
        const bases=JSON.parse(node.dataset.seriesBases),requiredMembers=JSON.parse(node.dataset.seriesMembers);
        if (!Array.isArray(bases) || !bases.length || !bases.every(modelId) || !Array.isArray(requiredMembers) || !requiredMembers.every(modelId)) return;
        series={bases,requiredMembers};
      } catch (_) { return; }
    }
    const valid=provider === 'github' ? /^[\w.-]+\/[\w.-]+$/.test(project) : provider==='huggingface' && (series || /^(models|datasets)\/[\w.-]+\/[\w.-]+$/.test(project));
    if (!valid) return;
    const id=provider+':'+project;
    if (!projects.has(id)) projects.set(id,{provider,project,series,nodes:[]});
    projects.get(id).nodes.push(node);
  });
  const projectJobs=[];
  for (const [id,{provider,project,series,nodes}] of projects) {
    const key='rui-profile:metric:v1:'+id;
    let cached=readCache(key),busy=false,pending=null;
    const validMetric = metric => {
      if (!metric || !dateIsValid(metric.date)) return false;
      if (!series) return provider === 'github' ? integer(metric.stars) : integer(metric.downloads);
      if (metric.scope!=='series' || !Array.isArray(metric.bases) || metric.bases.join('|')!==series.bases.join('|') ||
        !metric.members || typeof metric.members!=='object' || Array.isArray(metric.members)) return false;
      const rows=Object.entries(metric.members).map(([id,downloadsAllTime]) => ({id,downloadsAllTime}));
      const verified=modelSeriesFrom(rows,series.bases,metric.date,series.requiredMembers);
      return verified && verified.downloads===metric.downloads && Object.keys(verified.members).length===rows.length;
    };
    const apply = metric => {
      if (!validMetric(metric)) return;
      pending=metric;
      if (editing()) return;
      for (const node of nodes) {
        if (metric.date < node.dataset.metricDate) continue;
        node.querySelectorAll('[data-metric-value]').forEach(value => {value.textContent=formatMetric(metric[value.dataset.metricValue]);});
        node.dataset.metricDate=metric.date;
        node.title=metricDescription(provider,metric,en);
        node.setAttribute('aria-label',node.title);
      }
    };
    apply(cached?.metric);
    const refresh = async () => {
      if (busy || (fresh(cached) && validMetric(cached.metric))) return;
      busy=true;
      try {
        const url=provider === 'github' ? 'https://api.github.com/repos/'+project
          : 'https://huggingface.co/api/'+project+'?expand[]=downloadsAllTime';
        const metric=series ? await fetchModelSeries(project,series) : metricFrom(provider,await fetchJSON(url));
        if (metric) {cached={checkedAt:Date.now(),metric};writeCache(key,cached);apply(metric);}
      } catch (_) { /* The verified static snapshot stays visible when a service is unavailable. */ }
      finally {busy=false;}
    };
    document.addEventListener('lr:review-mode',() => apply(pending));
    projectJobs.push(refresh);
  }
  const refreshProjects = async () => {
    const queue=[...projectJobs];
    await Promise.all(Array.from({length:Math.min(3,queue.length)},async () => {
      while (queue.length) await queue.shift()();
    }));
  };
  refreshers.push(refreshProjects);
  const refreshAll = () => refreshers.forEach(refresh => {void refresh();});
  refreshAll();
  document.addEventListener('visibilitychange',() => {if (!document.hidden) refreshAll();});
  setInterval(() => {if (!document.hidden) refreshAll();},60*60*1000);
})();
