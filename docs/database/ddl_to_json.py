"""Converte schema.sql no formato JSON aceito pelas ferramentas da skill database-designer.

Usa o próprio SQLite para interpretar o DDL (PRAGMA table_info / foreign_key_list / index_list),
contornando o parser por regex do schema_analyzer.py, que corta tabelas no primeiro ')' (ex.: VARCHAR(40)).

Uso: python ddl_to_json.py schema.sql schema.json [--cardinality 500]
"""
import json
import sqlite3
import sys


def convert(ddl_path: str, out_path: str, users: int = 500) -> None:
    con = sqlite3.connect(':memory:')
    con.executescript(open(ddl_path, encoding='utf-8').read())

    tables = {}
    names = [r[0] for r in con.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")]
    for t in names:
        fks = {r[3]: f'{r[2]}.{r[4]}' for r in con.execute(f'PRAGMA foreign_key_list({t})')}
        uniques, indexes = [], []
        for _, idx_name, is_unique, origin, _ in con.execute(f'PRAGMA index_list({t})'):
            cols = [r[2] for r in con.execute(f'PRAGMA index_info({idx_name})')]
            if origin == 'pk':
                continue
            if is_unique:
                uniques.append(cols)
            # Índices UNIQUE também servem de índice de busca (prefixo à esquerda)
            indexes.append({'name': idx_name, 'columns': cols})

        info = list(con.execute(f'PRAGMA table_info({t})'))
        single_pk = sum(1 for r in info if r[5]) == 1
        cols, pk = {}, []
        for _, name, ctype, notnull, default, pk_pos in info:
            col = {'type': ctype.upper(), 'nullable': not notnull and not pk_pos,
                   'unique': (bool(pk_pos) and single_pk) or [name] in uniques,
                   'cardinality_estimate': users}
            if name in fks:
                col['foreign_key'] = fks[name]
            if default is not None:
                col['default'] = default
            cols[name] = col
            if pk_pos:
                pk.append((pk_pos, name))
        tables[t] = {
            'columns': cols,
            'primary_key': [n for _, n in sorted(pk)],
            'unique_constraints': uniques,
            'check_constraints': {},
            'indexes': indexes,
        }

    with open(out_path, 'w', encoding='utf-8') as f:
        json.dump({'tables': tables}, f, indent=2, ensure_ascii=False)
    print(f'{len(tables)} tabelas -> {out_path}')


if __name__ == '__main__':
    card = int(sys.argv[sys.argv.index('--cardinality') + 1]) if '--cardinality' in sys.argv else 500
    convert(sys.argv[1], sys.argv[2], card)
