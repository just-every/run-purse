Old reference: `307e18f93d730cd31c41d4fdacdb9c4f2dd1a842`.

| Clause | Point | Outcome | Asserting test | Result |
| --- | --- | --- | --- | --- |
| PUR-001 | 1. | Configured receiver capabilities survive a native state read. | `tests/purse.test.mjs:7` | asserted |
| PUR-001 | 1. | All configured capabilities. | none | none |
| PUR-001 | 1. | data after setup rerun. | none | none |
| PUR-001 | 1. | All configured capabilities. | none | none |
| PUR-001 | 1. | data after restart. | none | none |
| PUR-002 | 1. | Supplier creation. | `tests/purse.test.mjs:8` | asserted |
| PUR-002 | 1. | preference. | `tests/purse.test.mjs:8` | asserted |
| PUR-002 | 1. | blocking produce audit history. | `tests/purse.test.mjs:8` | asserted |
| PUR-002 | 1. | Blocked submission returns the recorded reason. | none | none |
| PUR-002 | 1. | Blocked approval returns the recorded reason. | none | none |
| PUR-002 | 1. | Blocked conversion returns the recorded reason. | none | none |
| PUR-002 | 1. | Blocked issuance returns the recorded reason. | none | none |
| PUR-003 | 1. | The copied request unit price remains the original value after catalogue edit. | `tests/purse.test.mjs:9` | asserted |
| PUR-003 | 1. | Approved revision retains that price. | none | none |
| PUR-003 | 1. | The resulting PO retains that price. | none | none |
| PUR-004 | 1. | Original attachment bytes download unchanged. | `tests/purse.test.mjs:10` | asserted |
| PUR-004 | 1. | Every retained revision is read. | none | none |
| PUR-004 | 1. | compared. | none | none |
| PUR-004 | 1. | Invalid quantities are refused. | `tests/purse.test.mjs:10` | asserted |
| PUR-004 | 1. | Invalid dates are refused without writes. | none | none |
| PUR-005 | 1. | Comparison retains both currencies separately. | `tests/purse.test.mjs:11` | asserted |
| PUR-005 | 1. | Missing freight is shown explicitly. | `tests/purse.test.mjs:43` | asserted |
| PUR-006 | 1. | Wrong exact revision is refused. | `tests/purse.test.mjs:12` | asserted |
| PUR-006 | 1. | Self approval is refused. | `tests/purse.test.mjs:12` | asserted |
| PUR-006 | 1. | Concurrent reservations accept one. | `tests/purse.test.mjs:12` | asserted |
| PUR-006 | 1. | refuse one. | `tests/purse.test.mjs:12` | asserted |
| PUR-006 | 1. | The resulting reservation equals the one accepted purchase. | `tests/purse.test.mjs:12` | asserted |
| PUR-007 | 1. | Return reason is retained. | `tests/purse.test.mjs:13` | asserted |
| PUR-007 | 1. | Resubmission makes revision two. | `tests/purse.test.mjs:13` | asserted |
| PUR-007 | 1. | An eligible delegated approval is retained. | none | none |
| PUR-007 | 1. | Elapsed expiry refuses the delegate. | none | none |
| PUR-007 | 1. | The entire decision history is read back. | none | none |
| PUR-008 | 1. | Concurrent conversion returns one success. | `tests/purse.test.mjs:14` | asserted |
| PUR-008 | 1. | one conflict. | `tests/purse.test.mjs:14` | asserted |
| PUR-008 | 1. | The downloaded document contains its purchased item. | `tests/purse.test.mjs:14` | asserted |
| PUR-008 | 1. | Exactly one allocation record exists after the race. | none | none |
| PUR-009 | 1. | Old issuance remains marked amended with its issuance time. | `tests/purse.test.mjs:15` | asserted |
| PUR-009 | 1. | Supplier-directory edit cannot rewrite the frozen supplier. | none | none |
| PUR-009 | 1. | Supplier. | none | none |
| PUR-009 | 1. | cost amendment requires renewed approval. | none | none |
| PUR-009 | 1. | The amendment reservation amount is read back. | none | none |
| PUR-010 | 1. | Partial receiving leaves the expected outstanding quantity. | `tests/purse.test.mjs:16` | asserted |
| PUR-010 | 1. | Rejection is retained with its reason. | none | none |
| PUR-010 | 1. | Beyond-authority return preserves the explicit review hold. | none | none |
| PUR-010 | 1. | Cancellation releases the commitment. | `tests/purse.test.mjs:16` | asserted |
| PUR-010 | 1. | Overreceipt is refused. | `tests/purse.test.mjs:16` | asserted |
| PUR-010 | 1. | Repeated return is refused. | `tests/purse.test.mjs:16` | asserted |
| PUR-010 | 1. | Wrong-role receipt is refused. | `tests/purse.test.mjs:16` | asserted |
| PUR-010 | 1. | All outstanding. | none | none |
| PUR-010 | 1. | commitment terms reconcile through the full sequence. | none | none |
| PUR-011 | 1. | Identical invoice re-entry returns the original identity. | `tests/purse.test.mjs:20` | asserted |
| PUR-011 | 1. | Conflicting invoice re-entry is refused. | `tests/purse.test.mjs:20` | asserted |
| PUR-011 | 1. | CSV contains the invoice once with its original amount. | `tests/purse.test.mjs:20` | asserted |
| PUR-011 | 1. | Price. | `tests/purse.test.mjs:17` | asserted |
| PUR-011 | 1. | receipt discrepancies are read back. | `tests/purse.test.mjs:17` | asserted |
| PUR-011 | 1. | One invoice allocation across several POs is asserted. | none | none |
| PUR-012 | 1. | Every retained domain record is compared after restore. | `tests/browser-archive.mjs:19` | asserted |
| PUR-012 | 1. | Original file bytes are compared after restore. | none | none |
| PUR-012 | 1. | Corrupt semantic restore leaves every portable row unchanged. | `tests/browser-archive.mjs:44` | asserted |
| PUR-012 | 1. | Nonempty destination restore leaves all rows unchanged. | none | none |
| PUR-013 | 1. | Preview writes no import job. | `tests/purse.test.mjs:22` | asserted |
| PUR-013 | 1. | Changed input requires a new review. | `tests/purse.test.mjs:23` | asserted |
| PUR-013 | 1. | Commit retains exact original CSV bytes. | `tests/purse.test.mjs:23` | asserted |
| PUR-013 | 1. | Replayed commit creates one source record. | `tests/purse.test.mjs:23` | asserted |
| PUR-013 | 1. | An unfinished batch actually resumes to completion. | none | none |
| PUR-013 | 1. | Undo preserves edited. | `tests/purse.test.mjs:25` | asserted |
| PUR-013 | 1. | downstream-used targets. | `tests/purse.test.mjs:25` | asserted |
| PUR-014 | 1. | Each of the five workflows prepares. | `tests/purse.test.mjs:26` | asserted |
| PUR-014 | 1. | edits a downloadable draft. | `tests/purse.test.mjs:26` | asserted |
| PUR-014 | 1. | The downloaded draft contains the reviewed text. | `tests/purse.test.mjs:26` | asserted |
| PUR-014 | 1. | Wrong-role execution leaves receipts unchanged. | `tests/purse.test.mjs:27` | asserted |
| PUR-014 | 1. | Stale-input execution leaves the proposed action unexecuted. | `tests/purse.test.mjs:27` | asserted |
| PUR-015 | 1. | Every named RER verb is exercised from a fresh clone on the same installation. | none | none |
| PUR-016 | 1. | Decimal quantity rounds half-up to thirteen minor units. | `tests/purse.test.mjs:28` | asserted |
| PUR-016 | 1. | Currency text produces exact freight. | `tests/purse.test.mjs:38` | asserted |
| PUR-016 | 1. | tax. | `tests/purse.test.mjs:38` | asserted |
| PUR-016 | 1. | line totals. | `tests/purse.test.mjs:38` | asserted |
| PUR-016 | 1. | Invalid currency representations leave all domain rows unchanged. | `tests/purse.test.mjs:52` | asserted |
| PUR-016 | 1. | Every original ledger row remains unchanged after amendment. | none | none |
| PUR-017 | 1. | Signed-out state read is refused. | `tests/purse.test.mjs:67` | asserted |
| PUR-017 | 1. | Forged actor. | `tests/purse.test.mjs:67` | asserted |
| PUR-017 | 1. | role cannot create a supplier. | `tests/purse.test.mjs:67` | asserted |
| PUR-017 | 1. | Cross-record attachment read is refused. | `tests/purse.test.mjs:67` | asserted |
| PUR-017 | 1. | Revoked session accounting download is refused. | `tests/purse.test.mjs:67` | asserted |
| PUR-017 | 1. | Every command. | none | none |
| PUR-017 | 1. | every download is checked for every named refusal. | none | none |
| PUR-017 | 1. | no mutation. | none | none |
| ACCESS-001 | 1. | Each declared content role sees the permitted request. | `tests/access.test.mjs:9` | asserted |
| ACCESS-001 | 1. | excludes the other scope. | `tests/access.test.mjs:9` | asserted |
| ACCESS-001 | 1. | Each role’s permitted. | `tests/access.test.mjs:10` | asserted |
| ACCESS-001 | 1. | forbidden PO document reads are checked. | `tests/access.test.mjs:10` | asserted |
| ACCESS-001 | 1. | Department approver cannot decide outside scope. | `tests/access.test.mjs:16` | asserted |
| ACCESS-001 | 1. | Auditor mutating commands are refused. | `tests/access.test.mjs:27` | asserted |
| ACCESS-001 | 1. | Grant. | `tests/access.test.mjs:76` | asserted |
| ACCESS-001 | 1. | revocation events are retained. | `tests/access.test.mjs:76` | asserted |
| ACCESS-001 | 1. | The web role matrix at both widths covers every promised right. | none | none |
| ACCESS-001 | 2. | Receiving lead has only the assigned PO. | `tests/access.test.mjs:18` | asserted |
| ACCESS-001 | 2. | no invoice projection. | `tests/access.test.mjs:18` | asserted |
| ACCESS-001 | 2. | Its approval. | `tests/access.test.mjs:19` | asserted |
| ACCESS-001 | 2. | invoice creation. | `tests/access.test.mjs:19` | asserted |
| ACCESS-001 | 2. | foreign-location receipt are refused. | `tests/access.test.mjs:19` | asserted |
| ACCESS-001 | 2. | Its private attachment read is refused. | `tests/access.test.mjs:20` | asserted |
| ACCESS-001 | 2. | Its permitted receipt is read back after creation. | none | none |
| ACCESS-001 | 3. | Role dollar. | `tests/access.test.mjs:65` | asserted |
| ACCESS-001 | 3. | percentage limits are retained. | `tests/access.test.mjs:65` | asserted |
| ACCESS-001 | 3. | A person zero limit is recorded in audit. | `tests/access.test.mjs:72` | asserted |
| ACCESS-001 | 3. | Every promised role. | none | none |
| ACCESS-001 | 3. | person conversion outcome is asserted on the web. | none | none |
| ACCESS-001 | 3. | API. | none | none |
| ACCESS-004 | 1. | Department report rows. | `tests/access.test.mjs:29` | asserted |
| ACCESS-004 | 1. | choices are confined to Facilities. | `tests/access.test.mjs:29` | asserted |
| ACCESS-004 | 1. | The forbidden department has no rows. | `tests/access.test.mjs:30` | asserted |
| ACCESS-004 | 1. | Every requested figure equals its permitted source sum. | none | none |
| ACCESS-004 | 1. | Entity-scope report results are independently asserted. | none | none |
| ACCESS-004 | 2. | Permitted sources appear. | `tests/access.test.mjs:29` | asserted |
| ACCESS-004 | 2. | forbidden source identities are absent. | `tests/access.test.mjs:29` | asserted |
| ACCESS-004 | 2. | The full report web projection is compared at both widths. | none | none |
| ACCESS-004 | 3. | AP. | `tests/access.test.mjs:32` | asserted |
| ACCESS-004 | 3. | finance. | `tests/access.test.mjs:32` | asserted |
| ACCESS-004 | 3. | auditor report reads succeed. | `tests/access.test.mjs:32` | asserted |
| ACCESS-004 | 3. | exclude private source identities. | `tests/access.test.mjs:32` | asserted |
| ACCESS-004 | 3. | Requester. | `tests/access.test.mjs:33` | asserted |
| ACCESS-004 | 3. | approver. | `tests/access.test.mjs:33` | asserted |
| ACCESS-004 | 3. | receiver. | `tests/access.test.mjs:33` | asserted |
| ACCESS-004 | 3. | custom lead report reads are refused. | `tests/access.test.mjs:33` | asserted |
| ACCESS-005 | 1. | AP source-risk. | none | none |
| ACCESS-005 | 1. | approval outcomes are all asserted under the new role. | none | none |
| ACCESS-005 | 2. | Every private original. | none | none |
| ACCESS-005 | 2. | confirmation. | none | none |
| ACCESS-005 | 2. | remit-retention. | none | none |
| ACCESS-005 | 2. | hold outcome is asserted under the new role. | none | none |
| ACCESS-005 | 3. | A read-only RFQ role has no reissue control. | `tests/browser-access-sources.mjs:4` | asserted |
| ACCESS-005 | 3. | All named RFQ configuration. | none | none |
| ACCESS-005 | 3. | invitation. | none | none |
| ACCESS-005 | 3. | history. | none | none |
| ACCESS-005 | 3. | award. | none | none |
| ACCESS-005 | 3. | original branches are asserted for every new scope. | none | none |
| ACCESS-005 | 4. | Reasoned held-mail assignment. | none | none |
| ACCESS-005 | 4. | completion retain all named new-role source boundaries. | none | none |
| ACCESS-005 | 5. | AP. | none | none |
| ACCESS-005 | 5. | finance reveal grants are demonstrated independently. | none | none |
| ACCESS-005 | 5. | Auditor projection remains masked. | `tests/access.test.mjs:12` | asserted |
| ACCESS-005 | 6. | The permitted legacy-evidence re-entry grant is demonstrated. | none | none |
| ACCESS-005 | 6. | Auditor legacy re-entry is refused. | none | none |
| INTAKE-001 | 1. | Conditional question hides. | `tests/browser-guided-intake.mjs:24` | asserted |
| INTAKE-001 | 1. | reveals the security answer. | `tests/browser-guided-intake.mjs:24` | asserted |
| INTAKE-001 | 1. | The approval preview names the applicable route. | `tests/browser-guided-intake.mjs:34` | asserted |
| INTAKE-001 | 1. | The frozen revision retains its answer. | `tests/browser-guided-intake.mjs:38` | asserted |
| INTAKE-001 | 1. | custom field. | `tests/browser-guided-intake.mjs:38` | asserted |
| INTAKE-001 | 1. | exact-cent allocations. | `tests/browser-guided-intake.mjs:38` | asserted |
| INTAKE-001 | 1. | file. | `tests/browser-guided-intake.mjs:38` | asserted |
| INTAKE-001 | 2. | Pending-supplier form is offered. | `tests/browser-guided-intake.mjs:42` | asserted |
| INTAKE-001 | 2. | can be saved. | `tests/browser-guided-intake.mjs:42` | asserted |
| INTAKE-001 | 2. | Route preview displays the new-supplier step. | `tests/browser-guided-intake.mjs:44` | asserted |
| INTAKE-001 | 2. | Pending supplier identity. | none | none |
| INTAKE-001 | 2. | status are independently read back from the saved draft. | none | none |
| INTAKE-001 | 3. | Publish requires unrestricted administrator rights. | none | none |
| INTAKE-001 | 3. | exact versioned consent. | none | none |
| INTAKE-001 | 4. | Every conditional. | none | none |
| INTAKE-001 | 4. | required-file. | none | none |
| INTAKE-001 | 4. | coding. | none | none |
| INTAKE-001 | 4. | custom-value invalid case is refused at submission. | none | none |
| INTAKE-001 | 4. | Frozen values retain exact-cent split arithmetic. | `tests/browser-guided-intake.mjs:38` | asserted |
| INTAKE-001 | 5. | Preview creates no budget reservation. | none | none |
| INTAKE-001 | 5. | Submission independently rechecks changed policy authority. | none | none |
| INTAKE-001 | 6. | Pending proposal’s status. | none | none |
| INTAKE-001 | 6. | review step persist after submission. | none | none |
| INTAKE-001 | 6. | Purchase approval alone cannot make the pending supplier purchasable. | none | none |
| INTAKE-001 | 7. | Only permitted supplier administrators resolve eligibility. | none | none |
| INTAKE-009 | 1. | Fresh sign-in retains the saved answer. | `tests/browser-guided-intake.mjs:32` | asserted |
| INTAKE-009 | 1. | exact file bytes. | `tests/browser-guided-intake.mjs:32` | asserted |
| INTAKE-009 | 1. | No purchase request exists for the unfinished draft. | `tests/browser-guided-intake.mjs:28` | asserted |
| INTAKE-009 | 2. | Automatic save is independently demonstrated before an explicit Save action. | none | none |
| INTAKE-010 | 1. | Two eligible lines remain after the restricted item is excluded. | `tests/purse.test.mjs:156` | asserted |
| INTAKE-010 | 2. | Current price before/after values are returned. | `tests/purse.test.mjs:156` | asserted |
| INTAKE-010 | 3. | Inactive project omission is asserted. | `tests/purse.test.mjs:179` | asserted |
| INTAKE-010 | 4. | Selected attachment bytes. | `tests/purse.test.mjs:166` | asserted |
| INTAKE-010 | 4. | new identities are compared. | `tests/purse.test.mjs:166` | asserted |
| INTAKE-010 | 5. | No commitments are copied onto the new request. | `tests/browser-request-again.mjs:79` | asserted |
| INTAKE-010 | 5. | Every other listed lineage. | none | none |
| INTAKE-010 | 5. | authority field is absent. | none | none |
| INTAKE-010 | 6. | Every source-change eligibility branch forces a new review. | none | none |
| INTAKE-010 | 7. | Split/custom-value obsolete-value. | none | none |
| INTAKE-010 | 7. | price rescaling outcomes are all read back. | none | none |
| INTAKE-004 | 1. | Known member email retains a prefilled draft. | `tests/email-intake.test.mjs:39` | asserted |
| INTAKE-004 | 1. | its subject/body. | `tests/email-intake.test.mjs:39` | asserted |
| INTAKE-004 | 1. | Draft-link mail names that intake. | `tests/email-intake.test.mjs:43` | asserted |
| INTAKE-004 | 1. | its requester. | `tests/email-intake.test.mjs:43` | asserted |
| INTAKE-004 | 1. | Unknown sender mail is held. | `tests/email-intake.test.mjs:69` | asserted |
| INTAKE-004 | 2. | Original provider record downloads byte for byte. | `tests/email-intake.test.mjs:49` | asserted |
| INTAKE-004 | 2. | The attachment downloads byte for byte. | `tests/email-intake.test.mjs:51` | asserted |
| INTAKE-004 | 2. | Another requester cannot read the unknown source. | `tests/email-intake.test.mjs:72` | asserted |
| INTAKE-004 | 2. | Assignment requires a reason. | `tests/email-intake.test.mjs:76` | asserted |
| INTAKE-004 | 2. | Assignment makes the source available to the assigned requester. | `tests/email-intake.test.mjs:79` | asserted |
| INTAKE-004 | 2. | The recorded assignment reason is read back. | none | none |
| INTAKE-004 | 2. | Editing retains original source text. | `tests/email-intake.test.mjs:56` | asserted |
| INTAKE-004 | 2. | Completion creates one requester-owned draft with exact amount. | `tests/email-intake.test.mjs:61` | asserted |
| INTAKE-004 | 2. | Completion does not itself submit that draft. | `tests/email-intake.test.mjs:63` | asserted |
| INTAKE-004 | 3. | Inactive member access is refused. | `tests/email-intake.test.mjs:70` | asserted |
| INTAKE-004 | 3. | Wrong-role edits are refused. | `tests/email-intake.test.mjs:54` | asserted |
| INTAKE-004 | 3. | Signed-out source. | `tests/email-intake.test.mjs:46` | asserted |
| INTAKE-004 | 3. | download reads are refused. | `tests/email-intake.test.mjs:46` | asserted |
| INTAKE-004 | 3. | Repeated completion is refused. | `tests/email-intake.test.mjs:62` | asserted |
| INTAKE-004 | 3. | Invalid. | `tests/email-intake.test.mjs:34` | asserted |
| INTAKE-004 | 3. | stale signatures make no provider request. | `tests/email-intake.test.mjs:34` | asserted |
| INTAKE-004 | 3. | Invalid. | none | none |
| INTAKE-004 | 3. | stale signatures make no retained source write. | none | none |
| INTAKE-004 | 3. | Provider replay makes no additional fetch or send. | `tests/email-intake.test.mjs:53` | asserted |
| INTAKE-004 | 3. | Source instructions create no purchase. | `tests/email-intake.test.mjs:40` | asserted |
| INTAKE-004 | 3. | decision or commitment. | `tests/email-intake.test.mjs:40` | asserted |
| INTAKE-004 | 4. | Restoration retains the intake. | `tests/email-intake.test.mjs:129` | asserted |
| INTAKE-004 | 4. | configuration. | `tests/email-intake.test.mjs:129` | asserted |
| INTAKE-004 | 4. | mail records. | `tests/email-intake.test.mjs:129` | asserted |
| INTAKE-004 | 4. | Restored original bytes equal the originals before export. | `tests/email-intake.test.mjs:134` | asserted |
| INTAKE-004 | previous 5. | The transport-edge proof boundary is stated in the mechanism documentation. | none | moved |
| INTAKE-007 | 1. | Native owner issues the token with the bound requester. | none | none |
| INTAKE-007 | 1. | The created draft uses its bound requester rather than forged identity. | `tests/integration-tokens.test.mjs:75` | asserted |
| INTAKE-007 | 1. | The bearer creates only a draft. | `tests/integration-tokens.test.mjs:76` | asserted |
| INTAKE-007 | 1. | no PO. | `tests/integration-tokens.test.mjs:76` | asserted |
| INTAKE-007 | 1. | decision. | `tests/integration-tokens.test.mjs:76` | asserted |
| INTAKE-007 | 1. | commitment or mail. | `tests/integration-tokens.test.mjs:76` | asserted |
| INTAKE-007 | 1. | Concurrent identical calls return the same creation result once. | `tests/integration-tokens.test.mjs:73` | asserted |
| INTAKE-007 | 1. | Changed-body races retain exactly one conflicting creation. | `tests/integration-tokens.test.mjs:81` | asserted |
| INTAKE-007 | 1. | The bearer cannot use native reads. | `tests/integration-tokens.test.mjs:84` | asserted |
| INTAKE-007 | 1. | approvals. | `tests/integration-tokens.test.mjs:84` | asserted |
| INTAKE-007 | 1. | administration or preparation. | `tests/integration-tokens.test.mjs:84` | asserted |
| INTAKE-007 | 1. | Ordinary signed-in submission. | `tests/integration-tokens.test.mjs:93` | asserted |
| INTAKE-007 | 1. | approval continue. | `tests/integration-tokens.test.mjs:93` | asserted |
| INTAKE-007 | 1. | Removing the requester role refuses both a new call. | `tests/integration-tokens.test.mjs:96` | asserted |
| INTAKE-007 | 1. | replay. | `tests/integration-tokens.test.mjs:96` | asserted |
| INTAKE-007 | 1. | Native identity deactivation refuses the bearer. | none | none |
| INTAKE-007 | 1. | Rotation changes the credential without changing the requester. | `tests/integration-tokens.test.mjs:98` | asserted |
| INTAKE-007 | 1. | The old credential stops working. | `tests/integration-tokens.test.mjs:102` | asserted |
| INTAKE-007 | 1. | Revocation stops the current credential. | `tests/integration-tokens.test.mjs:120` | asserted |
| INTAKE-007 | 1. | Audit retains the lifecycle. | `tests/integration-tokens.test.mjs:128` | asserted |
| INTAKE-007 | 1. | draft creation events. | `tests/integration-tokens.test.mjs:128` | asserted |
| INTAKE-007 | 1. | Archive bytes exclude both live. | `tests/integration-tokens.test.mjs:137` | asserted |
| INTAKE-007 | 1. | revoked bearer material. | `tests/integration-tokens.test.mjs:137` | asserted |
| INTAKE-007 | 1. | Actual restoration preserves purchasing. | `tests/integration-tokens.test.mjs:144` | asserted |
| INTAKE-007 | 1. | audit records. | `tests/integration-tokens.test.mjs:144` | asserted |
| INTAKE-007 | 1. | Restored credentials have no bearer authority. | `tests/integration-tokens.test.mjs:145` | asserted |
| INTAKE-007 | 2. | Settings issuance. | none | none |
| INTAKE-007 | 2. | rotation. | none | none |
| INTAKE-007 | 2. | revocation. | none | none |
| INTAKE-007 | 2. | requester submission are asserted in the browser. | none | none |
| INTAKE-008 | 1. | PO header. | `tests/integration-tokens.test.mjs:276` | asserted |
| INTAKE-008 | 1. | amount equal the authorized order. | `tests/integration-tokens.test.mjs:276` | asserted |
| INTAKE-008 | 1. | PO lines equal the authorized order lines. | `tests/integration-tokens.test.mjs:277` | asserted |
| INTAKE-008 | 1. | Bill identity. | `tests/integration-tokens.test.mjs:278` | asserted |
| INTAKE-008 | 1. | amount. | `tests/integration-tokens.test.mjs:278` | asserted |
| INTAKE-008 | 1. | payment status are returned. | `tests/integration-tokens.test.mjs:278` | asserted |
| INTAKE-008 | 1. | Out-of-scope order reads are refused. | `tests/integration-tokens.test.mjs:283` | asserted |
| INTAKE-008 | 1. | Revoked token reads are refused. | `tests/integration-tokens.test.mjs:294` | asserted |
| INTAKE-008 | 1. | Recognized refusals are retained in audit. | `tests/integration-tokens.test.mjs:300` | asserted |
| INTAKE-008 | 1. | Create-draft tokens cannot read. | `tests/integration-tokens.test.mjs:287` | asserted |
| MOBILE-001 | 1. | The phone journey displays the newly submitted request. | `tests/browser-journey.mjs:12` | asserted |
| MOBILE-001 | 1. | The phone journey displays the exact approved revision. | `tests/browser-journey.mjs:13` | asserted |
| MOBILE-001 | 1. | The phone journey displays the partial receipt. | `tests/browser-journey.mjs:15` | asserted |
| MOBILE-001 | 1. | its reason. | `tests/browser-journey.mjs:15` | asserted |
| SUPPLIER-003 | 1. | Punctuation-equivalent supplier names are flagged. | `tests/supplier-duplicates.test.mjs:15` | asserted |
| SUPPLIER-003 | 1. | Matching TIN values are flagged. | `tests/supplier-duplicates.test.mjs:43` | asserted |
| SUPPLIER-003 | 1. | Merge preserves each existing PO record. | `tests/supplier-duplicates.test.mjs:87` | asserted |
| SUPPLIER-003 | 1. | Merge preserves the existing invoice record. | `tests/supplier-duplicates.test.mjs:88` | asserted |
| SUPPLIER-003 | 1. | The merged family retains both POs. | `tests/supplier-duplicates.test.mjs:91` | asserted |
| SUPPLIER-003 | 1. | invoices. | `tests/supplier-duplicates.test.mjs:91` | asserted |
| SUPPLIER-004 | 1. | Supplier reminder is sent to its contact. | `tests/supplier-documents.test.mjs:32` | asserted |
| SUPPLIER-004 | 1. | Owner reminder is sent to the owner. | `tests/supplier-documents.test.mjs:33` | asserted |
| SUPPLIER-004 | 1. | Buyer review clears the lapse. | `tests/supplier-documents.test.mjs:66` | asserted |
| SUPPLIER-004 | 1. | Lapsed supplier conversion is refused. | `tests/supplier-documents.test.mjs:39` | asserted |
| SUPPLIER-004 | 2. | Concurrent supplier uploads accept exactly one. | `tests/supplier-documents.test.mjs:53` | asserted |
| SUPPLIER-004 | 2. | The public page exposes no earlier file identity or filename. | `tests/supplier-documents.test.mjs:48` | asserted |
| SUPPLIER-004 | 2. | A link holder’s direct request for earlier file bytes is refused. | none | none |
| SUPPLIER-004 | 2. | Pending upload leaves the lapse intact. | `tests/supplier-documents.test.mjs:57` | asserted |
| SUPPLIER-004 | 3. | Requester cannot download the private file. | `tests/supplier-documents.test.mjs:60` | asserted |
| SUPPLIER-004 | 3. | Requester cannot request a refresh link. | `tests/supplier-documents.test.mjs:103` | asserted |
| SUPPLIER-004 | 3. | Merge retains the required lapse hold. | `tests/supplier-documents.test.mjs:97` | asserted |
| SUPPLIER-005 | 1. | Late deliveries are counted. | `tests/supplier-performance.test.mjs:68` | asserted |
| SUPPLIER-005 | 1. | Rejected deliveries are counted. | `tests/supplier-performance.test.mjs:75` | asserted |
| SUPPLIER-005 | 1. | Invoice mismatch is counted once. | `tests/supplier-performance.test.mjs:81` | asserted |
| SUPPLIER-005 | 1. | Delivery figures identify exactly their receipt records. | `tests/supplier-performance.test.mjs:72` | asserted |
| SUPPLIER-005 | 1. | Quality figures identify exactly their receipt records. | `tests/supplier-performance.test.mjs:79` | asserted |
| SUPPLIER-005 | 1. | Invoice exceptions identify their PO. | `tests/supplier-performance.test.mjs:85` | asserted |
| SUPPLIER-005 | 1. | allocations. | `tests/supplier-performance.test.mjs:85` | asserted |
| SUPPLIER-005 | 1. | Acknowledgment figures identify their evidence record. | `tests/supplier-performance.test.mjs:93` | asserted |
| SUPPLIER-005 | 1. | Currency-separated spend identifies its invoice records. | `tests/supplier-performance.test.mjs:98` | asserted |
| SUPPLIER-005 | 1. | Issue figures identify the source PO. | `tests/supplier-performance.test.mjs:101` | asserted |
| SUPPLIER-005 | 1. | resolution. | `tests/supplier-performance.test.mjs:101` | asserted |
| SUPPLIER-007 | 1. | The matching SDN entry is retained. | `tests/supplier-screening.test.mjs:14` | asserted |
| SUPPLIER-007 | 1. | Activation is held pending review. | `tests/supplier-screening.test.mjs:17` | asserted |
| SUPPLIER-007 | 1. | List date. | `tests/supplier-screening.test.mjs:14` | asserted |
| SUPPLIER-007 | 1. | digest are retained for the screening source. | `tests/supplier-screening.test.mjs:14` | asserted |
| SOURCE-001 | 1. | Three supplier invitations are retained. | none | none |
| SOURCE-001 | 1. | Two suppliers. | `tests/rfq.test.mjs:38` | asserted |
| SOURCE-001 | 1. | a revised offer reach the comparison. | `tests/rfq.test.mjs:38` | asserted |
| SOURCE-001 | 1. | All three ten-megabyte originals download byte for byte. | `tests/rfq.test.mjs:34` | asserted |
| SOURCE-001 | 1. | Oversize originals refuse without response or object writes. | `tests/rfq.test.mjs:36` | asserted |
| SOURCE-001 | 1. | A fourth original refuses without response or object writes. | `tests/rfq.test.mjs:36` | asserted |
| SOURCE-001 | 1. | Malformed offer refusal leaves response. | none | none |
| SOURCE-001 | 1. | storage counts unchanged. | none | none |
| SOURCE-001 | 1. | Current. | `tests/rfq.test.mjs:37` | asserted |
| SOURCE-001 | 1. | historical prices remain distinct. | `tests/rfq.test.mjs:37` | asserted |
| SOURCE-001 | 1. | All compared response currencies remain separate. | `tests/rfq.test.mjs:62` | asserted |
| SOURCE-001 | 1. | Award produces the exact new draft revision. | `tests/rfq.test.mjs:46` | asserted |
| SOURCE-001 | 1. | amount. | `tests/rfq.test.mjs:46` | asserted |
| SOURCE-001 | 1. | The entered award reason is read back. | none | none |
| SOURCE-001 | 2. | A supplier corrects. | `tests/rfq.test.mjs:37` | asserted |
| SOURCE-001 | 2. | resubmits the offer. | `tests/rfq.test.mjs:37` | asserted |
| SOURCE-001 | 2. | Reissue immediately revokes the earlier link. | `tests/rfq.test.mjs:43` | asserted |
| SOURCE-001 | 3. | The scheduler sends one before-deadline reminder despite repeated ticks. | `tests/rfq.test.mjs:41` | asserted |
| SOURCE-001 | 3. | The third supplier’s nonresponse event is retained. | `tests/rfq.test.mjs:44` | asserted |
| SOURCE-001 | 3. | Expired GET is refused. | `tests/rfq.test.mjs:44` | asserted |
| SOURCE-001 | 3. | Expired POST is refused. | `tests/rfq.test.mjs:44` | asserted |
| SOURCE-001 | 3. | Expired reissue is refused. | `tests/rfq.test.mjs:44` | asserted |
| SOURCE-001 | 3. | An uncertain invitation is not retried automatically. | `tests/rfq.test.mjs:59` | asserted |
| SOURCE-001 | 4. | Signed-out configuration. | `tests/rfq.test.mjs:20` | asserted |
| SOURCE-001 | 4. | award. | `tests/rfq.test.mjs:20` | asserted |
| SOURCE-001 | 4. | send. | `tests/rfq.test.mjs:20` | asserted |
| SOURCE-001 | 4. | reissue are refused. | `tests/rfq.test.mjs:20` | asserted |
| SOURCE-001 | 4. | Wrong-role configuration. | `tests/rfq.test.mjs:20` | asserted |
| SOURCE-001 | 4. | award. | `tests/rfq.test.mjs:20` | asserted |
| SOURCE-001 | 4. | send. | `tests/rfq.test.mjs:20` | asserted |
| SOURCE-001 | 4. | reissue are refused. | `tests/rfq.test.mjs:20` | asserted |
| SOURCE-001 | 4. | Signed-out. | `tests/rfq.test.mjs:39` | asserted |
| SOURCE-001 | 4. | wrong-role original downloads are refused. | `tests/rfq.test.mjs:39` | asserted |
| SOURCE-001 | 4. | Supplier response state is private. | `tests/rfq.test.mjs:38` | asserted |
| SOURCE-001 | 4. | Cross-site supplier responses are refused. | `tests/rfq.test.mjs:26` | asserted |
| SOURCE-001 | 4. | Foreign source-line responses are refused. | `tests/rfq.test.mjs:27` | asserted |
| SOURCE-001 | 4. | Owner audit includes every named sourcing event. | `tests/rfq.test.mjs:54` | asserted |
| SOURCE-001 | 4. | Filtered CSV contains the sourcing outcome. | `tests/rfq.test.mjs:54` | asserted |
| SOURCE-001 | 5. | The fresh approved award gives one thousand dollars negotiated savings. | `tests/rfq.test.mjs:50` | asserted |
| SOURCE-001 | 5. | Unapproved invoice evidence gives zero realized savings. | `tests/rfq.test.mjs:52` | asserted |
| SOURCE-001 | 5. | Sixty-percent approved bill gives six hundred dollars realized savings. | `tests/rfq.test.mjs:54` | asserted |
| SOURCE-001 | 5. | Source offers. | `tests/rfq.test.mjs:54` | asserted |
| SOURCE-001 | 5. | award. | `tests/rfq.test.mjs:54` | asserted |
| SOURCE-001 | 5. | invoice identities are read back. | `tests/rfq.test.mjs:54` | asserted |
| SOURCE-001 | 5. | Unapproved new-source award invents no savings. | `tests/rfq.test.mjs:63` | asserted |
| SOURCE-001 | 5. | Selecting the baseline fabricates no second offer. | `tests/rfq.test.mjs:58` | asserted |
| SOURCE-001 | 6. | Actual restoration preserves every response original. | `tests/rfq.test.mjs:99` | asserted |
| SOURCE-001 | 6. | Actual restoration preserves all record versions. | `tests/rfq.test.mjs:98` | asserted |
| SOURCE-001 | 6. | mail outcomes. | `tests/rfq.test.mjs:98` | asserted |
| SOURCE-001 | 6. | award links. | `tests/rfq.test.mjs:98` | asserted |
| SOURCE-001 | 6. | Bearer authority is not restored. | `tests/rfq.test.mjs:100` | asserted |
| SOURCE-002 | 1. | Text PDF description. | `tests/quote-reading.test.mjs:18` | asserted |
| SOURCE-002 | 1. | quantity. | `tests/quote-reading.test.mjs:18` | asserted |
| SOURCE-002 | 1. | unit. | `tests/quote-reading.test.mjs:18` | asserted |
| SOURCE-002 | 1. | unit price are read. | `tests/quote-reading.test.mjs:18` | asserted |
| SOURCE-002 | 1. | Freight. | `tests/quote-reading.test.mjs:18` | asserted |
| SOURCE-002 | 1. | tax. | `tests/quote-reading.test.mjs:18` | asserted |
| SOURCE-002 | 1. | lead time. | `tests/quote-reading.test.mjs:18` | asserted |
| SOURCE-002 | 1. | validity are read. | `tests/quote-reading.test.mjs:18` | asserted |
| SOURCE-002 | 1. | Currency is independently asserted. | none | none |
| SOURCE-002 | 1. | Confidence. | `tests/quote-reading.test.mjs:19` | asserted |
| SOURCE-002 | 1. | page/line evidence are asserted for the listed read fields. | `tests/quote-reading.test.mjs:19` | asserted |
| SOURCE-002 | 1. | Unit confidence. | none | none |
| SOURCE-002 | 1. | its source page are independently asserted. | none | none |
| SOURCE-002 | 1. | Quantity correction is retained. | `tests/quote-reading.test.mjs:22` | asserted |
| SOURCE-002 | 1. | Extraction leaves the entire request unchanged. | `tests/quote-reading.test.mjs:20` | asserted |
| SOURCE-002 | 2. | MIME email prefers the plain alternative. | `tests/quote-reading.test.mjs:32` | asserted |
| SOURCE-002 | 2. | HTML email fields are read. | `tests/quote-reading.test.mjs:42` | asserted |
| SOURCE-002 | 2. | Missing field values. | `tests/quote-reading.test.mjs:32` | asserted |
| SOURCE-002 | 2. | confidence remain explicit. | `tests/quote-reading.test.mjs:32` | asserted |
| SOURCE-002 | 2. | Original PDF bytes are retained. | `tests/quote-reading.test.mjs:27` | asserted |
| SOURCE-002 | 2. | The previous revision is unchanged. | `tests/quote-reading.test.mjs:26` | asserted |
| SOURCE-002 | 2. | Stale correction is refused. | `tests/quote-reading.test.mjs:36` | asserted |
| SOURCE-002 | 2. | Replayed confirmation is refused. | `tests/quote-reading.test.mjs:25` | asserted |
| SOURCE-002 | 2. | Every wrong-role. | none | none |
| SOURCE-002 | 2. | signed-out reading door is refused. | none | none |
| SOURCE-002 | 3. | The actual image-only PDF is unsupported by the native reader. | `tests/quote-reading.test.mjs:60` | asserted |
| SOURCE-002 | 3. | Instructions identify the exact source. | `tests/quote-reading.test.mjs:60` | asserted |
| SOURCE-002 | 3. | digest. | `tests/quote-reading.test.mjs:60` | asserted |
| SOURCE-002 | 3. | External proposal carries declared run provenance. | `tests/quote-reading.test.mjs:64` | asserted |
| SOURCE-002 | 3. | source digest. | `tests/quote-reading.test.mjs:64` | asserted |
| SOURCE-002 | 3. | A proposal changes no request or authority. | `tests/quote-reading.test.mjs:64` | asserted |
| SOURCE-002 | 3. | Correction. | `tests/quote-reading.test.mjs:66` | asserted |
| SOURCE-002 | 3. | confirmation make the new draft. | `tests/quote-reading.test.mjs:66` | asserted |
| SOURCE-002 | 3. | The original proposal history is immutable after correction. | `tests/quote-reading.test.mjs:66` | asserted |
| SOURCE-002 | 3. | Both raster originals download byte for byte. | `tests/quote-reading.test.mjs:69` | asserted |
| SOURCE-002 | 3. | Portable validation refuses a corrupt source digest. | `tests/quote-reading.test.mjs:70` | asserted |
| CATALOG-001 | 1. | Denver requester sees the restricted item. | `tests/catalogue.test.mjs:47` | asserted |
| CATALOG-001 | 1. | Chicago requester cannot see the restricted item. | `tests/catalogue.test.mjs:49` | asserted |
| CATALOG-001 | 1. | Engineering requester receives the bundle’s three lines. | `tests/catalogue.test.mjs:16` | asserted |
| CATALOG-001 | 1. | exact price. | `tests/catalogue.test.mjs:16` | asserted |
| CATALOG-001 | 1. | Each copied line retains its catalogue coding. | `tests/catalogue.test.mjs:17` | asserted |
| CATALOG-001 | 1. | Chicago direct API use is refused without changing state. | `tests/catalogue.test.mjs:52` | asserted |
| STOCK-001 | 1. | Low count creates a new draft. | `tests/stockroom.test.mjs:25` | asserted |
| STOCK-001 | 1. | The draft has the preferred catalogue item. | `tests/stockroom.test.mjs:29` | asserted |
| STOCK-001 | 1. | The replenishment quantity is seven. | `tests/stockroom.test.mjs:30` | asserted |
| STOCK-001 | 1. | a half. | `tests/stockroom.test.mjs:30` | asserted |
| STOCK-001 | 1. | The draft is unsubmitted. | `tests/stockroom.test.mjs:27` | asserted |
| STOCK-001 | 1. | has no commitment. | `tests/stockroom.test.mjs:27` | asserted |
| STOCK-001 | 1. | A signed-in person can submit it. | `tests/stockroom.test.mjs:46` | asserted |
| STOCK-001 | 2. | Pier request is a draft under the current requester. | `tests/stockroom.test.mjs:78` | asserted |
| STOCK-001 | 2. | Pier’s returned catalogue item. | none | none |
| STOCK-001 | 2. | quantity are read back. | none | none |
| STOCK-001 | 2. | Pier creates no PO. | none | none |
| STOCK-001 | 2. | Signed-out. | none | none |
| STOCK-001 | 2. | cross-origin Pier calls are independently asserted. | none | none |
| STOCK-001 | previous 3. | The API-001 unattended-connector proof pointer belongs in the requirement. | none | moved |
| PO-003 | 1. | Concurrent first due ticks emit one chase. | `tests/order-chasing.test.mjs:26` | asserted |
| PO-003 | 1. | Exactly two chase events are retained. | `tests/order-chasing.test.mjs:34` | asserted |
| PO-003 | 1. | One buyer escalation is retained. | `tests/order-chasing.test.mjs:35` | asserted |
| PO-003 | 1. | Escalation names the buyer recipient. | `tests/order-chasing.test.mjs:36` | asserted |
| PO-003 | 1. | Requester history contains both recorded replies. | `tests/order-chasing.test.mjs:47` | asserted |
| PO-003 | 1. | the current source. | `tests/order-chasing.test.mjs:47` | asserted |
| PO-003 | 2. | Chasing retains the frozen contact after directory edits. | `tests/order-chasing.test.mjs:27` | asserted |
| PO-003 | 3. | Closing the actively chased PO suppresses the next due send. | `tests/order-chasing.test.mjs:52` | asserted |
| PO-003 | 4. | Blocked supplier produces no due send. | `tests/order-chasing.test.mjs:55` | asserted |
| PO-003 | 4. | Lapsed required document produces no due send. | `tests/order-chasing.test.mjs:59` | asserted |
| PO-003 | 4. | Imported history cannot enable chasing. | `tests/order-chasing.test.mjs:71` | asserted |
| PO-005 | 1. | Three invoices reduce the annual blanket balance exactly. | `tests/blanket-orders.test.mjs:24` | asserted |
| PO-005 | 1. | An over-cap invoice is flagged. | `tests/blanket-orders.test.mjs:37` | asserted |
| PO-005 | 2. | A new approved cap replaces the prior face rather than summing faces. | `tests/blanket-orders.test.mjs:34` | asserted |
| PO-005 | 2. | Release balance excess is flagged. | `tests/blanket-orders.test.mjs:94` | asserted |
| PO-005 | 2. | An unresolved excess cannot gain cash-planning approval. | `tests/blanket-orders.test.mjs:95` | asserted |
| PO-005 | 3. | Both inclusive amended validity endpoints are accepted. | `tests/blanket-orders.test.mjs:46` | asserted |
| PO-005 | 3. | the preceding day is flagged. | `tests/blanket-orders.test.mjs:46` | asserted |
| PO-005 | 3. | Exact invoice replay consumes balance once. | `tests/blanket-orders.test.mjs:47` | asserted |
| PO-013 | 1. | The six-thousand-dollar invoice exceeds the received service value. | `tests/blanket-orders.test.mjs:102` | asserted |
| PO-013 | 1. | The four-thousand-dollar invoice has neither price mismatch nor receipt shortfall. | `tests/blanket-orders.test.mjs:102` | asserted |
| PO-013 | 1. | The excessive bill cannot receive cash-planning approval. | `tests/blanket-orders.test.mjs:104` | asserted |
| PO-013 | 1. | The matching bill can receive cash-planning approval. | `tests/blanket-orders.test.mjs:104` | asserted |
| PO-014 | 1. | Concurrent real Cron ticks generate one order. | `tests/blanket-orders.test.mjs:121` | asserted |
| PO-014 | 1. | reservation. | `tests/blanket-orders.test.mjs:121` | asserted |
| PO-014 | 2. | The order before the six-week end is generated. | `tests/blanket-orders.test.mjs:121` | asserted |
| PO-014 | 2. | The order after agreement end is not generated. | `tests/blanket-orders.test.mjs:123` | asserted |
| PO-014 | 2. | The series is paused with the agreement end date. | `tests/blanket-orders.test.mjs:123` | asserted |
| PO-014 | 2. | The owner receives the request to decide how the series continues. | none | none |
| PO-009 | 1. | Distinct emitted PDFs retain distinct location logos. | `tests/po-documents.test.mjs:28` | asserted |
| PO-009 | 1. | Each PDF’s legal identity. | none | none |
| PO-009 | 1. | all named supplier. | none | none |
| PO-009 | 1. | remit. | none | none |
| PO-009 | 1. | shipping. | none | none |
| PO-009 | 1. | deposit. | none | none |
| PO-009 | 1. | date. | none | none |
| PO-009 | 1. | line. | none | none |
| PO-009 | 1. | note. | none | none |
| PO-009 | 1. | original fields are compared. | none | none |
| PO-009 | 2. | Supplier. | `tests/po-documents.test.mjs:39` | asserted |
| PO-009 | 2. | profile directory changes cannot rewrite the first emitted document. | `tests/po-documents.test.mjs:39` | asserted |
| PO-009 | 3. | Amendment emits change order one. | `tests/po-documents.test.mjs:31` | asserted |
| PO-009 | 3. | Document revision is independent of the request revision. | `tests/po-documents.test.mjs:36` | asserted |
| PO-009 | 3. | Both old. | none | none |
| PO-009 | 3. | new quantities. | none | none |
| PO-009 | 3. | approved revision labels are compared. | none | none |
| PO-009 | 4. | Two issued amendments are numbered one. | `tests/po-documents.test.mjs:36` | asserted |
| PO-009 | 4. | two after earlier draft revisions. | `tests/po-documents.test.mjs:36` | asserted |
| PO-009 | 5. | Signed-out. | none | none |
| PO-009 | 5. | out-of-scope downloads are refused. | none | none |
| PO-009 | 6. | Both web widths have no overflow. | none | none |
| PO-009 | 6. | Actual archive restoration compares frozen profile. | none | none |
| PO-009 | 6. | logo. | none | none |
| PO-009 | 6. | original attachments. | none | none |
| PO-010 | 1. | Receiving eight units leaves two thousand minor units outstanding. | `tests/order-closure.test.mjs:15` | asserted |
| PO-010 | 1. | Close records the reason. | `tests/order-closure.test.mjs:21` | asserted |
| PO-010 | 1. | removes the outstanding balance. | `tests/order-closure.test.mjs:21` | asserted |
| PO-010 | 1. | Close. | `tests/order-closure.test.mjs:38` | asserted |
| PO-010 | 1. | reopen send no supplier messages. | `tests/order-closure.test.mjs:38` | asserted |
| PO-010 | 1. | Closed receiving is refused. | `tests/order-closure.test.mjs:22` | asserted |
| PO-010 | 1. | Closed balance disappears from the overdue projection. | none | none |
| PO-010 | 1. | An invoice for all ten units retains a closed-balance exception. | `tests/order-closure.test.mjs:23` | asserted |
| PO-010 | 1. | Concurrent reopen re-reserves the remaining two units exactly once. | `tests/order-closure.test.mjs:33` | asserted |
| PO-010 | 2. | Active chasing stops on closure in this clause’s cited Evidence set. | none | none |
| PO-010 | 2. | Active receipt prompting stops on closure in this clause’s cited Evidence set. | none | none |
| RECEIVE-001 | 1. | The correct assigned receiver receives the invoice-held prompt. | none | none |
| RECEIVE-001 | 1. | Partial. | none | none |
| RECEIVE-001 | 1. | final receipts release the invoice into matching once. | none | none |
| RECEIVE-001 | 2. | Facilities is the exclusive prompt recipient for building services. | none | none |
| RECEIVE-001 | 2. | The requester cannot receive the assigned PO. | none | none |
| RECEIVE-001 | 3. | Every rule precedence. | none | none |
| RECEIVE-001 | 3. | reassignment is read back. | none | none |
| RECEIVE-001 | 3. | Default requester receiving releases its reservation. | `tests/receipt-routing.test.mjs:42` | asserted |
| RECEIVE-001 | 3. | Wrong-role. | none | none |
| RECEIVE-001 | 3. | signed-out. | none | none |
| RECEIVE-001 | 3. | deactivated actors cannot receive. | none | none |
| RECEIVE-001 | 3. | Stale confirmation. | none | none |
| RECEIVE-001 | 3. | DST due-day boundaries are independently asserted. | none | none |
| RECEIVE-001 | 3. | Duplicate scheduler ticks make no duplicate prompt. | none | none |
| RECEIVE-001 | 3. | Closure. | none | none |
| RECEIVE-001 | 3. | reopen preserve the prompting boundary. | none | none |
| RECEIVE-001 | 3. | Retained assignment. | `tests/receipt-routing.test.mjs:69` | asserted |
| RECEIVE-001 | 3. | history. | `tests/receipt-routing.test.mjs:69` | asserted |
| RECEIVE-001 | 3. | outcome graph validates. | `tests/receipt-routing.test.mjs:69` | asserted |
| RECEIVE-001 | previous 4. | Named future-door trigger/channel/exemption acceptance is a scope pointer. | none | moved |
| INVOICE-001 | 1. | Known supplier capture is a linked draft. | `tests/invoice-inbox.test.mjs:112` | asserted |
| INVOICE-001 | 1. | Unknown sender capture is held. | `tests/invoice-inbox.test.mjs:137` | asserted |
| INVOICE-001 | 1. | Known. | none | none |
| INVOICE-001 | 1. | unknown original files download unchanged. | none | none |
| INVOICE-001 | 2. | UBL. | `tests/invoice-inbox.test.mjs:223` | asserted |
| INVOICE-001 | 2. | cXML reference. | `tests/invoice-inbox.test.mjs:223` | asserted |
| INVOICE-001 | 2. | dates equal their source fields. | `tests/invoice-inbox.test.mjs:223` | asserted |
| INVOICE-001 | 2. | PO reference. | `tests/invoice-inbox.test.mjs:224` | asserted |
| INVOICE-001 | 2. | currency. | `tests/invoice-inbox.test.mjs:224` | asserted |
| INVOICE-001 | 2. | terms. | `tests/invoice-inbox.test.mjs:224` | asserted |
| INVOICE-001 | 2. | subtotal. | `tests/invoice-inbox.test.mjs:224` | asserted |
| INVOICE-001 | 2. | freight. | `tests/invoice-inbox.test.mjs:224` | asserted |
| INVOICE-001 | 2. | tax. | `tests/invoice-inbox.test.mjs:224` | asserted |
| INVOICE-001 | 2. | total equal their source fields. | `tests/invoice-inbox.test.mjs:224` | asserted |
| INVOICE-001 | 2. | Every XML line equals its declared description. | `tests/invoice-inbox.test.mjs:226` | asserted |
| INVOICE-001 | 2. | quantity. | `tests/invoice-inbox.test.mjs:226` | asserted |
| INVOICE-001 | 2. | unit amount. | `tests/invoice-inbox.test.mjs:226` | asserted |
| INVOICE-001 | 2. | amount. | `tests/invoice-inbox.test.mjs:226` | asserted |
| INVOICE-001 | 2. | PO link. | `tests/invoice-inbox.test.mjs:226` | asserted |
| INVOICE-001 | 2. | UBL XML downloads byte for byte. | `tests/invoice-inbox.test.mjs:215` | asserted |
| INVOICE-001 | 2. | cXML downloads byte for byte. | `tests/invoice-inbox.test.mjs:216` | asserted |
| INVOICE-001 | 3. | Captured invoice retains the original date. | `tests/invoice-inbox.test.mjs:168` | asserted |
| INVOICE-001 | 3. | sender. | `tests/invoice-inbox.test.mjs:168` | asserted |
| INVOICE-001 | 3. | digest. | `tests/invoice-inbox.test.mjs:168` | asserted |
| INVOICE-001 | 3. | A duplicate original flags the resulting invoice. | `tests/invoice-inbox.test.mjs:184` | asserted |
| INVOICE-001 | 3. | Look-alike sender evidence is retained. | `tests/invoice-inbox.test.mjs:200` | asserted |
| INVOICE-001 | 3. | flagged. | `tests/invoice-inbox.test.mjs:200` | asserted |
| INVOICE-001 | 3. | Unresolved flags refuse payment approval through this capture door. | none | none |
| INVOICE-002 | 1. | Text PDF header. | `tests/invoice-reading.test.mjs:23` | asserted |
| INVOICE-002 | 1. | line. | `tests/invoice-reading.test.mjs:23` | asserted |
| INVOICE-002 | 1. | total fields are read exactly. | `tests/invoice-reading.test.mjs:23` | asserted |
| INVOICE-002 | 1. | MIME sender comes from the original From header. | `tests/invoice-reading.test.mjs:41` | asserted |
| INVOICE-002 | 1. | Image-only PDF uses the declared external proposal. | `tests/invoice-reading.test.mjs:38` | asserted |
| INVOICE-002 | 1. | Prompt-like source instructions create neither invoice nor payable. | `tests/invoice-reading.test.mjs:25` | asserted |
| INVOICE-002 | 2. | Every read header. | `tests/invoice-reading.test.mjs:24` | asserted |
| INVOICE-002 | 2. | line field has confidence. | `tests/invoice-reading.test.mjs:24` | asserted |
| INVOICE-002 | 2. | its attachment/page. | `tests/invoice-reading.test.mjs:24` | asserted |
| INVOICE-002 | 2. | Missing fields remain null with zero confidence. | `tests/invoice-reading.test.mjs:30` | asserted |
| INVOICE-002 | 2. | Under the held company policy, low-confidence cases stay in review before creation. | none | none |
| INVOICE-002 | 2. | Instructions cannot create or approve an invoice. | `tests/invoice-reading.test.mjs:25` | asserted |
| INVOICE-002 | 3. | Field correction retains the before. | `tests/invoice-reading.test.mjs:42` | asserted |
| INVOICE-002 | 3. | after value. | `tests/invoice-reading.test.mjs:42` | asserted |
| INVOICE-002 | 3. | Absent review is refused. | `tests/invoice-reading.test.mjs:27` | asserted |
| INVOICE-002 | 3. | Stale. | none | none |
| INVOICE-002 | 3. | source-changed confirmation are both refused. | none | none |
| INVOICE-002 | 3. | Irreconcilable totals refuse confirmation. | `tests/invoice-reading.test.mjs:32` | asserted |
| INVOICE-002 | 3. | Confirmation creates exact invoice evidence without a payable approval. | `tests/invoice-reading.test.mjs:28` | asserted |
| INVOICE-002 | 4. | Original bytes download unchanged. | `tests/invoice-reading.test.mjs:29` | asserted |
| INVOICE-002 | 4. | Wrong-role. | `tests/invoice-reading.test.mjs:67` | asserted |
| INVOICE-002 | 4. | signed-out original downloads are refused. | `tests/invoice-reading.test.mjs:67` | asserted |
| INVOICE-002 | 4. | Private source. | `tests/invoice-reading.test.mjs:64` | asserted |
| INVOICE-002 | 4. | reading. | `tests/invoice-reading.test.mjs:64` | asserted |
| INVOICE-002 | 4. | event projections are absent for the wrong role. | `tests/invoice-reading.test.mjs:64` | asserted |
| INVOICE-002 | 4. | Structured bank values. | none | none |
| INVOICE-002 | 4. | excerpts are rejected on every named proposal/correction door. | none | none |
| INVOICE-002 | 4. | Non-original records contain none of the three planted bank values. | `tests/invoice-reading.test.mjs:69` | asserted |
| INVOICE-002 | 5. | All named duplicate. | `tests/invoice-reading.test.mjs:57` | asserted |
| INVOICE-002 | 5. | changed remit. | `tests/invoice-reading.test.mjs:57` | asserted |
| INVOICE-002 | 5. | sender flags are retained. | `tests/invoice-reading.test.mjs:57` | asserted |
| INVOICE-002 | 5. | Unresolved cash-planning approval is refused. | none | none |
| INVOICE-002 | 5. | Reasoned review does not manufacture a match. | none | none |
| INVOICE-002 | 6. | An actual archive round-trip preserves original bytes. | none | none |
| INVOICE-002 | 6. | source digests. | none | none |
| INVOICE-002 | 6. | proposals. | none | none |
| INVOICE-002 | 6. | corrections. | none | none |
| INVOICE-002 | 6. | confirmation. | none | none |
| INVOICE-002 | 6. | flags. | none | none |
| INVOICE-002 | 6. | Corrupt source digest is refused by portable validation. | `tests/invoice-reading.test.mjs:70` | asserted |
| INVOICE-003 | 1. | Near-duplicate. | none | none |
| INVOICE-003 | 1. | repeated PDF. | none | none |
| INVOICE-003 | 1. | remit. | none | none |
| INVOICE-003 | 1. | sender outcomes are individually asserted through the invoice door. | none | none |
| INVOICE-003 | 1. | Cash-planning approval stays held until reasoned review. | none | none |
| INVOICE-003 | 2. | Missing bank. | none | none |
| INVOICE-003 | 2. | contact baselines are held. | none | none |
| INVOICE-003 | 2. | Raw structured bank values do not enter retained invoice/audit evidence. | `tests/invoice-risk.test.mjs:127` | asserted |
| INVOICE-003 | 2. | Original bytes download unchanged. | none | none |
| INVOICE-003 | 2. | Exact re-entry returns the same invoice identity. | `tests/invoice-risk.test.mjs:22` | asserted |
| INVOICE-003 | 2. | Changed evidence is refused. | none | none |
| INVOICE-003 | 3. | A later repeated document is flagged. | `tests/invoice-risk.test.mjs:40` | asserted |
| INVOICE-003 | 3. | Historical approval is retained while current savings exclude the invoice. | `tests/invoice-risk.test.mjs:40` | asserted |
| INVOICE-003 | 3. | Risk review restores eligibility without manufacturing matching. | none | none |
| INVOICE-003 | 4. | The current issued face is used after amendment. | `tests/invoice-risk.test.mjs:45` | asserted |
| INVOICE-003 | 4. | Every stale/repeated/role/session refusal is asserted against review. | none | none |
| INVOICE-003 | 4. | Actual archive restoration compares all originals. | none | none |
| INVOICE-003 | 4. | flags. | none | none |
| INVOICE-003 | 4. | immutable review evidence. | none | none |
| INVOICE-003 | previous 5. | Future verified-bank, deposit and payment acceptance is a scope pointer. | none | moved |
| INVOICE-003 | previous 6. | Evidence-key representation ownership is a scope pointer. | none | moved |
| INVOICE-005 | 1. | Received quantity prefills from the acknowledged PO. | `tests/supplier-invoice.test.mjs:42` | asserted |
| INVOICE-005 | 1. | Supplier PDF is captured as private original evidence. | none | none |
| INVOICE-005 | 1. | Three-way matching produces the automatic approval. | `tests/supplier-invoice.test.mjs:123` | asserted |
| INVOICE-005 | 1. | Approved status returns on the supplier link. | `tests/supplier-invoice.test.mjs:124` | asserted |
| INVOICE-005 | 1. | Scheduled status returns on the supplier link. | `tests/supplier-invoice.test.mjs:129` | asserted |
| INVOICE-005 | 1. | A second over-balance submission is flagged. | `tests/supplier-invoice.test.mjs:142` | asserted |
| INVOICE-005 | 2. | Exact document. | `tests/supplier-invoice.test.mjs:147` | asserted |
| INVOICE-005 | 2. | duplicate checks run before approval. | `tests/supplier-invoice.test.mjs:147` | asserted |
| INVOICE-005 | 2. | Remaining-balance. | `tests/supplier-invoice.test.mjs:190` | asserted |
| INVOICE-005 | 2. | source/remit checks prevent unresolved approval. | `tests/supplier-invoice.test.mjs:190` | asserted |
| INVOICE-005 | 2. | A later flag retains the historical approval but removes the current scheduled status. | `tests/supplier-invoice.test.mjs:148` | asserted |
| AP-003 | 1. | Net 15. | `tests/payables.test.mjs:40` | asserted |
| AP-003 | 1. | Net 30. | `tests/payables.test.mjs:40` | asserted |
| AP-003 | 1. | Net 60. | `tests/payables.test.mjs:40` | asserted |
| AP-003 | 1. | due-on-receipt dates are compared. | `tests/payables.test.mjs:40` | asserted |
| AP-003 | 1. | Two-ten discount. | `tests/payables.test.mjs:19` | asserted |
| AP-003 | 1. | deadline are compared. | `tests/payables.test.mjs:19` | asserted |
| AP-003 | 1. | Due bills sort by their expected dates. | `tests/payables.test.mjs:44` | asserted |
| AP-003 | 1. | The rounded discount amount is compared. | `tests/payables.test.mjs:31` | asserted |
| AP-003 | 1. | Monday-week bills. | `tests/payables.test.mjs:34` | asserted |
| AP-003 | 1. | remaining liability sum without double counting. | `tests/payables.test.mjs:34` | asserted |
| AP-003 | 1. | Foreign currency remains separate. | `tests/payables.test.mjs:45` | asserted |
| AP-003 | 2. | Both browser widths show the expected discount. | none | none |
| AP-003 | 2. | weekly total. | none | none |
| AP-003 | 2. | Changing the expected date changes the remaining-liability week. | `tests/payables.test.mjs:34` | asserted |
| AP-003 | 2. | Source PO. | none | none |
| AP-003 | 2. | invoice drill-through is independently asserted. | none | none |
| AP-003 | 3. | Unreceived approval fails without mutation. | `tests/payables.test.mjs:21` | asserted |
| AP-003 | 3. | Stale versions. | `tests/payables.test.mjs:52` | asserted |
| AP-003 | 3. | invalid dates. | `tests/payables.test.mjs:52` | asserted |
| AP-003 | 3. | role. | `tests/payables.test.mjs:52` | asserted |
| AP-003 | 3. | signed-out failures all leave state unchanged. | `tests/payables.test.mjs:52` | asserted |
| AP-003 | 3. | Approved terms cannot be rewritten. | none | none |
| AP-003 | 4. | Actual archive restore compares term. | none | none |
| AP-003 | 4. | approval. | none | none |
| AP-003 | 4. | forecast history. | none | none |
| AP-003 | previous 5. | Future capability acceptance is a scope pointer. | none | moved |
| AP-003 | 5. | An unresolved source flag refuses cash-planning approval. | none | none |
| AP-003 | 5. | A late document removes a historically approved bill from the current due list. | none | none |
| AP-003 | 6. | Risk review restores current cash eligibility without bypassing matching. | none | none |
| REPORT-001 | 1. | Department. | none | none |
| REPORT-001 | 1. | project filters. | none | none |
| REPORT-001 | 1. | committed-PO drill-through are read at both widths. | none | none |
| REPORT-001 | 2. | Reservations. | none | none |
| REPORT-001 | 2. | commitments remain separate. | none | none |
| REPORT-001 | 2. | Receipts. | `tests/spend-report.test.mjs:24` | asserted |
| REPORT-001 | 2. | closure release only their outstanding authority. | `tests/spend-report.test.mjs:24` | asserted |
| REPORT-001 | 2. | Mixed-coding freight cents remain exact. | `tests/spend-report.test.mjs:24` | asserted |
| REPORT-001 | 2. | Currencies remain separate. | none | none |
| REPORT-001 | 2. | Every grouped figure equals the sum of its actual source rows. | `tests/spend-report.test.mjs:30` | asserted |
| REPORT-001 | 3. | Requester choices exclude other requesters. | none | none |
| REPORT-001 | 3. | Requester drill-through excludes other requesters. | none | none |
| REPORT-003 | 1. | Request-to-PO. | `tests/performance-report.test.mjs:35` | asserted |
| REPORT-003 | 1. | approval durations equal source timestamps. | `tests/performance-report.test.mjs:35` | asserted |
| REPORT-003 | 1. | Coverage. | `tests/performance-report.test.mjs:47` | asserted |
| REPORT-003 | 1. | off-contract. | `tests/performance-report.test.mjs:47` | asserted |
| REPORT-003 | 1. | unapproved amounts reconcile to source rows. | `tests/performance-report.test.mjs:47` | asserted |
| REPORT-003 | 1. | Unknown promise is reported honestly. | `tests/performance-report.test.mjs:45` | asserted |
| REPORT-003 | 1. | Invoice exceptions count distinct invoices. | `tests/performance-report.test.mjs:45` | asserted |
| REPORT-003 | 2. | Negotiated savings equal one thousand after exact approval. | `tests/performance-report.test.mjs:23` | asserted |
| REPORT-003 | 2. | Unapproved invoice contributes zero realized savings. | `tests/performance-report.test.mjs:28` | asserted |
| REPORT-003 | 2. | Sixty-percent approved invoice contributes six hundred realized savings. | `tests/performance-report.test.mjs:31` | asserted |
| REPORT-003 | 2. | Both quotes. | `tests/performance-report.test.mjs:32` | asserted |
| REPORT-003 | 2. | award. | `tests/performance-report.test.mjs:32` | asserted |
| REPORT-003 | 2. | PO. | `tests/performance-report.test.mjs:32` | asserted |
| REPORT-003 | 2. | invoice source identities are retained. | `tests/performance-report.test.mjs:32` | asserted |
| REPORT-003 | 3. | Award without purchasing approval contributes no savings. | `tests/performance-report.test.mjs:21` | asserted |
| REPORT-003 | 3. | Unapproved invoice contributes no realized savings. | `tests/performance-report.test.mjs:28` | asserted |
| REPORT-003 | 3. | Returning one unit reduces realized savings. | `tests/performance-report.test.mjs:48` | asserted |
| REPORT-003 | 4. | Signed-out. | `tests/performance-report.test.mjs:49` | asserted |
| REPORT-003 | 4. | requester report reads are refused. | `tests/performance-report.test.mjs:49` | asserted |
| REPORT-003 | 4. | Portable validation retains the award links. | `tests/performance-report.test.mjs:50` | asserted |
| REPORT-003 | previous 5. | Future non-PO and new-source acceptance is a scope pointer. | none | moved |
| REPORT-003 | 5. | Late invoice-risk holds remove historically approved evidence from current realized savings. | none | none |
| REPORT-003 | 5. | Risk review restores source-backed savings. | none | none |
| CONTRACT-001 | 1. | A real scheduled reminder is claimed once before the notice deadline. | `tests/agreements.test.mjs:45` | asserted |
| CONTRACT-001 | 1. | The reminder contains exact spend to date. | `tests/agreements.test.mjs:46` | asserted |
| CONTRACT-001 | 1. | the deadline. | `tests/agreements.test.mjs:46` | asserted |
| CONTRACT-001 | 1. | The agreement’s Locket link is independently asserted. | `tests/agreements.test.mjs:25` | asserted |
| CONTRACT-002 | 1. | PDF proposes value. | `tests/agreement-reading.test.mjs:33` | asserted |
| CONTRACT-002 | 1. | end date. | `tests/agreement-reading.test.mjs:33` | asserted |
| CONTRACT-002 | 1. | notice period. | `tests/agreement-reading.test.mjs:33` | asserted |
| CONTRACT-002 | 1. | Every proposed term has confidence. | `tests/agreement-reading.test.mjs:34` | asserted |
| CONTRACT-002 | 1. | its exact source page. | `tests/agreement-reading.test.mjs:34` | asserted |
| CONTRACT-002 | 1. | Extraction changes no agreement terms. | `tests/agreement-reading.test.mjs:35` | asserted |
| CONTRACT-002 | 1. | Correction remains a proposal until explicit confirmation. | `tests/agreement-reading.test.mjs:43` | asserted |
| CONTRACT-002 | 1. | The confirmed notice period changes the deadline. | `tests/agreement-reading.test.mjs:46` | asserted |
| CONTRACT-002 | 1. | The corrected deadline changes the real Cron reminder time. | `tests/agreement-reading.test.mjs:55` | asserted |
| CONTRACT-003 | 1. | The awarded source retains the exact agreement version. | `tests/agreement-savings.test.mjs:38` | asserted |
| CONTRACT-003 | 1. | reading. | `tests/agreement-savings.test.mjs:38` | asserted |
| CONTRACT-003 | 1. | schedule line. | `tests/agreement-savings.test.mjs:38` | asserted |
| CONTRACT-003 | 1. | The source PDF downloads byte for byte. | `tests/agreement-savings.test.mjs:39` | asserted |
| CONTRACT-003 | 1. | The realized row retains its exact invoice. | `tests/agreement-savings.test.mjs:51` | asserted |
| CONTRACT-003 | 1. | agreement-reading version. | `tests/agreement-savings.test.mjs:51` | asserted |
| CONTRACT-003 | 2. | Exact approval produces one thousand negotiated savings. | `tests/agreement-savings.test.mjs:37` | asserted |
| CONTRACT-003 | 2. | Sixty-percent approved bill produces six hundred realized savings. | `tests/agreement-savings.test.mjs:51` | asserted |
| CONTRACT-003 | 2. | A returned unit reduces realized savings. | `tests/agreement-savings.test.mjs:52` | asserted |
| CONTRACT-003 | 2. | New duplicate originals hold previously approved savings. | `tests/agreement-savings.test.mjs:73` | asserted |
| CONTRACT-003 | 2. | Reasoned risk review restores the source-backed amount. | `tests/agreement-savings.test.mjs:64` | asserted |
| SEARCH-001 | 1. | Adopted Procurify PO number returns its source record. | `tests/search.test.mjs:14` | asserted |
| SEARCH-001 | 1. | Supplier invoice reference returns its source record. | `tests/search.test.mjs:14` | asserted |
| SEARCH-001 | 1. | Punctuation-free supplier name returns its source record. | `tests/search.test.mjs:14` | asserted |
| SEARCH-001 | 1. | Exact amount returns its source order. | `tests/search.test.mjs:14` | asserted |
| SEARCH-001 | 1. | Invoice PDF phrase returns its reading. | `tests/search.test.mjs:14` | asserted |
| SEARCH-001 | 1. | Each API query completes within one second. | `tests/search.test.mjs:13` | asserted |
| SEARCH-001 | 1. | All queries run on one hundred thousand synthetic records at both browser widths. | none | none |
| SEARCH-001 | 2. | The department requester sees no forbidden department result. | `tests/search.test.mjs:19` | asserted |
| SEARCH-001 | 2. | Bank account text returns no results for every role. | `tests/search.test.mjs:20` | asserted |
| IMPORT-003 | 1. | Original PO number is retained after adoption. | `tests/order-adoption.test.mjs:28` | asserted |
| IMPORT-003 | 1. | Adoption sends no supplier mail. | `tests/order-adoption.test.mjs:28` | asserted |
| IMPORT-003 | 1. | Remaining commitment equals the imported remainder. | `tests/order-adoption.test.mjs:31` | asserted |
| IMPORT-003 | 1. | Receiving three more units retains the exact quantity. | `tests/order-adoption.test.mjs:33` | asserted |
| IMPORT-003 | 1. | Original-number invoice matches all three-way terms. | none | none |
| IMPORT-003 | 1. | Amendment awaits native approval. | none | none |
| IMPORT-003 | 2. | Report identifies the adopted PO by its original number. | `tests/order-adoption.test.mjs:32` | asserted |
| IMPORT-003 | 2. | Historical received. | `tests/order-adoption.test.mjs:32` | asserted |
| IMPORT-003 | 2. | billed values are not counted again. | `tests/order-adoption.test.mjs:32` | asserted |
| IMPORT-003 | 3. | The report web projection compares those figures. | none | none |
| IMPORT-003 | 4. | Absent original remit verification is labelled honestly. | `tests/order-adoption.test.mjs:42` | asserted |
| IMPORT-003 | 4. | Duplicate. | none | none |
| IMPORT-003 | 4. | balance holds block new approval of historical invoices. | none | none |
| AUDIT-001 | 1. | Filtered history contains events only for the intended request. | `tests/audit-log.test.mjs:18` | asserted |
| AUDIT-001 | 1. | PO. | `tests/audit-log.test.mjs:18` | asserted |
| AUDIT-001 | 1. | Before. | `tests/audit-log.test.mjs:21` | asserted |
| AUDIT-001 | 1. | after amendment quantities are read back. | `tests/audit-log.test.mjs:21` | asserted |
| AUDIT-001 | 2. | The exact original policy name. | `tests/audit-log.test.mjs:20` | asserted |
| AUDIT-001 | 2. | limit. | `tests/audit-log.test.mjs:20` | asserted |
| AUDIT-001 | 2. | amount. | `tests/audit-log.test.mjs:20` | asserted |
| AUDIT-001 | 2. | reason are retained. | `tests/audit-log.test.mjs:20` | asserted |
| AUDIT-001 | 2. | The amendment retains both quantities. | `tests/audit-log.test.mjs:21` | asserted |
| AUDIT-001 | 2. | its reason. | `tests/audit-log.test.mjs:21` | asserted |
| AUDIT-001 | 2. | Current-policy edits do not rewrite exported approval evidence. | `tests/audit-log.test.mjs:23` | asserted |
| AUDIT-001 | 3. | CSV contains the original policy. | `tests/audit-log.test.mjs:23` | asserted |
| AUDIT-001 | 3. | amendment reason. | `tests/audit-log.test.mjs:23` | asserted |
| AUDIT-001 | 3. | CSV has exactly the filtered event identities. | none | none |
| AUDIT-001 | 3. | count. | none | none |
| AUDIT-001 | 4. | Member grant appears under its exact action filter. | `tests/audit-log.test.mjs:24` | asserted |
| AUDIT-001 | 4. | Inclusive same-day action filter returns exactly the amendment. | `tests/audit-log.test.mjs:22` | asserted |
| AUDIT-001 | 5. | Signed-out. | `tests/audit-log.test.mjs:27` | asserted |
| AUDIT-001 | 5. | requester. | `tests/audit-log.test.mjs:27` | asserted |
| AUDIT-001 | 5. | buyer read. | `tests/audit-log.test.mjs:27` | asserted |
| AUDIT-001 | 5. | export refusals occur. | `tests/audit-log.test.mjs:27` | asserted |
| AUDIT-001 | 5. | Denied. | `tests/audit-log.test.mjs:29` | asserted |
| AUDIT-001 | 5. | invalid reads leave all domain state unchanged. | `tests/audit-log.test.mjs:29` | asserted |
| AUDIT-001 | previous 6. | Future event-source acceptance is a scope pointer. | none | moved |
| SECURITY-001 | 1. | Owner storage retains all requested protected fields. | `tests/supplier-duplicates.test.mjs:145` | asserted |
| SECURITY-001 | 1. | Authorized reauthenticated owner reveals each exact field. | `tests/supplier-duplicates.test.mjs:162` | asserted |
| SECURITY-001 | 1. | Refused writes preserve the protected snapshot. | `tests/supplier-duplicates.test.mjs:137` | asserted |
| SECURITY-001 | 1. | Missing reason. | `tests/supplier-duplicates.test.mjs:164` | asserted |
| SECURITY-001 | 1. | invalid fields. | `tests/supplier-duplicates.test.mjs:163` | asserted |
| SECURITY-001 | 1. | stale revision are refused. | `tests/supplier-duplicates.test.mjs:165` | asserted |
| SECURITY-001 | 1. | Cross-origin refusal preserves all protected values. | `tests/supplier-duplicates.test.mjs:182` | asserted |
| SECURITY-001 | 1. | Revoked authority is refused. | `tests/supplier-duplicates.test.mjs:189` | asserted |
| SECURITY-001 | 2. | Owner. | `tests/supplier-duplicates.test.mjs:150` | asserted |
| SECURITY-001 | 2. | buyer projections contain only their declared masks. | `tests/supplier-duplicates.test.mjs:150` | asserted |
| SECURITY-001 | 2. | Requester. | `tests/supplier-duplicates.test.mjs:152` | asserted |
| SECURITY-001 | 2. | approver. | `tests/supplier-duplicates.test.mjs:152` | asserted |
| SECURITY-001 | 2. | receiver projections contain only presence indicators. | `tests/supplier-duplicates.test.mjs:152` | asserted |
| SECURITY-001 | 2. | Every unauthorized reveal is refused. | `tests/supplier-duplicates.test.mjs:156` | asserted |
| SECURITY-001 | 2. | Store. | `tests/supplier-duplicates.test.mjs:171` | asserted |
| SECURITY-001 | 2. | reveal. | `tests/supplier-duplicates.test.mjs:171` | asserted |
| SECURITY-001 | 2. | refusal audit events contain no protected values. | `tests/supplier-duplicates.test.mjs:171` | asserted |
| SECURITY-001 | 3. | All refusal responses omit the protected values. | `tests/supplier-duplicates.test.mjs:192` | asserted |
| SECURITY-001 | 4. | State. | `tests/supplier-duplicates.test.mjs:170` | asserted |
| SECURITY-001 | 4. | audit. | `tests/supplier-duplicates.test.mjs:170` | asserted |
| SECURITY-001 | 4. | accounting. | `tests/supplier-duplicates.test.mjs:170` | asserted |
| SECURITY-001 | 4. | search omit full protected values. | `tests/supplier-duplicates.test.mjs:170` | asserted |
| SECURITY-001 | 4. | Every suffix is absent from every named PDF. | none | none |
| SECURITY-001 | 4. | mail. | none | none |
| SECURITY-001 | 4. | log. | none | none |
| SECURITY-001 | 4. | agent-context output. | none | none |
| SECURITY-001 | 5. | Concurrent changes settle one success. | `tests/supplier-duplicates.test.mjs:166` | asserted |
| SECURITY-001 | 5. | one conflict. | `tests/supplier-duplicates.test.mjs:166` | asserted |
| SECURITY-001 | 5. | Concurrent reveal/change settles one success. | `tests/supplier-duplicates.test.mjs:167` | asserted |
| SECURITY-001 | 5. | one conflict. | `tests/supplier-duplicates.test.mjs:167` | asserted |
| SECURITY-002 | 1. | Every connector secret is shown only once through each credential lifecycle. | none | none |
| SECURITY-002 | 2. | Rotation reports all three values checked. | `tests/supplier-duplicates.test.mjs:232` | asserted |
| SECURITY-002 | 2. | preserves other product records. | `tests/supplier-duplicates.test.mjs:232` | asserted |
| SECURITY-002 | 2. | Every rotated ciphertext decrypts under the new key to the original payload. | `tests/supplier-duplicates.test.mjs:235` | asserted |
| SECURITY-002 | 2. | Missing-key data is labelled unavailable. | `tests/supplier-duplicates.test.mjs:240` | asserted |
| SECURITY-002 | 2. | returns the explicit refusal. | `tests/supplier-duplicates.test.mjs:240` | asserted |
| SECURITY-002 | 2. | Rotation audit fields are independently read back. | none | none |
| SECURITY-003 | 1. | Default export byte-search excludes protected values. | none | none |
| SECURITY-003 | 1. | encrypted values. | none | none |
| SECURITY-003 | 1. | matching-key material. | none | none |
| SECURITY-003 | 1. | Ordinary matching continues after actual default restore. | none | none |
| SECURITY-003 | 1. | Invoice evidence is cryptographically checked after actual default restore. | none | none |
| SECURITY-003 | 2. | Wrong passphrase leaves all ordinary. | `tests/integration-tokens.test.mjs:227` | asserted |
| SECURITY-003 | 2. | protected rows unchanged. | `tests/integration-tokens.test.mjs:227` | asserted |
| SECURITY-003 | 2. | Explicit included restoration reveals the exact original field. | `tests/integration-tokens.test.mjs:243` | asserted |
| SECURITY-004 | 1. | Every migrated invoice retains its original hash bytes. | `tests/invoice-risk.test.mjs:114` | asserted |
| SECURITY-004 | 1. | Unsupported state or altered bound hash is refused. | `tests/invoice-risk.test.mjs:121` | asserted |
| SECURITY-004 | 1. | New evidence’s altered hash fails actual verification. | `tests/invoice-risk.test.mjs:123` | asserted |
| SECURITY-004 | 1. | Actual restore refuses inconsistent evidence with zero published rows. | `tests/invoice-risk.test.mjs:150` | asserted |
| SECURITY-004 | 1. | Every migration state is independently verified rather than merely accepted as a label. | none | none |
| SECURITY-004 | 1. | The migration. | none | none |
| SECURITY-004 | 1. | restore leave every existing invoice-risk hold unchanged. | none | none |
| ERASURE-001 | 1. | Departed member receipt lists removed policy. | `tests/erasure-flow.mjs:61` | asserted |
| ERASURE-001 | 1. | revision fields. | `tests/erasure-flow.mjs:61` | asserted |
| ERASURE-001 | 1. | Supplier contact erasure completes. | `tests/erasure-flow.mjs:63` | asserted |
| ERASURE-001 | 1. | Domain rows. | `tests/erasure-flow.mjs:65` | asserted |
| ERASURE-001 | 1. | public audit/CSV contain no retained personal values. | `tests/erasure-flow.mjs:65` | asserted |
| ERASURE-001 | 1. | PO. | `tests/erasure-flow.mjs:70` | asserted |
| ERASURE-001 | 1. | invoice amounts. | `tests/erasure-flow.mjs:70` | asserted |
| ERASURE-001 | 1. | financial chronology remain intact. | `tests/erasure-flow.mjs:70` | asserted |
| ERASURE-001 | 1. | Actual restore cannot resurrect the removed values or originals. | `tests/erasure-flow.mjs:83` | asserted |
| ERASURE-001 | 2. | Private RFQ original is withdrawn. | `tests/erasure-flow.mjs:68` | asserted |
| ERASURE-001 | 2. | Anonymous offer. | `tests/erasure-flow.mjs:70` | asserted |
| ERASURE-001 | 2. | award links remain intact. | `tests/erasure-flow.mjs:70` | asserted |
| ERASURE-001 | 2. | Every nominated contact snapshot. | none | none |
| ERASURE-001 | 2. | personal supplier-response field is independently checked. | none | none |
| ERASURE-001 | 3. | All email original. | `tests/erasure-flow.mjs:67` | asserted |
| ERASURE-001 | 3. | attachment downloads are withdrawn. | `tests/erasure-flow.mjs:67` | asserted |
| ERASURE-001 | 3. | Public state. | `tests/erasure-flow.mjs:66` | asserted |
| ERASURE-001 | 3. | audit. | `tests/erasure-flow.mjs:66` | asserted |
| ERASURE-001 | 3. | CSV. | `tests/erasure-flow.mjs:66` | asserted |
| ERASURE-001 | 3. | PO output contain none of the removed personal values. | `tests/erasure-flow.mjs:66` | asserted |
| ERASURE-001 | 3. | Provider replay remains non-authorizing. | `tests/erasure-flow.mjs:77` | asserted |
| ERASURE-001 | 3. | The archive does not retain removed personal values. | `tests/erasure-flow.mjs:78` | asserted |
| ERASURE-001 | 4. | Retained TIN decrypts only through the owner reveal door. | `tests/erasure-flow.mjs:75` | asserted |
| ERASURE-001 | 4. | Persisted retained TIN is encrypted. | `tests/erasure-flow.mjs:76` | asserted |
| ERASURE-001 | 4. | A later journal refuses the pre-erasure backup without writes. | `tests/erasure-flow.mjs:80` | asserted |
| ERASURE-001 | 5. | Retained financial values are compared with the prior amounts. | `tests/erasure-flow.mjs:70` | asserted |
| ERASURE-001 | 5. | Restored data has no removed personal values or originals. | `tests/erasure-flow.mjs:83` | asserted |
| ERASURE-001 | 6. | Original evidence hash. | `tests/erasure-flow.mjs:71` | asserted |
| ERASURE-001 | 6. | state are retained with the source-erased label. | `tests/erasure-flow.mjs:71` | asserted |
| ERASURE-001 | 6. | Removing the journal causes evidence/erasure validation failure. | `tests/erasure-flow.mjs:73` | asserted |
| AGENT-005 | 1. | The approved exact request revision promises fifty seats. | `tests/agent-value.test.mjs:35` | asserted |
| AGENT-005 | 1. | The imported provider original reports thirty-one active of fifty seats. | `tests/agent-value.test.mjs:64` | asserted |
| AGENT-005 | 1. | The report shows the nineteen-seat shortfall. | `tests/agent-value.test.mjs:66` | asserted |
| AGENT-005 | 1. | receipt source. | `tests/agent-value.test.mjs:66` | asserted |
| AGENT-005 | 1. | The run identifies the exact original source attachment. | `tests/agent-value.test.mjs:67` | asserted |
| AGENT-005 | 1. | The requester receives the usefulness ProposedAction. | `tests/agent-value.test.mjs:70` | asserted |
| AGENT-005 | 2. | Confirmed outcome annotations retain exact realized-savings source versions. | none | none |
| AGENT-005 | 2. | Unsigned. | none | none |
| AGENT-005 | 2. | unawarded discounts never create realized savings. | none | none |
| AGENT-005 | 3. | The report amount. | none | none |
| AGENT-005 | 3. | all drill-through sources are independently compared. | none | none |
| AGENT-006 | 1. | The scenario has exact baseline. | `tests/agent-value.test.mjs:169` | asserted |
| AGENT-006 | 1. | proposed. | `tests/agent-value.test.mjs:169` | asserted |
| AGENT-006 | 1. | cash-effect amounts. | `tests/agent-value.test.mjs:169` | asserted |
| AGENT-006 | 1. | The recorded agreement notice deadline. | `tests/agent-value.test.mjs:171` | asserted |
| AGENT-006 | 1. | supplier issue source are retained. | `tests/agent-value.test.mjs:171` | asserted |
| AGENT-006 | 1. | Every recorded forecast figure recomputes from its cited source terms. | `tests/agent-value.test.mjs:187` | asserted |
| AGENT-006 | 1. | A company-selected held policy is independently proven for sending. | none | none |
| AGENT-006 | 1. | cancellation. | none | none |
| AGENT-008 | 1. | Both near-threshold requests are identified in one split flag. | `tests/coding-agent.test.mjs:16` | asserted |
| AGENT-008 | 1. | The current approver can read the flag. | `tests/coding-agent.test.mjs:18` | asserted |
| AGENT-008 | 1. | The new invoice’s coding suggestion cites prior invoice sources. | `tests/coding-agent.test.mjs:33` | asserted |
| AGENT-008 | 2. | Two human corrections are retained as corrected examples. | `tests/coding-agent.test.mjs:41` | asserted |
| AGENT-008 | 2. | The third invoice suggests the corrected GL account. | `tests/coding-agent.test.mjs:45` | asserted |
| AGENT-008 | 2. | The third suggestion cites exactly the two correction sources. | `tests/coding-agent.test.mjs:46` | asserted |
| AGENT-010 | 1. | The configured run sends two chases. | `tests/agent-governance.test.mjs:32` | asserted |
| AGENT-010 | 1. | one escalation. | `tests/agent-governance.test.mjs:32` | asserted |
| AGENT-010 | 1. | never a third chase. | `tests/agent-governance.test.mjs:32` | asserted |
| AGENT-010 | 1. | Pausing during a send suppresses the next chase. | `tests/agent-governance.test.mjs:46` | asserted |
| AGENT-010 | 1. | escalation. | `tests/agent-governance.test.mjs:46` | asserted |
| AGENT-010 | 1. | Every retained run includes inputs. | `tests/agent-governance.test.mjs:36` | asserted |
| AGENT-010 | 1. | sources. | `tests/agent-governance.test.mjs:36` | asserted |
| AGENT-010 | 1. | mode. | `tests/agent-governance.test.mjs:36` | asserted |
| AGENT-010 | 1. | provider. | `tests/agent-governance.test.mjs:36` | asserted |
| AGENT-010 | 1. | messages. | `tests/agent-governance.test.mjs:36` | asserted |
| AGENT-010 | 1. | proposals. | `tests/agent-governance.test.mjs:36` | asserted |
| AGENT-010 | 1. | outcomes. | `tests/agent-governance.test.mjs:36` | asserted |
| AGENT-010 | 1. | The planted supplier instruction changes neither recipient nor message content. | `tests/agent-governance.test.mjs:34` | asserted |
| AGENT-010 | 2. | Run context contains neither full protected values nor suffixes. | `tests/agent-governance.test.mjs:42` | asserted |
| AGENT-010 | 2. | A separately authorized sensitive/security operation is classified. | none | none |
| AGENT-010 | 2. | decided by company policy. | none | none |
| AGENT-011 | 1. | Each of three finance answers equals the corresponding full report. | `tests/spend-report.test.mjs:127` | asserted |
| AGENT-011 | 1. | figures. | `tests/spend-report.test.mjs:127` | asserted |
| AGENT-011 | 1. | Every figure retains versioned source references. | `tests/spend-report.test.mjs:127` | asserted |
| AGENT-011 | 1. | The department requester sees its colleague but no hidden-department identity. | `tests/spend-report.test.mjs:128` | asserted |
| AGENT-011 | 1. | The requester’s result equals its scoped report read. | `tests/spend-report.test.mjs:128` | asserted |
| AGENT-011 | 1. | Invoice. | `tests/spend-report.test.mjs:129` | asserted |
| AGENT-011 | 1. | PO drill-through identifies the source records. | `tests/spend-report.test.mjs:129` | asserted |
| AGENT-011 | 1. | Unsupported questions are declined with reason. | `tests/spend-report.test.mjs:130` | asserted |
| AGENT-011 | 1. | no invented report. | `tests/spend-report.test.mjs:130` | asserted |
