#!/usr/bin/env python3
"""PARENT ONLY: persistent psql sessions against a network-none disposable DB.

No Docker/SQL installation, env-file/credential loading, downloads or provider calls.
This program DOES execute SQL when explicitly invoked by the parent, not the agent.
"""
import argparse
import json
import os
from pathlib import Path
import select
import subprocess
import time


class Session:
    def __init__(self, args):
        self.process = subprocess.Popen(
            [args.psql, '-X', '-q', '-A', '-t', '--no-password',
             '--host=' + args.socket, '--dbname=pebble_namespace_disposable', '--username=postgres'],
            stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
            env={'HOME': '/nonexistent', 'PGPASSFILE': '/nonexistent',
                 'PGSERVICEFILE': '/nonexistent', 'PGSYSCONFDIR': '/nonexistent', 'LC_ALL': 'C'},
        )
        self.buffer = b''
        self.counter = 0
        self.pending = None
        try:
            self.run("set statement_timeout='8s'; set lock_timeout='6s';")
            self.pid = int(self.run('select pg_backend_pid();')[0])
        except BaseException:
            self.close()
            raise

    def submit(self, sql):
        assert self.pending is None, 'Session already has a pending statement'
        self.counter += 1
        self.pending = '__NAMESPACE_END_' + str(self.counter) + '__'
        self.process.stdin.write((sql + '\n\\echo ' + self.pending + ' :SQLSTATE\n').encode())
        self.process.stdin.flush()

    def finish(self, expected='00000'):
        deadline = time.monotonic() + 12
        lines = []
        while True:
            while b'\n' in self.buffer:
                raw, self.buffer = self.buffer.split(b'\n', 1)
                line = raw.decode().strip()
                if line.startswith(self.pending + ' '):
                    state = line.split()[-1]
                    self.pending = None
                    assert state == expected, f'Expected SQLSTATE {expected}, received {state}: {lines}'
                    return lines
                if line:
                    lines.append(line)
            remaining = deadline - time.monotonic()
            assert remaining > 0, 'psql response timed out'
            readable, _, _ = select.select([self.process.stdout], [], [], remaining)
            assert readable, 'psql response timed out'
            chunk = os.read(self.process.stdout.fileno(), 65536)
            assert chunk, 'psql exited before response marker'
            self.buffer += chunk

    def run(self, sql, expected='00000'):
        self.submit(sql)
        return self.finish(expected)

    def close(self):
        # Terminating this disposable client releases its transaction/locks.
        self.process.terminate()
        try:
            self.process.wait(timeout=3)
        except subprocess.TimeoutExpired:
            self.process.kill()
            self.process.wait()


def literal(value):
    return "'" + value.replace("'", "''") + "'"


def actor(number):
    return 'f1000000-0000-4000-8000-' + f'{number:012d}'


def save(kind, name, interests=None):
    body = {'username': name, 'display_name': 'Synthetic fixture', 'bio': None, 'avatar_url': None}
    if kind == 'legacy':
        body.update(birthdate=None, location_city=None, interests=interests or [], availability=[])
    function = 'save_account_profile' if kind == 'canonical' else 'save_matchmaking_profile'
    return 'select public.' + function + '(' + literal(json.dumps(body)) + '::jsonb);'


def begin(session, who, isolation='read committed'):
    session.run('begin isolation level ' + isolation + '; set local role authenticated; '
                "select set_config('request.jwt.claim.sub'," + literal(who) + ',true);')


def waiting(observer, waiter, holder):
    # Actual observed blocking is the barrier; no pg_sleep/timing-based commit order.
    deadline = time.monotonic() + 4
    while time.monotonic() < deadline:
        rows = observer.run("select exists(select 1 from pg_stat_activity where pid=" + str(waiter.pid)
                            + " and wait_event_type='Lock' and wait_event='advisory' and "
                            + str(holder.pid) + '=any(pg_blocking_pids(pid)));')
        if rows == ['t']:
            return
    raise AssertionError('Expected namespace lock wait was not observed')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--socket', required=True, help='Absolute local Unix socket directory, not a TCP host')
    parser.add_argument('--psql', default='/usr/bin/psql', help='Absolute psql executable path')
    parser.add_argument('--disposable-network-none', action='store_true', required=True,
                        help='Parent attests this is the isolated disposable DB, never the running DB')
    args = parser.parse_args()
    assert Path(args.socket).is_absolute() and Path(args.psql).is_absolute()
    sessions = []
    try:
        admin = Session(args)
        sessions.append(admin)
        assert admin.run('select current_database();') == ['pebble_namespace_disposable']
        assert admin.run('select purpose from public.namespace_test_marker where singleton;') == ['network-none-disposable-namespace']
        assert admin.run("select position('NAMESPACE_TEST_PROVIDER_GUARD' in pg_get_functiondef('public.get_gemini_embedding(text)'::regprocedure))>0;") == ['t']
        assert admin.run("select not has_table_privilege('authenticated','public.profiles','INSERT,UPDATE,DELETE') and not has_any_column_privilege('authenticated','public.profiles','INSERT') and not has_any_column_privilege('authenticated','public.profiles','UPDATE');") == ['t']
        left = Session(args)
        sessions.append(left)
        right = Session(args)
        sessions.append(right)
        index = 0

        def fixtures():
            nonlocal index
            index += 1
            a, b = actor(index * 2), actor(index * 2 + 1)
            # No cleanup/overwrite: rerun only in a fresh parent-owned disposable DB.
            admin.run('insert into auth.users(id) values (' + literal(a) + '),(' + literal(b) + ');')
            return a, b, 'namespace-fixture-' + str(index)

        def owners(name, expected):
            rows = admin.run('select count(distinct id) from (select id from public.account_profiles where username='
                             + literal(name) + ' union all select id from public.profiles where username=' + literal(name) + ') owners;')
            assert rows == [str(expected)], f'Unexpected cross-table ownership count: {rows}'

        def commit_save(session, who, kind, name):
            begin(session, who)
            session.run(save(kind, name))
            session.run('commit;')

        for first, second in [('canonical', 'legacy'), ('legacy', 'canonical')]:
            a, b, name = fixtures()
            commit_save(left, a, first, name)
            begin(right, b)
            right.run(save(second, name), '23505')
            right.run('rollback;')
            owners(name, 1)
            print('PASS sequential', first, 'then', second)

            # Both arrival/commit directions, and rollback releasing the reservation.
            for release in ['commit', 'rollback']:
                a, b, name = fixtures()
                begin(left, a)
                left.run(save(first, name))
                begin(right, b)
                right.submit(save(second, name))
                waiting(admin, right, left)
                left.run(release + ';')
                right.finish('23505' if release == 'commit' else '00000')
                right.run('rollback;' if release == 'commit' else 'commit;')
                owners(name, 1)
                # After rollback the second writer commits first and owns U.
                if release == 'rollback':
                    begin(left, a)
                    left.run(save(first, name), '23505')
                    left.run('rollback;')
                print('PASS observed concurrent', first, second, release)

            a, b, name = fixtures()
            commit_save(left, a, first, name)
            commit_save(left, a, first, name + '-renamed')
            commit_save(right, b, second, name)
            owners(name, 1)
            owners(name + '-renamed', 1)
            print('PASS rename/release', first)

            a, _, name = fixtures()
            begin(left, a)
            left.run(save(first, name))
            begin(right, a)
            right.submit(save(second, name))
            waiting(admin, right, left)
            left.run('commit;')
            right.finish()
            right.run('commit;')
            owners(name, 1)
            assert admin.run('select a.username=p.username from public.account_profiles a join public.profiles p using(id) where a.id=' + literal(a) + ';') == ['t']
            print('PASS same actor', first, second)

            a, b, name = fixtures()
            begin(left, a)
            left.run(save(first, name))
            begin(right, b)
            right.run("set local lock_timeout='2s';")
            right.submit(save(second, name))
            waiting(admin, right, left)
            right.finish('55P03')
            right.run('rollback;')
            left.run('rollback;')
            owners(name, 0)
            print('PASS lock timeout', first, second)

            for isolation in ['read uncommitted', 'repeatable read', 'serializable']:
                a, _, name = fixtures()
                begin(left, a, isolation)
                left.run(save(first, name), '25001')
                left.run('rollback;')
                owners(name, 0)
                print('PASS rejected isolation', first, isolation)

        # An old client's conflicting input must project its OWN canonical username
        # before testing another actor's reservation.
        a, b, name = fixtures()
        commit_save(left, a, 'canonical', name)
        commit_save(right, b, 'canonical', name + '-other')
        commit_save(left, a, 'legacy', name + '-other')
        assert admin.run('select username from public.profiles where id=' + literal(a) + ';') == [name]
        print('PASS effective projected username')

        a, b, name = fixtures()
        commit_save(left, a, 'canonical', '  ' + name + '-Case  ')
        commit_save(right, b, 'legacy', '  ' + name + '-case  ')
        owners(name + '-Case', 1)
        owners(name + '-case', 1)
        print('PASS existing trim/case-sensitive equality')

        a, _, name = fixtures()
        begin(left, a)
        left.run(save('legacy', name, ['Forbidden synthetic provider request']), 'PZ001')
        left.run('rollback;')
        owners(name, 0)
        print('PASS provider raising guard/atomic rollback')

        begin(left, a)
        left.run('insert into public.profiles(id,username,display_name) values (' + literal(a) + ',' + literal(name) + ",'Fixture');", '42501')
        left.run('rollback;')
        print('PASS direct browser writes denied')
        print('All disposable namespace checks completed; this is NOT live installation evidence.')
    finally:
        for session in sessions:
            session.close()


if __name__ == '__main__':
    main()
