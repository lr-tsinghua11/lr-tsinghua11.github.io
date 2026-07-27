#!/usr/bin/env python3
"""Daily Google Scholar snapshot for GitHub Actions.
Appends {d, total, h, i10, papers} to the citations.json passed as argv[1]
(one entry per day; same-day rerun replaces). Tries `scholarly` first, falls
back to parsing the public profile page directly.

Google blocks most datacenter IPs (incl. GitHub runners) with a captcha, so
this script is BEST-EFFORT: after retries it exits 0 with a notice instead of
failing the workflow. The authoritative daily snapshot is pushed from a local
machine; this action only fills gaps on days it happens to get through."""
import json, re, sys, html, time, random, datetime, pathlib, urllib.request

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
        snippet = re.sub(r'\s+', ' ', re.sub('<[^>]+>', ' ', raw))[:200]
        raise RuntimeError(f'profile page did not parse (captcha?): {snippet}')
    papers = {}
    for t, c in re.findall(r'gsc_a_at"[^>]*>(.*?)</a>.*?gsc_a_ac gs_ibl"[^>]*>(\d*)</a>', raw, re.S):
        title = html.unescape(re.sub('<[^>]+>', '', t)).lower()
        for kw, key in MATCH.items():
            if kw in title:
                papers[key] = papers.get(key, 0) + int(c or 0)
                break
    return dict(total=int(std[0]), h=int(std[2]), i10=int(std[4]), papers=papers)

def fetch_with_retries(tries=3):
    last = None
    for i in range(tries):
        for name, fn in (('scholarly', via_scholarly), ('profile-page', via_profile_page)):
            try:
                snap = fn()
                print(f'source: {name} (attempt {i + 1})')
                return snap
            except Exception as e:
                last = e
                print(f'{name} attempt {i + 1} failed: {e}')
        if i < tries - 1:
            time.sleep(30 + random.uniform(0, 30))
    print(f'::notice::Scholar unreachable from this runner after {tries} attempts '
          f'({last}); skipping today — local pipeline will record the snapshot.')
    sys.exit(0)  # best-effort: do not fail the workflow

def main():
    out = pathlib.Path(sys.argv[1])
    data = json.load(out.open()) if out.exists() else []
    snap = {'d': datetime.date.today().isoformat(), **fetch_with_retries()}
    if snap['total'] <= 0:
        print('::notice::total is 0, refusing to record'); sys.exit(0)
    if data and snap['total'] < 0.9 * data[-1]['total']:
        print(f"::notice::total {snap['total']} dropped >10% vs last {data[-1]['total']}; "
              'looks like a bad parse, skipping'); sys.exit(0)
    data = [s for s in data if s['d'] != snap['d']] + [snap]
    data.sort(key=lambda s: s['d'])
    json.dump(data, out.open('w'), ensure_ascii=False, indent=1)
    print(f"recorded {snap['d']}: total={snap['total']} h={snap['h']} i10={snap['i10']} ({len(data)} snapshots)")

if __name__ == '__main__':
    main()
