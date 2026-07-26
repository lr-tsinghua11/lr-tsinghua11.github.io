#!/usr/bin/env python3
"""Daily Google Scholar snapshot for GitHub Actions.
Appends {d, total, h, i10, papers} to the citations.json passed as argv[1]
(one entry per day; same-day rerun replaces). Tries `scholarly` first, falls
back to parsing the public profile page directly."""
import json, re, sys, html, datetime, pathlib, urllib.request

USER = '-MGuqDcAAAAJ'
UA = ('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 '
      '(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36')
MATCH = {  # profile row title (lowercased) -> paper key; rows for the same key are summed
    'teacherlm': 'TeacherLM', 'agenttuning': 'AgentTuning', 'chatglm': 'ChatGLM',
    'advancing language model reasoning': 'T1', 'treerl': 'TreeRL', 'glm-4.5': 'GLM-4.5',
    'deepdive': 'DeepDive', 'agentrl': 'AgentRL', 'glm-5': 'GLM-5', 'mle-rl': 'MLE-RL',
}

def via_scholarly():
    from scholarly import scholarly
    au = scholarly.fill(scholarly.search_author_id(USER), sections=['basics', 'indices', 'publications'])
    papers = {}
    for pub in au.get('publications', []):
        title = (pub.get('bib', {}).get('title') or '').lower()
        for kw, key in MATCH.items():
            if kw in title:
                papers[key] = papers.get(key, 0) + int(pub.get('num_citations') or 0)
                break
    return dict(total=int(au['citedby']), h=int(au['hindex']), i10=int(au['i10index']), papers=papers)

def via_profile_page():
    url = f'https://scholar.google.com/citations?user={USER}&hl=en&pagesize=100'
    req = urllib.request.Request(url, headers={'User-Agent': UA, 'Accept-Language': 'en'})
    raw = urllib.request.urlopen(req, timeout=40).read().decode('utf-8', 'replace')
    std = re.findall(r'gsc_rsb_std">(\d+)', raw)
    if not std:
        raise RuntimeError('profile page did not parse (captcha?)')
    papers = {}
    for t, c in re.findall(r'gsc_a_at"[^>]*>(.*?)</a>.*?gsc_a_ac gs_ibl"[^>]*>(\d*)</a>', raw, re.S):
        title = html.unescape(re.sub('<[^>]+>', '', t)).lower()
        for kw, key in MATCH.items():
            if kw in title:
                papers[key] = papers.get(key, 0) + int(c or 0)
                break
    return dict(total=int(std[0]), h=int(std[2]), i10=int(std[4]), papers=papers)

def main():
    out = pathlib.Path(sys.argv[1])
    try:
        snap = via_scholarly()
        print('source: scholarly')
    except Exception as e:
        print(f'scholarly failed ({e}); falling back to profile page')
        snap = via_profile_page()
    snap = {'d': datetime.date.today().isoformat(), **snap}
    if snap['total'] <= 0:
        sys.exit('ABORT: total is 0, refusing to record')
    data = json.load(out.open()) if out.exists() else []
    data = [s for s in data if s['d'] != snap['d']] + [snap]
    data.sort(key=lambda s: s['d'])
    json.dump(data, out.open('w'), ensure_ascii=False, indent=1)
    print(f"recorded {snap['d']}: total={snap['total']} h={snap['h']} i10={snap['i10']} ({len(data)} snapshots)")

if __name__ == '__main__':
    main()
