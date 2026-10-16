#!/bin/sh
# Run the migrations against a real Postgres and exercise them.
#
# Every other test in _verify reads App.jsx or the .sql as TEXT. That proves
# a line is present; it cannot prove the function refuses what it should, or
# that a status lands inside a check constraint, or that a notification
# `kind` is one the table allows. Those only fail when somebody applies the
# migration - which, for 004 and 005, means Isaiah, on production, with
# nobody around to fix it.
#
# So the migrations are actually run here, against a throwaway Postgres
# built from the live schema (00_scaffold.sql, columns and constraints
# copied from the live database on 16 Oct).
#
# Skips itself, loudly, when there is no Postgres on the machine. It is a
# second line of verification, not a reason the suite cannot run on a Mac.
set -e
HERE=$(cd "$(dirname "$0")" && pwd)
PGBIN=$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | tail -1)
[ -n "$PGBIN" ] || PGBIN=$(dirname "$(command -v initdb 2>/dev/null)" 2>/dev/null) || true

if [ -z "$PGBIN" ] || [ ! -x "$PGBIN/initdb" ]; then
  echo "   (skipped: no local Postgres. The SQL is only text-checked on this machine.)"
  exit 0
fi

DATA=${TB_PGDATA:-/tmp/tb-pgtest}
PORT=${TB_PGPORT:-5433}
# The socket lives INSIDE the data directory, not in /tmp. A shared socket
# path means a server left running by an earlier run holds the lock file,
# the new one cannot start, and the whole SQL layer skips itself with a
# message that sounds like Postgres is missing.
SOCK=$DATA

if [ ! -f "$DATA/PG_VERSION" ]; then
  rm -rf "$DATA"; mkdir -p "$DATA"
  # Postgres refuses to run as root, so the cluster belongs to `postgres`
  # where that user exists, and to whoever is running otherwise.
  if id postgres >/dev/null 2>&1 && [ "$(id -u)" = "0" ]; then
    chown -R postgres "$DATA"
    su postgres -c "$PGBIN/initdb -D $DATA -A trust" >/dev/null
  else
    "$PGBIN/initdb" -D "$DATA" -A trust >/dev/null
  fi
fi

AS=""
if id postgres >/dev/null 2>&1 && [ "$(id -u)" = "0" ]; then
  chown -R postgres "$DATA"
  # NOT chmod 755: Postgres refuses to start on a data directory that is
  # group- or world-readable. Only the postgres user connects anyway.
  chmod 700 "$DATA"
  AS="su postgres -c"
fi

# Unix socket only (-h ''). Binding a TCP port means a second run, or
# anything else on the machine, collides on it and the whole SQL layer
# silently skips itself.
OPTS="-k $SOCK -p $PORT -h ''"
# Anything still running from a previous run, stopped first.
stop_old() {
  if [ -f "$DATA/postmaster.pid" ]; then
    if [ -n "$AS" ]; then $AS "$PGBIN/pg_ctl -D $DATA -m immediate stop" >/dev/null 2>&1 || true
    else "$PGBIN/pg_ctl" -D "$DATA" -m immediate stop >/dev/null 2>&1 || true; fi
    sleep 1
  fi
}
start() { [ -n "$AS" ] && $AS "$PGBIN/pg_ctl -D $DATA -o \"$OPTS\" -l $DATA/server.log start" >/dev/null 2>&1 \
                       || "$PGBIN/pg_ctl" -D "$DATA" -o "$OPTS" -l "$DATA/server.log" start >/dev/null 2>&1 || true; }
# "$@", not $*: the readiness probe is `-tAc 'select 1'`, and word
# splitting turned that into three arguments, so psql read "1" as a
# database name and the whole layer reported itself as unavailable.
psqlq() {
  if [ -n "$AS" ]; then
    args=""
    for a in "$@"; do args="$args '$(printf %s "$a" | sed "s/'/'\\\\''/g")'"; done
    su postgres -c "psql -h $SOCK -p $PORT -d postgres -q $args"
  else
    psql -h "$SOCK" -p "$PORT" -d postgres -q "$@"
  fi
}

stop_old
start
i=0; until psqlq -tAc 'select 1' >/dev/null 2>&1 || [ $i -ge 15 ]; do i=$((i+1)); sleep 1; done
if ! psqlq -tAc 'select 1' >/dev/null 2>&1; then
  echo "   (skipped: could not start Postgres on port $PORT)"
  exit 0
fi

# Readable by the postgres user wherever the repo lives.
TMP=/tmp/tb-sql-$$; mkdir -p "$TMP"; cp "$HERE"/*.sql "$TMP"/; chmod -R a+rX "$TMP"

psqlq -v ON_ERROR_STOP=1 -c "do \$\$ begin
  if not exists (select 1 from pg_roles where rolname='anon') then create role anon; end if;
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if;
end \$\$;" >/dev/null

psqlq -v ON_ERROR_STOP=1 -f "$TMP/00_scaffold.sql" >/dev/null
echo "   scaffold built from the live schema"

# Applying the migration IS the first test: a syntax error here is one
# Isaiah would otherwise meet on production.
# The COMBINED file, not the three separately. That is what Isaiah
# actually pastes into the SQL editor, so that is what has to be proven
# to run - joining three files can break on a stray statement boundary
# in a way none of them does alone.
for m in "$HERE"/../../supabase/APPLY-AT-MERGE.sql; do
  cp "$m" "$TMP/"; chmod a+r "$TMP/$(basename "$m")"
  psqlq -v ON_ERROR_STOP=1 -f "$TMP/$(basename "$m")" >/dev/null
  echo "   applied $(basename "$m")"
done

OUT=$(for f in "$TMP"/00?_exercise.sql; do psqlq -f "$f" 2>&1; done | grep -v '^$')
echo "$OUT" | sed 's/^/   /'
rm -rf "$TMP"
# A bare statement that raises prints "ERROR:" and, with ON_ERROR_STOP
# off, carries on. That is not a pass - a mutation that made the function
# raise where it used to return slipped through the whole suite this way.
if echo "$OUT" | grep -qE '^FAIL|ERROR:'; then
  echo "   SQL exercise FAILED"
  exit 1
fi
echo "   $(echo "$OUT" | grep -c '^PASS') SQL checks passed against real Postgres"
