# SPDX-License-Identifier: GPL-3.0-or-later
import argparse
import sys

from . import VERSION
from .commands import COMMANDS, Context, status
from .ui import CliError, bad


def build_parser():
    parser = argparse.ArgumentParser(prog="qryg", description="QryG Search configuration tool.")
    parser.add_argument("--version", action="version", version=f"qryg {VERSION}")
    subcommands = parser.add_subparsers(dest="command", metavar="command")
    for spec in COMMANDS:
        sub = subcommands.add_parser(spec["name"], help=spec["help"], aliases=spec["aliases"])
        for name, options in spec["arguments"]:
            sub.add_argument(*(name if isinstance(name, tuple) else (name,)), **options)
        sub.set_defaults(run=spec["run"])
    return parser


def main(argv=None):
    parser = build_parser()
    args = parser.parse_args(argv)
    try:
        context = Context()
        if not args.command:
            status(context, args)
            print()
            parser.print_help()
            return 0
        args.run(context, args)
        return 0
    except (CliError, OSError) as error:
        bad(str(error))
        return 1
    except KeyboardInterrupt:
        return 130
