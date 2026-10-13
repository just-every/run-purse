Purse is free and open source under the MIT licence. It needs Node 22 or later and pnpm 10.12.4, on macOS, Linux or Windows with WSL2.

## Install rer

`rer` is the Run Edit Run command that installs, starts and looks after Purse. Install it once per computer:

```sh
curl -fsSL https://runeditrun.com/install.sh | sh
```

Or with npm:

```sh
npm install -g @runeditrun/rer
```

## Get Purse and start it

```sh
git clone https://github.com/just-every/run-purse.git purse
cd purse && rer dev
```

The first `rer dev` installs everything, sets up a local owner and starts Purse. It can take a few minutes. When Purse is ready it prints two lines:

- `RER_READY` and the address Purse answers on, such as `http://127.0.0.1:8787`.
- `RER_OPEN` and a link that opens Purse signed in as the owner. Treat it like a password: it works only on this computer, and you shouldn't paste it anywhere else.

## Finish setup

The first time you open Purse as the owner it shows **Finish setup**. Check the owner's name and email, tick **I confirm this owner account is ready to use.** and choose **Finish setup**. Purse then opens your purchasing workspace at `/app`.

Until setup is finished, the front page of your Purse shows **Finish setup**. Afterwards it shows **Sign in**.

## Use your own email as the owner

`rer dev` on its own makes a local owner for trying Purse. To be the owner with your own mailbox, set Purse up first:

```sh
rer setup --owner-email you@example.com
rer dev
```

Sign-in links go to the local outbox; `rer outbox` prints its address. Purse sends no email while it runs on your computer.

## Try it as someone else

Each purchasing capability has a local persona: `requester`, `approver`, `buyer` and `receiver`, at the matching `@dev.localhost` address. Save the person and their capability in Settings first, then start Purse as them:

```sh
rer dev --as approver
```

A persona with no saved capability can sign in but can't do any purchasing.

## Stop and start again

```sh
rer dev --stop
```

Your data stays in the checkout. The next `rer dev` starts Purse again on the same port, with everything as you left it. To pick a port yourself, use `rer dev --port 8790`.

## Check your copy

`rer verify` builds Purse and runs its checks. `rer describe` lists every command and flag this copy accepts, and `rer doctor` reports anything missing from your computer.
