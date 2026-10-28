.PHONY: hooks test

hooks:
	git config core.hooksPath .githooks
	@echo "core.hooksPath=.githooks (prepare-commit-msg bumps Change Log + version)"

test:
	npm test
