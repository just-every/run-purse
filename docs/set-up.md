Everything here is in the **Settings** tab, which only the owner sees. Do it once, before the first request.

## Business codes

Under **Business and authority**, fill in:

| Field | What it holds | Example |
| --- | --- | --- |
| Business name | The name in the top bar and at the top of the Overview | Redbud Outdoor Co. |
| currencies (comma separated) | Every currency you buy in | USD |
| locations (comma separated) | Where things are delivered | Austin, TX, Columbus, OH |
| costCentres (comma separated) | Who pays: the teams the request thread filters by | Operations, Marketing |
| projects (comma separated) | What it's for; each policy budget covers one or more | Operations, Marketing |

Choose **Save business**. Requests pick from these lists, so add a code here before anyone needs it.

## People and capabilities

Each person gets one or more purchasing capabilities:

| Capability | What it lets them do |
| --- | --- |
| requester | Draft requests, attach evidence and submit them for approval |
| approver | Approve, return or reject requests within their policies |
| buyer | Keep suppliers and the catalogue, generate and issue purchase orders, record invoices, download the accounting CSV |
| receiver | Record deliveries, rejections and returns against issued orders |

Under **People**, enter the person's name, email and capabilities (for example `requester, receiver`), keep them **Active** and choose **Save member**. Then, under **Invite saved member**, enter their email and choose **Send local invitation**. They sign in from the link in the local outbox.

A person who signs in without a saved capability sees the workspace but can't do any purchasing. The owner keeps owner access.

## Approval policies

A policy says who may approve what. Under **Approval policies**, set:

- **Policy name** and **Approver email**.
- **Currency**, then the **Category** and **Project** it covers. `*` means all.
- **Authority limit**: the largest single request this approver may approve, entered as currency text, for example `10,000.00` for AUD 10,000.00.
- **Budget**: the total this policy may approve, entered as a currency amount.

Every line of a request must match the policy's category and project. Nobody can approve their own request. Two approvals made at the same moment can't spend past the budget.

To change a policy, choose **Edit policy** beside it.

## Delegation

When an approver is away, the owner can hand their authority to someone else for a while. Under **Delegation**, choose the policy, enter the **Delegate email**, when it **Expires** and the **Reason**, then **Delegate approval**. The delegation ends at its expiry. Decisions made under it say so in the request's **Decision history**.

Approvers can delegate their own policies and revoke them from the **Authority** tab.
