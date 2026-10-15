#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent / "lib"))
from greeting import greet  # noqa: E402

request = json.loads(sys.stdin.readline() or "{}")
print(json.dumps({"results": [{"title": greet(request.get("query", ""))}]}))
