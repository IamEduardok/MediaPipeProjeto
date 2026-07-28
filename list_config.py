"""
Utilitário de linha de comando para inspecionar e editar o config.db.

Uso:
    python list_config.py
        -> lista toda a config e os mapeamentos de gesto atuais

    python list_config.py set pinch_threshold 0.3
        -> altera um valor de config (ex: sensibilidade da pinça)

    python list_config.py map Pinca select
        -> altera a ação disparada por um gesto
"""

import sys

import db


def main() -> None:
    db.init_db()
    args = sys.argv[1:]

    if not args:
        print("== Config ==")
        for key in db.DEFAULT_CONFIG:
            print(f"  {key} = {db.get_config(key)}")

        print("== Gesture mappings ==")
        for gesture, info in db.get_all_mappings().items():
            status = "ativo" if info["enabled"] else "desativado"
            print(f"  {gesture} -> {info['action']} ({status})")
        return

    if args[0] == "set" and len(args) == 3:
        db.set_config(args[1], args[2])
        print(f"config.{args[1]} = {args[2]}")
    elif args[0] == "map" and len(args) == 3:
        db.set_mapping(args[1], args[2])
        print(f"mapping.{args[1]} -> {args[2]}")
    else:
        print(__doc__)


if __name__ == "__main__":
    main()
