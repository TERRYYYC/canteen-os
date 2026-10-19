#!/usr/bin/env python3
"""Prepare a Douyin favorites CSV and optionally apply it to the local KB API.

This reads only the user's existing CSV. It does not access Douyin or credentials.
"""
import argparse
import csv
import hashlib
import json
from pathlib import Path
from urllib.request import Request, urlopen


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('csv_file', type=Path)
    parser.add_argument('--claimed-count', type=int, required=True)
    parser.add_argument('--base', default='http://127.0.0.1:4390')
    parser.add_argument('--apply', action='store_true')
    args = parser.parse_args()
    if args.base not in ('http://127.0.0.1:4390', 'http://127.0.0.1:4391'):
        parser.error('--base must be a configured loopback KB service')
    raw = args.csv_file.read_bytes()
    with args.csv_file.open(newline='', encoding='utf-8-sig') as handle:
        rows = list(csv.DictReader(handle))
    folder = rows[0]['folder'] if rows else '吃的'
    payload = json.dumps({'folder': folder, 'claimedCount': args.claimed_count, 'rows': rows}, ensure_ascii=False).encode('utf-8')
    def send(action):
        request = Request(f'{args.base}/api/v1/favorites/import/{action}', data=payload,
                          headers={'Content-Type': 'application/json', 'X-KB-Client': 'agent'}, method='POST')
        with urlopen(request, timeout=30) as response:
            return json.load(response)
    prepared = send('prepare')
    print(json.dumps({'csvSha256': hashlib.sha256(raw).hexdigest(), 'prepare': prepared}, ensure_ascii=False))
    if args.apply:
        print(json.dumps({'apply': send('apply')}, ensure_ascii=False))


if __name__ == '__main__':
    main()
