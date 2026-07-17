---
name: agentpay-sdk
description: Use when the user asks havliand_agent to install, configure, inspect, or use AgentPay for wallet-backed payments, purchases, gift cards, prepaid cards, onchain transfers, balances, policies, or payment-capable agent workflows.
---

# AgentPay SDK

AgentPay is a local payment capability for agent workflows. havliand_agent treats it as a default built-in capability, but all wallet and payment operations must go through the local `agentpay` command and its daemon. Do not bypass AgentPay's local daemon, wallet storage, policy checks, or approval flow.

## Operating Rules

- Use `agentpay` CLI commands for all AgentPay operations.
- Never ask the user to paste seed phrases, private keys, recovery phrases, raw key material, or wallet secrets into the chat.
- Never print secrets, raw credentials, private keys, access tokens, or decrypted wallet material.
- Before any payment, purchase, transfer, gift card, prepaid card, or irreversible transaction, present a concise confirmation summary and wait for explicit user approval.
- The confirmation summary must include the action, amount, asset, network or rail, recipient or merchant, estimated fees if available, and the exact command or action that will be run.
- If the command itself opens AgentPay's native approval flow, still summarize the intended action first.
- If `agentpay` is not installed, guide the user to install it before attempting wallet or payment operations.
- If AgentPay is installed but not initialized, guide the user through `agentpay admin setup`.
- If a request is ambiguous, ask for the missing payment details instead of guessing.
- If a payment command fails, report the failure and next diagnostic step. Do not retry a payment automatically unless the user explicitly asks.

## Discovery

Start with read-only checks:

```bash
command -v agentpay
agentpay --version
agentpay --help
```

Use `agentpay --help` and subcommand help output to discover the currently installed command surface before using commands. Prefer the installed CLI help over memory.

## Setup

When AgentPay is missing on macOS, the official installer is:

```bash
curl -fsSL https://wlfi.sh | bash
```

After installation, initialize or connect a wallet with:

```bash
agentpay admin setup
```

Wallet setup may require interactive user input. Let the user complete secret or approval steps directly in the terminal or AgentPay UI.

## Payment Workflow

For payment-like tasks:

1. Check that `agentpay` is installed and initialized.
2. Inspect the relevant `agentpay` help for the requested action.
3. Gather missing details: amount, asset, network or rail, recipient or merchant, and purpose.
4. Run only read-only quote, balance, policy, or dry-run commands before approval.
5. Present the confirmation summary.
6. Wait for the user's explicit approval.
7. Run the payment command once.
8. Report the resulting status, transaction identifier, receipt, or error.

Treat payment capability as powerful and stateful. Be useful, but keep the user in control of final authorization.
