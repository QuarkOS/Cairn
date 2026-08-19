import { DAY_MS, isoOf } from "./execute";
import { asFactId, asSessionId } from "./brand";
import type { Fact, Store } from "./model";

export function seedStore(nowMs: number): Store {
  const ago = (days: number) => isoOf(nowMs - days * DAY_MS);
  const ahead = (days: number) => isoOf(nowMs + days * DAY_MS);
  const facts: Fact[] = [
    {
      id: "f-0084" as Fact["id"],
      entity: "user:mira" as Fact["entity"],
      attribute: "review.preference" as Fact["attribute"],
      value: {
        kind: "text",
        text: "Small stacked PRs; never mix refactors into a feature diff",
      },
      provenance: { kind: "told", by: "mira", session: "s-013" as Fact["provenance"]["session"] },
      validity: { kind: "until-superseded" },
      assertedAt: ago(30),
      supersedes: null,
    },
    {
      id: "f-0087" as Fact["id"],
      entity: "repo:acme/checkout" as Fact["entity"],
      attribute: "deploy.command" as Fact["attribute"],
      value: { kind: "text", text: "make deploy-staging" },
      provenance: {
        kind: "observed",
        command: "make -n deploy-staging",
        session: "s-014" as Fact["provenance"]["session"],
      },
      validity: { kind: "until-superseded" },
      assertedAt: ago(22),
      supersedes: null,
    },
    {
      id: "f-0090" as Fact["id"],
      entity: "repo:acme/checkout" as Fact["entity"],
      attribute: "ci.flaky-test" as Fact["attribute"],
      value: { kind: "text", text: "test_payment_retry" },
      provenance: {
        kind: "observed",
        command: "gh run view 4182 --log-failed",
        session: "s-015" as Fact["provenance"]["session"],
      },
      validity: {
        kind: "reverify",
        command: "npm test -- payment_retry --repeat 20",
        staleAfterSeconds: 1_209_600,
      },
      assertedAt: ago(20),
      supersedes: null,
    },
    {
      id: "f-0092" as Fact["id"],
      entity: "env:staging" as Fact["entity"],
      attribute: "database.host" as Fact["attribute"],
      value: { kind: "text", text: "pg-staging-2.internal" },
      provenance: {
        kind: "observed",
        command: "kubectl -n staging get svc",
        session: "s-015" as Fact["provenance"]["session"],
      },
      validity: {
        kind: "reverify",
        command: "dig +short pg-staging-2.internal",
        staleAfterSeconds: 604_800,
      },
      assertedAt: ago(12),
      supersedes: null,
    },
    {
      id: "f-0095" as Fact["id"],
      entity: "env:staging" as Fact["entity"],
      attribute: "tls.cert-expires" as Fact["attribute"],
      value: { kind: "instant", at: ago(3) },
      provenance: {
        kind: "observed",
        command:
          "openssl s_client -connect staging.acme.dev:443 2>/dev/null | openssl x509 -noout -enddate",
        session: "s-016" as Fact["provenance"]["session"],
      },
      validity: { kind: "expires", at: ago(3) },
      assertedAt: ago(15),
      supersedes: null,
    },
    {
      id: "f-0102" as Fact["id"],
      entity: "ticket:PAY-812" as Fact["entity"],
      attribute: "status" as Fact["attribute"],
      value: { kind: "text", text: "blocked-on-legal" },
      provenance: { kind: "told", by: "mira", session: "s-017" as Fact["provenance"]["session"] },
      validity: {
        kind: "reverify",
        command: "linear issue view PAY-812",
        staleAfterSeconds: 864_000,
      },
      assertedAt: ago(9),
      supersedes: null,
    },
    {
      id: "f-0103" as Fact["id"],
      entity: "ticket:PAY-812" as Fact["entity"],
      attribute: "owner" as Fact["attribute"],
      value: { kind: "reference", entity: "user:mira" as Fact["entity"] },
      provenance: {
        kind: "observed",
        command: "linear issue view PAY-812",
        session: "s-017" as Fact["provenance"]["session"],
      },
      validity: { kind: "until-superseded" },
      assertedAt: ago(9),
      supersedes: null,
    },
    {
      id: "f-0108" as Fact["id"],
      entity: "repo:acme/checkout" as Fact["entity"],
      attribute: "test.e2e-duration" as Fact["attribute"],
      value: { kind: "quantity", amount: 14, unit: "min" },
      provenance: {
        kind: "observed",
        command: "time npm run test:e2e",
        session: "s-018" as Fact["provenance"]["session"],
      },
      validity: {
        kind: "reverify",
        command: "time npm run test:e2e",
        staleAfterSeconds: 2_592_000,
      },
      assertedAt: ago(8),
      supersedes: null,
    },
    {
      id: "f-0113" as Fact["id"],
      entity: "repo:acme/checkout" as Fact["entity"],
      attribute: "deploy.command" as Fact["attribute"],
      value: { kind: "text", text: "bin/ship --env staging" },
      provenance: {
        kind: "observed",
        command: "cat Makefile && bin/ship --help",
        session: "s-019" as Fact["provenance"]["session"],
      },
      validity: { kind: "until-superseded" },
      assertedAt: ago(6),
      supersedes: "f-0087" as Fact["id"],
    },
    {
      id: "f-0116" as Fact["id"],
      entity: "env:staging" as Fact["entity"],
      attribute: "flag.new-tax-engine" as Fact["attribute"],
      value: { kind: "flag", flag: true },
      provenance: { kind: "told", by: "mira", session: "s-020" as Fact["provenance"]["session"] },
      validity: { kind: "until-superseded" },
      assertedAt: ago(2),
      supersedes: null,
    },
    {
      id: "f-0117" as Fact["id"],
      entity: "repo:acme/checkout" as Fact["entity"],
      attribute: "release.freeze" as Fact["attribute"],
      value: { kind: "flag", flag: true },
      provenance: {
        kind: "inferred",
        from: [asFactId("f-0102"), asFactId("f-0116")],
        session: asSessionId("s-020"),
      },
      validity: { kind: "expires", at: ahead(9) },
      assertedAt: ago(2),
      supersedes: null,
    },
  ];
  return { facts, retractions: [], stamps: [] };
}
