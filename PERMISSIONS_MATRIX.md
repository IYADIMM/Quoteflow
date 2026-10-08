# Permission Matrix

| Capability | Owner | Admin | Sales manager | Sales rep | Viewer |
|---|:---:|:---:|:---:|:---:|:---:|
| Read tenant workspace | ✓ | ✓ | ✓ | ✓ | ✓ |
| Create customer/RFQ/quote/follow-up | ✓ | ✓ | ✓ | ✓ | — |
| Edit catalog/settings | ✓ | ✓ | ✓ | — | — |
| Approve controlled quote | ✓ | ✓ | ✓ | — | — |
| Send/revise own tenant quote | ✓ | ✓ | ✓ | ✓, subject to approval | — |
| Revoke public link | ✓ | ✓ | ✓ | — | — |
| Invite standard roles | ✓ | ✓ | ✓ | — | — |
| Invite Admin | ✓ | — | — | — | — |
| Manage billing | ✓ | ✓ | — | — | — |
| Export/delete organization | ✓ | — | — | — | — |

Every object lookup is expected to include the active session organization. The API derives the role from current membership on each request. Frontend visibility is convenience only; server checks are authoritative. Member removal and role editing have server APIs with owner protection; ownership transfer is not yet exposed.
