# Containerization

havliand_agent runs with all permissions by default, but in some cases, you will want to have more control over what directories havliand_agent can write to and which accesses it has.

The usual pattern is to run the whole `havliand_agent` process inside an isolated environment.

## Choose a pattern

| Pattern | What is isolated | Best for | Notes |
| --- | --- | --- | --- |
| Plain Docker | Whole `havliand_agent` process in a local container | Simple local isolation | Provider API keys enter the container. |
| OpenShell | Whole `havliand_agent` process in a policy-controlled sandbox | Local or remote managed sandbox | Requires an OpenShell gateway |

## Plain Docker

Run the whole `havliand_agent` process in Docker when you want the simplest local container boundary.

`Dockerfile.havliand_agent`:

```dockerfile
FROM node:24-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends bash ca-certificates git ripgrep \
  && rm -rf /var/lib/apt/lists/*
RUN npm install -g --ignore-scripts @havliand_agent/coding-agent

WORKDIR /workspace
ENTRYPOINT ["havliand_agent"]
```

Build and run:

```bash
docker build -t havliand_agent-sandbox -f Dockerfile.havliand_agent .

docker run --rm -it \
  -e ANTHROPIC_API_KEY \
  -v "$PWD:/workspace" \
  -v havliand_agent-home:/root/.havliand_agent/agent \
  havliand_agent-sandbox
```

The `-v "$PWD:/workspace"` mounts your current directory into the container at `/workspace` such that reads and writes in `/workspace` inside Docker directly affect your host files.

Use a named volume for `/root/.havliand_agent/agent` if you want container-local settings and sessions. Mounting your host `~/.havliand_agent/agent` exposes host auth and session files to the container.

## OpenShell

Use [NVIDIA OpenShell](https://docs.nvidia.com/openshell/about/overview) when you want a policy-controlled sandbox with filesystem, process, network, credential, and inference controls.
OpenShell can run sandboxes through a local gateway backed by Docker, Podman, or a VM runtime, or through a remote Kubernetes gateway.

Every sandbox requires an active gateway.
Register and select one before creating a sandbox:

```bash
openshell gateway add <gateway-url> --name <name>
openshell gateway select <name>
```

Launch `havliand_agent` inside an OpenShell sandbox:

```bash
openshell sandbox create --name havliand_agent-sandbox --from havliand_agent -- havliand_agent
```

In this pattern, the whole `havliand_agent` process runs inside the sandbox.
Built-in tools, `!` commands, and extension tools execute inside the OpenShell boundary.

If the gateway is remote, project files are not bind-mounted from the host, meaning writes in the sandbox are not reflected on your machine.
Clone the repository inside the sandbox or use OpenShell file transfer commands:

```bash
openshell sandbox upload havliand_agent-sandbox ./repo /workspace
openshell sandbox download havliand_agent-sandbox /workspace/repo ./repo-out
```

OpenShell providers can keep raw model API keys outside the sandbox.
When inference routing is configured, code inside the sandbox can call `https://inference.local`, and the gateway injects the configured provider credentials upstream.
Configure havliand_agent to use the corresponding OpenAI-compatible or Anthropic-compatible endpoint if you want model traffic to use this route.
