VERSION := $(shell cat VERSION)

.PHONY: test build clean

test:
	go test ./...

build:
	go build -trimpath -ldflags "-s -w -X main.version=$(VERSION)" -o freee .

clean:
	rm -f freee
