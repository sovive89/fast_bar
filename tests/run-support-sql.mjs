/** Real disposable PostgreSQL checks, no production credentials. Requires Docker. */
import { spawn, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
const container = `fastbar-support-sql-${process.pid}`;
const TENANT = "00000000-0000-4000-8000-000000000001";
const OTHER = "00000000-0000-4000-8000-000000000002";
const SESSION = "00000000-0000-4000-8000-000000000003";
const PENDING = "00000000-0000-4000-8000-000000000004";
const PAID = "00000000-0000-4000-8000-000000000005";
const RACE = "00000000-0000-4000-8000-000000000006";
const exec = (args, input) => {
  const r = spawnSync("docker", args, { input, encoding: "utf8" });
  if (r.status !== 0) throw new Error(r.stderr || r.stdout || "Docker command failed");
  return r.stdout.trim();
};
const query = (sql) =>
  exec(["exec", "-i", container, "psql", "-U", "postgres", "-v", "ON_ERROR_STOP=1", "-Atq"], sql);
const concurrent = (sql) =>
  new Promise((resolve, reject) => {
    const child = spawn("docker", [
      "exec",
      "-i",
      container,
      "psql",
      "-U",
      "postgres",
      "-v",
      "ON_ERROR_STOP=1",
      "-Atq",
    ]);
    let output = "",
      error = "";
    child.stdout.on("data", (x) => (output += x));
    child.stderr.on("data", (x) => (error += x));
    child.on("error", reject);
    child.on("exit", (code) => (code === 0 ? resolve(output.trim()) : reject(new Error(error))));
    child.stdin.end(sql);
  });
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};
try {
  exec([
    "run",
    "--rm",
    "-d",
    "--name",
    container,
    "-e",
    "POSTGRES_PASSWORD=disposable-local-test",
    "postgres:17-alpine",
  ]);
  for (let n = 0; n < 30; n++) {
    const r = spawnSync("docker", ["exec", container, "pg_isready", "-U", "postgres"]);
    if (r.status === 0) break;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  query(`create role anon; create role authenticated; create role service_role bypassrls;
 create table public.fastbar_tenants(id uuid primary key);
 create table public.fastbar_sessions(id uuid primary key,tenant_id uuid not null references public.fastbar_tenants(id),status text not null,customer_name text);
 grant usage on schema public to anon,authenticated,service_role;
 grant select,update on public.fastbar_sessions to service_role;
 insert into public.fastbar_tenants values('${TENANT}'),('${OTHER}');
 insert into public.fastbar_sessions values('${SESSION}','${TENANT}','open','Teste'),('${PENDING}','${TENANT}','pending','Pendente'),('${PAID}','${TENANT}','paid','Pago'),('${RACE}','${TENANT}','open','Concorrente');`);
  query(
    readFileSync(
      fileURLToPath(
        new URL("../supabase/migrations/20261104192808_support_requests.sql", import.meta.url),
      ),
      "utf8",
    ),
  );
  const roleSql = `set role service_role;`;
  const request = (session = SESSION, opted = true, tenant = TENANT) =>
    `select public.fastbar_request_support('${tenant}','${session}',${opted});`;
  assert(
    query(
      `select relrowsecurity from pg_class where oid='public.fastbar_support_requests'::regclass;`,
    ) === "t",
    "request RLS disabled",
  );
  assert(
    query(
      `select relrowsecurity from pg_class where oid='public.fastbar_support_messages'::regclass;`,
    ) === "t",
    "chat RLS disabled",
  );
  for (const role of ["anon", "authenticated"])
    for (const table of ["fastbar_support_requests", "fastbar_support_messages"]) {
      assert(
        query(
          `select has_table_privilege('${role}','public.${table}','SELECT,INSERT,UPDATE,DELETE');`,
        ) === "f",
        `${role} table grant leaked`,
      );
    }
  for (const role of ["anon", "authenticated"]) {
    assert(
      query(
        `select has_function_privilege('${role}','public.fastbar_request_support(uuid,uuid,boolean)','EXECUTE');`,
      ) === "f",
      `${role} request RPC exposed`,
    );
    assert(
      query(
        `select has_function_privilege('${role}','public.fastbar_send_support_message(uuid,uuid,uuid,text,text,text)','EXECUTE');`,
      ) === "f",
      `${role} chat RPC exposed`,
    );
  }
  assert(JSON.parse(query(roleSql + request(SESSION, false))).ok === false, "no opt-in accepted");
  assert(JSON.parse(query(roleSql + request(PENDING))).ok === false, "pending session accepted");
  assert(JSON.parse(query(roleSql + request(PAID))).ok === false, "new paid session accepted");
  assert(
    JSON.parse(query(roleSql + request(SESSION, true, OTHER))).ok === false,
    "cross tenant accepted",
  );
  const first = JSON.parse(query(roleSql + request()));
  assert(first.ok === true && !first.escalated, "first request failed");
  const repeated = JSON.parse(query(roleSql + request()));
  assert(repeated.id === first.id && repeated.alreadyRequested, "duplicate generated");
  const race = await Promise.all(
    Array.from({ length: 8 }, () => concurrent(roleSql + request(RACE))),
  );
  const raceRows = race.map((x) => JSON.parse(x));
  assert(new Set(raceRows.map((x) => x.id)).size === 1, "concurrent requests duplicated");
  assert(raceRows.filter((x) => !x.alreadyRequested).length === 1, "multiple concurrent creates");
  const chat = (
    session = SESSION,
    sender = "customer",
    body = "Preciso de apoio",
    tenant = TENANT,
    requestId = first.id,
  ) =>
    `select public.fastbar_send_support_message('${tenant}','${requestId}','${session}','${sender}','${body}',${sender === "staff" ? "'Atendente teste'" : "null"});`;
  assert(JSON.parse(query(roleSql + chat(PENDING))).ok === false, "wrong session chat accepted");
  assert(
    JSON.parse(query(roleSql + chat(SESSION, "customer", "teste", OTHER))).ok === false,
    "cross tenant chat accepted",
  );
  assert(JSON.parse(query(roleSql + chat())).ok === true, "customer chat failed");
  assert(JSON.parse(query(roleSql + chat())).ok === false, "rate limit bypassed");
  assert(
    JSON.parse(query(roleSql + chat(SESSION, "staff", "Estamos indo"))).ok === true,
    "staff chat failed",
  );
  assert(
    JSON.parse(query(roleSql + chat(SESSION, "staff", "x".repeat(1001)))).ok === false,
    "long message accepted",
  );
  query(
    `update public.fastbar_sessions set status='paid' where id='${SESSION}'; update public.fastbar_support_messages set created_at=created_at-interval '2 seconds';`,
  );
  assert(JSON.parse(query(roleSql + chat())).ok === true, "payment interrupted existing chat");
  assert(
    JSON.parse(query(roleSql + request())).id === first.id,
    "payment interrupted existing request",
  );
  query(
    roleSql +
      `update public.fastbar_support_requests set status='attending',attended_at=now(),attended_by='Atendente teste' where id='${first.id}' and status='requested';
 update public.fastbar_support_requests set status='completed',completed_at=now(),completed_by='Atendente teste',completion_note='Atendimento finalizado' where id='${first.id}' and status='attending';`,
  );
  assert(JSON.parse(query(roleSql + chat())).ok === false, "message sent after completion");
  const escalated = JSON.parse(query(roleSql + request()));
  assert(
    escalated.ok && escalated.escalated && escalated.id !== first.id,
    "unresolved support after payment did not escalate",
  );
  query(`update public.fastbar_support_requests set completed_at=now()-interval '91 days' where id='${first.id}';
 delete from public.fastbar_support_requests where status='completed' and completed_at<now()-interval '90 days';`);
  assert(
    query(
      `select count(*) from public.fastbar_support_messages where request_id='${first.id}';`,
    ) === "0",
    "retention failed to cascade messages",
  );
  console.log(
    "PASS PostgreSQL17: migration, RLS/table+RPC grants, opt-in, pending/paid creation guard, tenant/session isolation, 8 concurrent requests, chat rate limit, paid continuity, completion guard, escalation, retention cascade.",
  );
} finally {
  spawnSync("docker", ["rm", "-f", container], { stdio: "ignore" });
}
