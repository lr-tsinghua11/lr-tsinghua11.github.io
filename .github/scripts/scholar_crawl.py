#!/usr/bin/env python3
"""Save a complete, reconciled Google Scholar profile observation.

Publication IDs, rather than title fragments, identify papers. Every page must
parse and the per-paper counts must reproduce all three profile metrics before
anything is recorded. A blocked/incomplete response is an error, never a new
zero-valued or repeated observation. Saved HTML can be imported with its actual
retrieval timestamp; it is not stamped with the import date.
"""
import argparse
import datetime as dt
import gzip
import hashlib
from html.parser import HTMLParser
import json
from pathlib import Path
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from zoneinfo import ZoneInfo

USER = '-MGuqDcAAAAJ'
ORIGIN = 'https://scholar.google.com'
TIMEZONE = 'Asia/Shanghai'
UA = ('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 '
      '(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36')


class InvalidProfile(ValueError):
    pass


class Node:
    def __init__(self, tag='', attrs=()):
        self.tag = tag
        self.attrs = dict(attrs)
        self.children = []

    def text(self):
        return ' '.join(' '.join(c.text() if isinstance(c, Node) else c
                                for c in self.children).split())

    def find(self, *, tag=None, cls=None, id=None):
        result = []
        for child in self.children:
            if not isinstance(child, Node):
                continue
            if ((tag is None or child.tag == tag)
                    and (cls is None or cls in child.attrs.get('class', '').split())
                    and (id is None or child.attrs.get('id') == id)):
                result.append(child)
            result.extend(child.find(tag=tag, cls=cls, id=id))
        return result


class Document(HTMLParser):
    VOID = {'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link',
            'meta', 'param', 'source', 'track', 'wbr'}

    def __init__(self, raw):
        super().__init__(convert_charrefs=True)
        self.root = Node()
        self.stack = [self.root]
        self.feed(raw.decode('utf-8', 'replace') if isinstance(raw, bytes) else raw)
        self.close()

    def handle_starttag(self, tag, attrs):
        node = Node(tag, attrs)
        self.stack[-1].children.append(node)
        if tag not in self.VOID:
            self.stack.append(node)

    def handle_startendtag(self, tag, attrs):
        self.handle_starttag(tag, attrs)
        if tag not in self.VOID:
            self.handle_endtag(tag)

    def handle_endtag(self, tag):
        for i in range(len(self.stack) - 1, 0, -1):
            if self.stack[i].tag == tag:
                del self.stack[i:]
                break

    def handle_data(self, data):
        self.stack[-1].children.append(data)


def one(nodes, description):
    if len(nodes) != 1:
        raise InvalidProfile(f'Expected one {description}; found {len(nodes)}')
    return nodes[0]


def count(text, *, empty_zero=False):
    if not text and empty_zero:
        return 0
    if not re.fullmatch(r'\d+|\d{1,3}(?:,\d{3})+', text):
        raise InvalidProfile(f'Invalid count: {text!r}')
    return int(text.replace(',', ''))


def parse_profile(raw, user=USER):
    doc = Document(raw).root
    table = one(doc.find(id='gsc_rsb_st'), 'profile metrics table')
    labels = {'Citations': 'total', 'h-index': 'h', 'i10-index': 'i10'}
    metrics = {}
    for row in table.find(tag='tr'):
        values = row.find(cls='gsc_rsb_std')
        if not values:
            continue
        for label, key in labels.items():
            if row.text().startswith(label + ' '):
                metrics[key] = count(values[0].text())
    if set(metrics) != {'total', 'h', 'i10'}:
        raise InvalidProfile('Missing full-profile citation metrics')
    publications = []
    for row in doc.find(cls='gsc_a_tr'):
        title = one(row.find(cls='gsc_a_at'), 'paper title')
        cited = one(row.find(cls='gsc_a_ac'), 'paper citation count')
        detail = urllib.parse.urljoin(ORIGIN, title.attrs.get('href', ''))
        identity = urllib.parse.parse_qs(urllib.parse.urlsplit(detail).query).get('citation_for_view', [''])[0]
        if not identity.startswith(user + ':') or not identity.split(':')[-1]:
            raise InvalidProfile('Paper does not have a stable ID for this profile')
        cited_url = urllib.parse.urljoin(ORIGIN, cited.attrs.get('href', '')) if cited.attrs.get('href') else None
        n = count(cited.text(), empty_zero=True)
        if n and (not cited_url or not urllib.parse.parse_qs(urllib.parse.urlsplit(cited_url).query).get('cites')):
            raise InvalidProfile('Nonzero paper is missing its Cited by link')
        year_nodes = row.find(cls='gsc_a_y')
        year = year_nodes[0].text() if year_nodes else ''
        details = [node.text() for node in row.find(cls='gs_gray')]
        publications.append({
            'id': identity.split(':', 1)[1], 'title': title.text(),
            'citations': n, 'year': int(year) if re.fullmatch(r'\d{4}', year) else None,
            'detail_url': detail, 'cited_by_url': cited_url,
            'authors': details[0] if details else '',
            'venue': details[1] if len(details) > 1 else '',
            'scholar_asterisk': any(a.text() == '*' for a in row.find(tag='a')),
        })
    more = one(doc.find(id='gsc_bpf_more'), 'profile pagination control')
    return {**metrics, 'publications': publications,
            'has_more': 'disabled' not in more.attrs}


def reconcile(pages):
    if not pages or pages[-1]['has_more']:
        raise InvalidProfile('The complete publication list has not been retrieved')
    metrics = {key: pages[0][key] for key in ('total', 'h', 'i10')}
    papers = {}
    for i, page in enumerate(pages):
        if any(page[k] != v for k, v in metrics.items()):
            raise InvalidProfile('Profile metrics changed between pages; try a new observation')
        if i < len(pages) - 1 and not page['has_more']:
            raise InvalidProfile('Unexpected pages after the end of the profile')
        for paper in page['publications']:
            if paper['id'] in papers:
                raise InvalidProfile('Repeated paper ID across profile pages')
            papers[paper['id']] = paper
    ranked = sorted((p['citations'] for p in papers.values()), reverse=True)
    computed = {'total': sum(ranked),
                'h': sum(n >= rank for rank, n in enumerate(ranked, 1)),
                'i10': sum(n >= 10 for n in ranked)}
    if computed != metrics:
        raise InvalidProfile(f'Per-paper counts {computed} do not match Scholar {metrics}')
    return {**metrics, 'publications': list(papers.values()),
            'paper_count': len(papers), 'reconciliation': computed}


def timestamp(value):
    observed = dt.datetime.fromisoformat(value.replace('Z', '+00:00'))
    if observed.tzinfo is None:
        raise ValueError('Observation timestamp must include a timezone')
    return observed.astimezone(dt.timezone.utc)


def profile_url(user, start=0):
    return ORIGIN + '/citations?' + urllib.parse.urlencode({
        'user': user, 'hl': 'en', 'pagesize': 100, 'cstart': start})


def fetch_profile(user=USER):
    pages, evidence = [], []
    for start in range(0, 10000, 100):
        url = profile_url(user, start)
        request = urllib.request.Request(url, headers={'User-Agent': UA, 'Accept-Language': 'en'})
        try:
            with urllib.request.urlopen(request, timeout=35) as response:
                raw = response.read()
                final_url = response.url
        except urllib.error.HTTPError as exc:
            raise InvalidProfile(f'Scholar returned HTTP {exc.code}; no snapshot was recorded') from exc
        observed_at = dt.datetime.now(dt.timezone.utc)
        page = parse_profile(raw, user)
        pages.append(page)
        evidence.append({'url': url, 'final_url': final_url,
                         'observed_at': observed_at.isoformat(), 'raw': raw})
        if not page['has_more']:
            return reconcile(pages), evidence, observed_at
        time.sleep(3)
    raise InvalidProfile('Profile pagination limit reached')


def compatibility_counts(publications):
    """Keep the old named-paper field without folding GLM versions together."""
    values = {}
    names = {'teacherlm': 'TeacherLM', 'agenttuning': 'AgentTuning',
             'chatglm': 'ChatGLM', 'treerl': 'TreeRL', 'deepdive': 'DeepDive',
             'agentrl': 'AgentRL', 'mle-rl': 'MLE-RL'}
    for p in publications:
        title = p['title'].casefold()
        name = next((v for k, v in names.items() if title.startswith(k)), None)
        version = re.match(r'glm[- ](\d+(?:\.\d+)?(?:-flash)?)(?=\W|$)', title)
        if version:
            name = 'GLM-' + version[1].replace('-flash', '-Flash')
        if title.startswith(('advancing language model reasoning', 't1:')):
            name = 'T1'
        name = name or 'row:' + p['id']
        values[name] = values.get(name, 0) + p['citations']
    return values


def save_observation(output, data, evidence, observed_at, user=USER):
    output = Path(output)
    old = json.loads(output.read_text()) if output.exists() else []
    if not isinstance(old, list):
        raise ValueError('Snapshot file must contain an array')
    day = observed_at.astimezone(ZoneInfo(TIMEZONE)).date().isoformat()
    same_day = [s for s in old if s.get('d') == day]
    if any(s.get('observed_at') and timestamp(s['observed_at']) > observed_at for s in same_day):
        raise ValueError('Refusing to replace a newer observation with an older one')
    stamp = observed_at.strftime('%Y%m%dT%H%M%S%fZ')
    records = []
    for i, item in enumerate(evidence, 1):
        relative = Path('profiles') / day / f'{stamp}-{i}.html.gz'
        destination = output.parent / relative
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_bytes(gzip.compress(item['raw'], mtime=0))
        records.append({k: v for k, v in item.items() if k != 'raw'} | {
            'path': relative.as_posix(), 'sha256': hashlib.sha256(item['raw']).hexdigest()})
    snap = {'d': day, 'observed_at': observed_at.isoformat(), 'timezone': TIMEZONE,
            'source': 'Google Scholar', 'user': user, 'schema_version': 2,
            **data, 'papers': compatibility_counts(data['publications']),
            'evidence': records}
    rows = sorted([s for s in old if s.get('d') != day] + [snap], key=lambda s: s['d'])
    output.parent.mkdir(parents=True, exist_ok=True)
    temporary = output.with_name(output.name + '.tmp')
    temporary.write_text(json.dumps(rows, ensure_ascii=False, indent=1) + '\n')
    temporary.replace(output)
    return snap


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('output', type=Path)
    parser.add_argument('--user', default=USER)
    parser.add_argument('--profile-html', type=Path, action='append', default=[])
    parser.add_argument('--profile-url', action='append', default=[], help='Actual request URL, in the same order as --profile-html')
    parser.add_argument('--observed-at', help='Actual retrieval timestamp for saved HTML, including timezone')
    args = parser.parse_args()
    try:
        if args.profile_html:
            if not args.observed_at:
                parser.error('--observed-at is required when importing saved HTML')
            if args.profile_url and len(args.profile_url) != len(args.profile_html):
                parser.error('--profile-url must be supplied once per saved HTML page')
            observed = timestamp(args.observed_at)
            raw = [p.read_bytes() for p in args.profile_html]
            data = reconcile([parse_profile(body, args.user) for body in raw])
            evidence = [{'url': args.profile_url[i] if args.profile_url else profile_url(args.user, i * 100), 'raw': body,
                         'observed_at': observed.isoformat()} for i, body in enumerate(raw)]
        else:
            if args.observed_at:
                parser.error('--observed-at is only valid with --profile-html')
            if args.profile_url:
                parser.error('--profile-url is only valid with --profile-html')
            data, evidence, observed = fetch_profile(args.user)
        snap = save_observation(args.output, data, evidence, observed, args.user)
        print(f"Recorded {snap['d']}: {snap['paper_count']} papers, "
              f"{snap['total']} citations, h-index {snap['h']}, i10-index {snap['i10']}; all reconciled")
    except (InvalidProfile, ValueError, OSError, urllib.error.URLError) as exc:
        print(f'::error::Scholar observation failed: {exc}', file=sys.stderr)
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())
