.PHONY: test test-host

test:
	npm test

# Optional Flask Drive proxy / share-token kit (host/).
test-host:
	@test -x host/.venv/bin/pytest || ( \
		python3 -m venv host/.venv && \
		host/.venv/bin/pip install -r host/requirements.txt)
	cd host && PYTHONPATH=. .venv/bin/pytest tests -q
