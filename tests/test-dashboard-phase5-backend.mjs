import { createCompany, listMyCompanies } from '../worker/src/companies.js';
import { BUILTIN_WIDGETS, getCompanyDefaultLayout, getLayout, saveLayout, setCompanyDefaultLayout } from '../worker/src/layouts.js';
import { ShimDB } from './d1shim.mjs';

let passed = 0;
let failed = 0;

async function test(name, fn) {
  try {
    await fn();
    passed++;
    console.log('PASS ' + name);
  } catch (e) {
    failed++;
    console.log('FAIL ' + name + ': ' + (e && e.message ? e.message : e));
  }
}

function eq(actual, expected, label) {
  if (actual !== expected) throw new Error(label + ': expected ' + JSON.stringify(expected) + ', got ' + JSON.stringify(actual));
}

function ok(value, label) {
  if (!value) throw new Error(label + ': expected truthy value');
}

function sess(userId) {
  return { user_id: userId, purpose: 'session' };
}

async function expectFail(fn, status, label) {
  try {
    await fn();
  } catch (e) {
    if (e && e.status === status) return;
    throw new Error(label + ': expected status ' + status + ', got ' + (e && e.status ? e.status + ' ' + e.message : e));
  }
  throw new Error(label + ': expected failure with status ' + status + ', got success');
}

function makeEnv() {
  const db = new ShimDB();
  const env = { DB: db };
  const entitlements = [
    ['kluzar-user-owner-a', 'max', 'active'],
    ['kluzar-user-owner-b', 'max', 'active'],
    ['kluzar-user-starter', 'free', 'active'],
    ['kluzar-user-growth', 'growth', 'active'],
    ['kluzar-user-expired', 'max', 'expired'],
    ['kluzar-user-rate', 'max', 'active'],
  ];
  for (const [userId, plan, status] of entitlements) {
    db.insert('entitlements', { user_id: userId, plan, status });
  }
  const now = new Date().toISOString();
  db.insert('companies', { id: 'comp-a', owner_user_id: 'kluzar-user-owner-a', name: 'Alpha Company', created_at: now, updated_at: now });
  db.insert('companies', { id: 'comp-b', owner_user_id: 'kluzar-user-owner-b', name: 'Beta Company', created_at: now, updated_at: now });
  db.insert('companies', { id: 'comp-expired', owner_user_id: 'kluzar-user-expired', name: 'Expired Company', created_at: now, updated_at: now });
  db.insert('companies', { id: 'comp-rate', owner_user_id: 'kluzar-user-rate', name: 'Rate Company', created_at: now, updated_at: now });
  const members = [
    ['comp-a', 'kluzar-user-owner-a', 'owner', null, 'active'],
    ['comp-a', 'kluzar-user-admin-a', 'admin', null, 'active'],
    ['comp-a', 'dash-manager-a', 'manager', 'dept-a1', 'active'],
    ['comp-a', 'dash-employee-a', 'employee', 'dept-a1', 'active'],
    ['comp-a', 'dash-employee2-a', 'employee', 'dept-a2', 'active'],
    ['comp-a', 'dash-removed-a', 'employee', 'dept-a1', 'removed'],
    ['comp-b', 'kluzar-user-owner-b', 'owner', null, 'active'],
    ['comp-b', 'dash-employee-b', 'employee', 'dept-b1', 'active'],
    ['comp-expired', 'kluzar-user-expired', 'owner', null, 'active'],
    ['comp-rate', 'kluzar-user-rate', 'owner', null, 'active'],
  ];
  for (const [companyId, userId, role, dept, status] of members) {
    db.insert('company_members', { company_id: companyId, user_id: userId, role, department_id: dept, status, invited_by: null, joined_at: now });
  }
  return { env, db };
}

async function rows(db, sql, params) {
  const res = await db.prepare(sql).bind(...params).all();
  return (res && res.results) || [];
}

await test('company create guest denied', async () => {
  const { env } = makeEnv();
  await expectFail(() => createCompany(env, null, { name: 'Nope' }), 401, 'guest create');
});

await test('company create starter denied', async () => {
  const { env } = makeEnv();
  await expectFail(() => createCompany(env, sess('kluzar-user-starter'), { name: 'Nope' }), 403, 'starter create');
});

await test('company create growth denied', async () => {
  const { env } = makeEnv();
  await expectFail(() => createCompany(env, sess('kluzar-user-growth'), { name: 'Nope' }), 403, 'growth create');
});

await test('company create expired max denied', async () => {
  const { env } = makeEnv();
  await expectFail(() => createCompany(env, sess('kluzar-user-expired'), { name: 'Nope' }), 403, 'expired create');
});

await test('company create member without entitlement denied', async () => {
  const { env } = makeEnv();
  await expectFail(() => createCompany(env, sess('dash-employee-a'), { name: 'Nope' }), 403, 'member create');
});

await test('company create max owner succeeds with membership and log', async () => {
  const { env, db } = makeEnv();
  const res = await createCompany(env, sess('kluzar-user-owner-a'), { name: 'Gamma Company' });
  eq(res.ok, true, 'create ok');
  ok(res.company.id, 'company id');
  eq(res.company.name, 'Gamma Company', 'company name');
  eq(res.company.ownerUserId, 'kluzar-user-owner-a', 'company owner');
  const companyRows = await rows(db, 'SELECT * FROM companies WHERE id = ?', [res.company.id]);
  eq(companyRows.length, 1, 'company row');
  eq(companyRows[0].owner_user_id, 'kluzar-user-owner-a', 'company row owner');
  const memberRows = await rows(db, 'SELECT * FROM company_members WHERE company_id = ? AND user_id = ?', [res.company.id, 'kluzar-user-owner-a']);
  eq(memberRows.length, 1, 'owner membership row');
  eq(memberRows[0].role, 'owner', 'owner membership role');
  eq(memberRows[0].status, 'active', 'owner membership status');
  const logRows = await rows(db, 'SELECT * FROM activity_logs WHERE company_id = ? AND action = ?', [res.company.id, 'company_created']);
  eq(logRows.length, 1, 'company created log');
  const mine = await listMyCompanies(env, sess('kluzar-user-owner-a'));
  ok(mine.companies.find((c) => c.id === res.company.id), 'new company in memberships');
});

await test('company create name validation', async () => {
  const { env } = makeEnv();
  const bad = [{}, { name: '' }, { name: '   ' }, { name: 'x'.repeat(201) }, { name: 123 }];
  for (const body of bad) {
    await expectFail(() => createCompany(env, sess('kluzar-user-owner-a'), body), 400, 'bad name ' + JSON.stringify(body));
  }
});

await test('company create leaves existing company unaffected', async () => {
  const { env, db } = makeEnv();
  const beforeMembers = await rows(db, 'SELECT * FROM company_members WHERE company_id = ?', ['comp-a']);
  await createCompany(env, sess('kluzar-user-owner-a'), { name: 'Second Company' });
  const companyRows = await rows(db, 'SELECT * FROM companies WHERE id = ?', ['comp-a']);
  eq(companyRows.length, 1, 'comp-a still exists');
  eq(companyRows[0].name, 'Alpha Company', 'comp-a name unchanged');
  eq(companyRows[0].owner_user_id, 'kluzar-user-owner-a', 'comp-a owner unchanged');
  const afterMembers = await rows(db, 'SELECT * FROM company_members WHERE company_id = ?', ['comp-a']);
  eq(afterMembers.length, beforeMembers.length, 'comp-a members unchanged');
});

await test('company create trims name', async () => {
  const { env } = makeEnv();
  const res = await createCompany(env, sess('kluzar-user-owner-a'), { name: '  Padded Co  ' });
  eq(res.company.name, 'Padded Co', 'trimmed name');
});

await test('layout get guest denied', async () => {
  const { env } = makeEnv();
  await expectFail(() => getLayout(env, null, 'comp-a'), 401, 'guest get layout');
});

await test('layout save guest denied', async () => {
  const { env } = makeEnv();
  await expectFail(() => saveLayout(env, null, { companyId: 'comp-a', widgets: [] }), 401, 'guest save layout');
});

await test('layout default get guest denied', async () => {
  const { env } = makeEnv();
  await expectFail(() => getCompanyDefaultLayout(env, null, 'comp-a'), 401, 'guest get default');
});

await test('layout personal save and load', async () => {
  const { env } = makeEnv();
  const widgets = [{ id: 'overview', x: 0, y: 0, w: 12, h: 4 }, { id: 'team' }];
  const saved = await saveLayout(env, sess('dash-employee-a'), { companyId: 'comp-a', widgets });
  eq(saved.layout.source, 'personal', 'saved source');
  const loaded = await getLayout(env, sess('dash-employee-a'), 'comp-a');
  eq(loaded.layout.source, 'personal', 'loaded source');
  eq(JSON.stringify(loaded.layout.widgets), JSON.stringify(widgets), 'loaded widgets match saved');
});

await test('layout fallback built-in when nothing saved', async () => {
  const { env } = makeEnv();
  const loaded = await getLayout(env, sess('dash-employee-a'), 'comp-a');
  eq(loaded.layout.source, 'built-in', 'built-in source');
  eq(loaded.layout.widgets.map((w) => w.id).join(','), BUILTIN_WIDGETS.map((w) => w.id).join(','), 'built-in widget ids');
});

await test('layout fallback chain personal beats default beats built-in', async () => {
  const { env } = makeEnv();
  const first = await getLayout(env, sess('dash-employee-a'), 'comp-a');
  eq(first.layout.source, 'built-in', 'stage one built-in');
  await setCompanyDefaultLayout(env, sess('kluzar-user-owner-a'), { companyId: 'comp-a', widgets: [{ id: 'activity' }] });
  const second = await getLayout(env, sess('dash-employee-a'), 'comp-a');
  eq(second.layout.source, 'company-default', 'stage two company default');
  eq(second.layout.widgets[0].id, 'activity', 'stage two widgets');
  await saveLayout(env, sess('dash-employee-a'), { companyId: 'comp-a', widgets: [{ id: 'team' }] });
  const third = await getLayout(env, sess('dash-employee-a'), 'comp-a');
  eq(third.layout.source, 'personal', 'stage three personal');
  eq(third.layout.widgets[0].id, 'team', 'stage three widgets');
});

await test('layout company default set by owner ok', async () => {
  const { env } = makeEnv();
  const res = await setCompanyDefaultLayout(env, sess('kluzar-user-owner-a'), { companyId: 'comp-a', widgets: [{ id: 'overview' }] });
  eq(res.layout.source, 'company-default', 'owner default source');
  const loaded = await getCompanyDefaultLayout(env, sess('dash-employee-a'), 'comp-a');
  eq(loaded.layout.source, 'company-default', 'member reads default');
  eq(loaded.layout.widgets[0].id, 'overview', 'member reads default widgets');
});

await test('layout company default set by admin ok', async () => {
  const { env } = makeEnv();
  const res = await setCompanyDefaultLayout(env, sess('kluzar-user-admin-a'), { companyId: 'comp-a', widgets: [{ id: 'team' }] });
  eq(res.layout.source, 'company-default', 'admin default source');
});

await test('layout company default set by manager denied', async () => {
  const { env } = makeEnv();
  await expectFail(() => setCompanyDefaultLayout(env, sess('dash-manager-a'), { companyId: 'comp-a', widgets: [{ id: 'team' }] }), 403, 'manager set default');
});

await test('layout company default set by employee denied', async () => {
  const { env } = makeEnv();
  await expectFail(() => setCompanyDefaultLayout(env, sess('dash-employee-a'), { companyId: 'comp-a', widgets: [{ id: 'team' }] }), 403, 'employee set default');
});

await test('layout company default get built-in when none set', async () => {
  const { env } = makeEnv();
  const loaded = await getCompanyDefaultLayout(env, sess('dash-employee-a'), 'comp-a');
  eq(loaded.layout.source, 'built-in', 'default built-in source');
});

await test('layout cross-company denied on every endpoint', async () => {
  const { env } = makeEnv();
  await expectFail(() => getLayout(env, sess('dash-employee-a'), 'comp-b'), 404, 'cross get layout');
  await expectFail(() => saveLayout(env, sess('dash-employee-a'), { companyId: 'comp-b', widgets: [] }), 404, 'cross save layout');
  await expectFail(() => getCompanyDefaultLayout(env, sess('dash-employee-a'), 'comp-b'), 404, 'cross get default');
  await expectFail(() => setCompanyDefaultLayout(env, sess('dash-employee-a'), { companyId: 'comp-b', widgets: [] }), 404, 'cross set default');
});

await test('layout invalid widget id rejected', async () => {
  const { env } = makeEnv();
  await expectFail(() => saveLayout(env, sess('dash-employee-a'), { companyId: 'comp-a', widgets: [{ id: 'bogus' }] }), 400, 'bogus widget id');
});

await test('layout too many widgets rejected', async () => {
  const { env } = makeEnv();
  const widgets = [];
  for (let i = 0; i < 21; i++) widgets.push({ id: 'overview' });
  await expectFail(() => saveLayout(env, sess('dash-employee-a'), { companyId: 'comp-a', widgets }), 400, 'too many widgets');
});

await test('layout non-array widgets rejected', async () => {
  const { env } = makeEnv();
  await expectFail(() => saveLayout(env, sess('dash-employee-a'), { companyId: 'comp-a', widgets: 'overview' }), 400, 'non-array widgets');
});

await test('layout unknown config key stripped', async () => {
  const { env } = makeEnv();
  await saveLayout(env, sess('dash-employee-a'), { companyId: 'comp-a', widgets: [{ id: 'overview', bogus: 1, config: { title: 'Hi', bogus: 'x' } }] });
  const loaded = await getLayout(env, sess('dash-employee-a'), 'comp-a');
  eq(loaded.layout.widgets[0].config.title, 'Hi', 'known config kept');
  eq(loaded.layout.widgets[0].config.bogus, undefined, 'unknown config stripped');
  eq(loaded.layout.widgets[0].bogus, undefined, 'unknown widget key stripped');
});

await test('layout bad position rejected', async () => {
  const { env } = makeEnv();
  await expectFail(() => saveLayout(env, sess('dash-employee-a'), { companyId: 'comp-a', widgets: [{ id: 'overview', x: 99 }] }), 400, 'x out of range');
  await expectFail(() => saveLayout(env, sess('dash-employee-a'), { companyId: 'comp-a', widgets: [{ id: 'overview', w: 0 }] }), 400, 'w out of range');
  await expectFail(() => saveLayout(env, sess('dash-employee-a'), { companyId: 'comp-a', widgets: [{ id: 'overview', config: { limit: 0 } }] }), 400, 'limit out of range');
  await expectFail(() => saveLayout(env, sess('dash-employee-a'), { companyId: 'comp-a', widgets: [{ id: 'overview', config: { period: '1y' } }] }), 400, 'period out of range');
});

await test('layout removed member denied', async () => {
  const { env } = makeEnv();
  await expectFail(() => getLayout(env, sess('dash-removed-a'), 'comp-a'), 404, 'removed get layout');
  await expectFail(() => saveLayout(env, sess('dash-removed-a'), { companyId: 'comp-a', widgets: [] }), 404, 'removed save layout');
});

await test('layout expired company denied', async () => {
  const { env } = makeEnv();
  await expectFail(() => getLayout(env, sess('kluzar-user-expired'), 'comp-expired'), 403, 'expired get layout');
});

await test('layout unknown company denied', async () => {
  const { env } = makeEnv();
  await expectFail(() => getLayout(env, sess('kluzar-user-owner-a'), 'comp-missing'), 404, 'unknown company get layout');
});

await test('layout manipulated body stripped', async () => {
  const { env, db } = makeEnv();
  await saveLayout(env, sess('dash-employee-a'), { companyId: 'comp-a', widgets: [{ id: 'overview' }], user_id: 'victim', is_company_default: 1, owner_user_id: 'victim' });
  const personal = await rows(db, 'SELECT * FROM dashboard_layouts WHERE company_id = ? AND user_id = ? AND is_company_default = 0', ['comp-a', 'dash-employee-a']);
  eq(personal.length, 1, 'personal row for caller only');
  const victim = await rows(db, 'SELECT * FROM dashboard_layouts WHERE user_id = ?', ['victim']);
  eq(victim.length, 0, 'no row for injected user');
  const defaults = await rows(db, 'SELECT * FROM dashboard_layouts WHERE company_id = ? AND is_company_default = 1', ['comp-a']);
  eq(defaults.length, 0, 'no default row from injected flag');
});

await test('layout company default replaces old default', async () => {
  const { env, db } = makeEnv();
  await setCompanyDefaultLayout(env, sess('kluzar-user-owner-a'), { companyId: 'comp-a', widgets: [{ id: 'overview' }] });
  await setCompanyDefaultLayout(env, sess('kluzar-user-admin-a'), { companyId: 'comp-a', widgets: [{ id: 'team' }] });
  const defaults = await rows(db, 'SELECT * FROM dashboard_layouts WHERE company_id = ? AND is_company_default = 1', ['comp-a']);
  eq(defaults.length, 1, 'exactly one default row');
  eq(JSON.parse(defaults[0].widgets)[0].id, 'team', 'latest default wins');
});

await test('layout company default change logged', async () => {
  const { env, db } = makeEnv();
  await setCompanyDefaultLayout(env, sess('kluzar-user-owner-a'), { companyId: 'comp-a', widgets: [{ id: 'overview' }] });
  const logRows = await rows(db, 'SELECT * FROM activity_logs WHERE company_id = ? AND action = ?', ['comp-a', 'layout_default_updated']);
  eq(logRows.length, 1, 'default change log');
});

await test('layout personal isolation per user', async () => {
  const { env } = makeEnv();
  await saveLayout(env, sess('dash-employee-a'), { companyId: 'comp-a', widgets: [{ id: 'overview' }] });
  const other = await getLayout(env, sess('dash-employee2-a'), 'comp-a');
  eq(other.layout.source, 'built-in', 'other user sees built-in, not first user personal');
});

await test('layout default does not leak across companies', async () => {
  const { env } = makeEnv();
  await setCompanyDefaultLayout(env, sess('kluzar-user-owner-a'), { companyId: 'comp-a', widgets: [{ id: 'team' }] });
  const other = await getLayout(env, sess('dash-employee-b'), 'comp-b');
  eq(other.layout.source, 'built-in', 'other company sees built-in');
});

await test('layout empty array is a valid personal layout', async () => {
  const { env } = makeEnv();
  await saveLayout(env, sess('dash-employee-a'), { companyId: 'comp-a', widgets: [] });
  const loaded = await getLayout(env, sess('dash-employee-a'), 'comp-a');
  eq(loaded.layout.source, 'personal', 'empty personal source');
  eq(loaded.layout.widgets.length, 0, 'empty personal widgets');
});

await test('layout save by manager and admin allowed', async () => {
  const { env } = makeEnv();
  const m = await saveLayout(env, sess('dash-manager-a'), { companyId: 'comp-a', widgets: [{ id: 'team' }] });
  eq(m.layout.source, 'personal', 'manager personal save');
  const a = await saveLayout(env, sess('kluzar-user-admin-a'), { companyId: 'comp-a', widgets: [{ id: 'team' }] });
  eq(a.layout.source, 'personal', 'admin personal save');
});

await test('layout write rate limit blocks after 600', async () => {
  const { env } = makeEnv();
  for (let i = 0; i < 600; i++) {
    await saveLayout(env, sess('kluzar-user-rate'), { companyId: 'comp-rate', widgets: [] });
  }
  await expectFail(() => saveLayout(env, sess('kluzar-user-rate'), { companyId: 'comp-rate', widgets: [] }), 429, '601st write');
});

console.log('RESULT passed=' + passed + ' failed=' + failed);
if (failed > 0) process.exit(1);
