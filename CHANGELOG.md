# Changelog

## 0.2.0

The first release since 0.1.1 (25 Oct 2026). It carries the work landed on main since then and makes the hosted demo start.

### Hosted demo

- The demo starts in seconds. Its twelve sample suppliers were each screened against the live Commerce screening list while the demo was being prepared: a 19 MB download and a full parse per supplier, well over a minute in all, so the start ran past its one-minute reservation and every visitor saw "The demo did not start". The sample suppliers are now screened against a one-entry sample list, named as sample data in each supplier's screening history. A supplier a visitor adds or screens again still reads the live list.
- Each published release redeploys the demo at its tag.

### Purchasing

- An agent door: paired agents work inside company money limits, with a named person's approval for anything over a cap.
- SAML sign-in.
- Cross-team reviews, conditional approval pools and parallel reviews.
- Supplier tax records with W-9 review, supplier shipment receipts and receipt corrections, deposits and deposit rules.
- Travel requests with mileage rates, internal comments with scoped search, reviewed budget dispositions, and a record of how a restore established its erasure history.
- A Business can run Purse with mail off, and Purse takes its name, brand and people from a connected Business.

### Upgrading

- Thirteen migrations, 0038 to 0050, apply in order on the next deploy. Keep the previous source and a private native export first (OPERATIONS.md).
- Built with rer 0.2.140.
