#!/usr/bin/env bash

set -euo pipefail

REPO="${HAVLIAND_AGENT_REPO:-kk7041/Havliand_Agent}"
VERSION="${HAVLIAND_AGENT_VERSION:-latest}"
INSTALL_ROOT="${HAVLIAND_AGENT_INSTALL_ROOT:-$HOME/.local/share/havliand_agent}"
BIN_DIR="${HAVLIAND_AGENT_BIN_DIR:-$HOME/.local/bin}"

detect_platform() {
	local os
	local arch

	case "$(uname -s)" in
		Darwin)
			os="darwin"
			;;
		Linux)
			os="linux"
			;;
		*)
			echo "Unsupported OS: $(uname -s)" >&2
			exit 1
			;;
	esac

	case "$(uname -m)" in
		arm64|aarch64)
			arch="arm64"
			;;
		x86_64|amd64)
			arch="x64"
			;;
		*)
			echo "Unsupported architecture: $(uname -m)" >&2
			exit 1
			;;
	esac

	printf "%s-%s" "$os" "$arch"
}

download() {
	local url="$1"
	local out="$2"

	if command -v curl >/dev/null 2>&1; then
		curl -fL "$url" -o "$out"
	elif command -v wget >/dev/null 2>&1; then
		wget -O "$out" "$url"
	else
		echo "curl or wget is required" >&2
		exit 1
	fi
}

asset_base_url() {
	if [[ "$VERSION" == "latest" ]]; then
		printf "https://github.com/%s/releases/latest/download" "$REPO"
	else
		printf "https://github.com/%s/releases/download/%s" "$REPO" "$VERSION"
	fi
}

verify_checksum() {
	local asset="$1"
	local sums="$2"

	if command -v sha256sum >/dev/null 2>&1; then
		(cd "$(dirname "$sums")" && grep "  $asset\$" SHA256SUMS | sha256sum -c -)
	elif command -v shasum >/dev/null 2>&1; then
		(cd "$(dirname "$sums")" && grep "  $asset\$" SHA256SUMS | shasum -a 256 -c -)
	else
		echo "Skipping checksum verification: sha256sum or shasum not found" >&2
	fi
}

platform="$(detect_platform)"
asset="havliand_agent-$platform.tar.gz"
base_url="$(asset_base_url)"
tmp_dir="$(mktemp -d)"
trap 'rm -rf "$tmp_dir"' EXIT

echo "Downloading $asset..."
download "$base_url/$asset" "$tmp_dir/$asset"
download "$base_url/SHA256SUMS" "$tmp_dir/SHA256SUMS"
verify_checksum "$asset" "$tmp_dir/SHA256SUMS"

mkdir -p "$INSTALL_ROOT" "$BIN_DIR"
tar -xzf "$tmp_dir/$asset" -C "$tmp_dir"

target="$INSTALL_ROOT/release"
rm -rf "$target"
mv "$tmp_dir/havliand_agent" "$target"
ln -sfn "$target/havliand_agent" "$BIN_DIR/havliand_agent"

echo "Installed havliand_agent to $target"
echo "Command: $BIN_DIR/havliand_agent"

case ":$PATH:" in
	*":$BIN_DIR:"*)
		;;
	*)
		echo "Add $BIN_DIR to PATH to run havliand_agent from any directory."
		;;
esac

echo "Run: havliand_agent"
