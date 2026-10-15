UUID := qryg-search@ru-dr
JS := $(shell find lib plugins prefs examples -name '*.js') extension.js prefs.js

.PHONY: check lint test syntax schema install link zip clean

check: syntax schema lint test

syntax:
	@for f in $(JS); do node --check $$f || exit 1; done
	@python3 -m py_compile bin/qryg-search cli/qryg_search/*.py scripts/*.py examples/plugins/*/*.py
	@echo "syntax ok"

schema:
	@glib-compile-schemas --strict --dry-run schemas/
	@echo "schema ok"

lint:
	@npx --no-install eslint lib plugins prefs examples tests extension.js prefs.js eslint.config.js
	@echo "lint ok"

test:
	@node --test tests/*.test.mjs
	@python3 -m unittest discover -s tests -p 'test_*.py'

install:
	@./bin/qryg-search install

link:
	@./bin/qryg-search install --link

zip:
	@rm -f $(UUID).shell-extension.zip
	@glib-compile-schemas schemas/
	@zip -qr $(UUID).shell-extension.zip extension.js prefs.js metadata.json stylesheet.css LICENSE lib prefs plugins schemas
	@echo "built $(UUID).shell-extension.zip"

clean:
	@rm -f $(UUID).shell-extension.zip schemas/gschemas.compiled
