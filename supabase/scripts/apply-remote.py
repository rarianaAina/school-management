#!/usr/bin/env python3
"""Applique les migrations locales au projet Supabase distant via l'API Management.

Le CLI exigerait le mot de passe de la base ; l'API Management se contente du
jeton d'accès. Chaque migration appliquée est enregistrée dans
supabase_migrations.schema_migrations pour que `supabase db push` reste cohérent
ensuite.
"""
import io
import json
import os
import pathlib
import sys
import urllib.error
import urllib.request

TOKEN = os.environ["SUPABASE_ACCESS_TOKEN"]
REF = os.environ.get("PROJECT_REF", "octtjvuplxhgpwzlqnuc")
URL = f"https://api.supabase.com/v1/projects/{REF}/database/query"
MIGRATIONS = sorted(pathlib.Path("supabase/migrations").glob("*.sql"))


def run(sql: str):
    payload = json.dumps({"query": sql}).encode()
    request = urllib.request.Request(
        URL,
        data=payload,
        headers={
            "Authorization": f"Bearer {TOKEN}",
            "Content-Type": "application/json",
            # Sans User-Agent explicite, Cloudflare rejette la requete (code 1010).
            "User-Agent": "scolaria-migrator/1.0",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=180) as response:
            return True, response.read().decode()
    except urllib.error.HTTPError as error:
        return False, error.read().decode()


print("→ table de suivi des migrations")
ok, out = run(
    "create schema if not exists supabase_migrations;"
    " create table if not exists supabase_migrations.schema_migrations"
    " (version text primary key, statements text[], name text);"
)
if not ok:
    print("ÉCHEC:", out)
    sys.exit(1)

# Ne rejoue pas ce qui est deja enregistre : les migrations ne sont pas idempotentes.
ok, out = run("select version from supabase_migrations.schema_migrations;")
already = set()
if ok:
    try:
        already = {row["version"] for row in json.loads(out)}
    except Exception:
        pass
if already:
    print(f"   deja appliquees : {len(already)}")

applied, failed, skipped = [], [], []

for path in MIGRATIONS:
    version = path.name.split("_")[0]
    name = path.name[len(version) + 1 : -4]
    if version in already:
        skipped.append(path.name)
        continue

    sql = io.open(path, encoding="utf-8").read()

    print(f"→ {path.name}", flush=True)
    ok, out = run(sql)

    if not ok:
        print(f"   ÉCHEC : {out[:600]}")
        failed.append((path.name, out))
        break

    ok_reg, out_reg = run(
        "insert into supabase_migrations.schema_migrations (version, name) "
        f"values ('{version}', '{name}') on conflict (version) do nothing;"
    )
    if not ok_reg:
        print(f"   enregistrement impossible : {out_reg[:300]}")

    applied.append(path.name)
    print("   ok")

print()
print(f"Appliquées : {len(applied)} — ignorées (déjà en place) : {len(skipped)}")
if failed:
    print(f"Bloquée sur : {failed[0][0]}")
    sys.exit(1)
