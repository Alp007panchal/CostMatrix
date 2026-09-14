-- Error reporting in the browser (migration 0124).
--
-- The thing being tested is not "a row appears". It is the three properties
-- that decide whether this is useful or a liability: repeats collapse rather
-- than flooding, one person cannot fill the table, and one company's failures
-- stay their own.

\set alpha  '00000000-0000-0000-0000-0000000000c2'
\set beta   '00000000-0000-0000-0000-0000000000c3'
\set alice  '00000000-0000-0000-0000-0000000000a2'
\set bob    '00000000-0000-0000-0000-0000000000a3'
\set carol  '00000000-0000-0000-0000-0000000000a4'
\set master '00000000-0000-0000-0000-0000000000a1'

-- === An engineer's screen breaks, and the app records it =====================
begin;
set local role authenticated;
select test.sign_in(:'carol');

select test.ok(
  app.report_error('render', '/costings/abc', 'Cannot read properties of null',
                   'at PanelCard\nat CostingEditor', 'Firefox/141.0') is not null,
  'a costing engineer can report a crash, though they cannot write the table');

select test.refuses(
  $$insert into public.error_reports (company_id, kind, message)
    values ('00000000-0000-0000-0000-0000000000c2'::uuid, 'render', 'by hand')$$,
  'and cannot insert a row by hand — the function is the only way in');

-- === The same failure again is a count, not another row ======================
select app.report_error('render', '/costings/abc', 'Cannot read properties of null',
                        'at PanelCard\nat CostingEditor (newer)', 'Firefox/141.0');
select app.report_error('render', '/costings/abc', 'Cannot read properties of null',
                        null, 'Firefox/141.0');

-- A different route, or a different message, is a different fault.
select app.report_error('render', '/quotations', 'Cannot read properties of null');
select app.report_error('load', '/costings/abc', 'Could not read the kits');

-- Reading is an administrator's business (asserted below), so step out of
-- Carol's session to count what she wrote.
reset role;

select test.eq((select count(*)::int from public.error_reports
                 where company_id = :'alpha'::uuid and path = '/costings/abc'
                   and kind = 'render'), 1,
  'three reports of one failure are one row');
select test.eq((select times_seen from public.error_reports
                 where company_id = :'alpha'::uuid and path = '/costings/abc'
                   and kind = 'render'), 3,
  'and the row counts them');
select test.ok((select detail like '%newer%' from public.error_reports
                 where path = '/costings/abc' and kind = 'render'),
  'and keeps the newest stack, not the first');
-- The same route with a different kind is a different fault, which is why the
-- assertions above name the kind: '/costings/abc' also has a failed load on it.
select test.eq((select count(*)::int from public.error_reports
                 where company_id = :'alpha'::uuid and path = '/costings/abc'), 2,
  'a crash and a failed load on the same screen are two rows, not one');
select test.eq((select count(*)::int from public.error_reports where company_id = :'alpha'::uuid), 3,
  'a different route or a different kind is a different row');

-- === What it refuses, quietly ================================================
set local role authenticated;
select test.sign_in(:'carol');
select test.ok(app.report_error('render', '/x', '') is null,
  'an empty message is not a report');
select test.ok(app.report_error('sideways', '/x', 'something') is null,
  'nor is a kind nobody defined');

-- Long input is cut rather than refused: a truncated report still says what broke.
select app.report_error('load', repeat('p', 400), repeat('m', 900), repeat('d', 4000));
reset role;
select test.eq((select count(*)::int from public.error_reports where path = '/x'), 0,
  'and neither wrote anything');
select test.ok((select length(path) = 200 and length(message) = 500 and length(detail) = 2000
                  from public.error_reports where kind = 'load' and message like 'mmm%'),
  'a very long route, message and stack are cut to fit');
rollback;

-- === One person cannot fill the table ========================================
begin;
set local role authenticated;
select test.sign_in(:'carol');

do $$
declare i integer;
begin
  for i in 1..25 loop
    perform app.report_error('render', '/loop/' || i, 'a render loop, report ' || i);
  end loop;
end;
$$;

select test.ok(app.report_error('render', '/loop/26', 'one more') is null,
  'the twenty-sixth is refused rather than raising — being unable to record an error never breaks a screen');
-- The cap counts distinct faults, not repeats: a loop reporting the SAME thing
-- keeps being counted, which is the whole point of collapsing.
select test.ok(app.report_error('render', '/loop/1', 'a render loop, report 1') is not null,
  'but the same failure again still counts up, cap or no cap');
reset role;

select test.eq((select count(*)::int from public.error_reports where company_id = :'alpha'::uuid), 20,
  'twenty-five distinct failures in an hour are recorded twenty times, then it stops');
select test.eq((select times_seen from public.error_reports where path = '/loop/1'), 2,
  'and the count is right');
rollback;

-- === Who may read it =========================================================
begin;
set local role authenticated;
select test.sign_in(:'carol');
select app.report_error('render', '/costings/abc', 'Alpha broke');
reset role;

set local role authenticated;
select test.sign_in(:'bob');
select app.report_error('render', '/costings/xyz', 'Beta broke');

select test.eq((select count(*)::int from public.error_reports), 1,
  'Bob administers Beta, so he reads Beta''s one failure');
select test.eq((select message from public.error_reports), 'Beta broke',
  'and Alpha''s is not among them, though it happened first');
reset role;

set local role authenticated;
select test.sign_in(:'carol');
select test.eq((select count(*)::int from public.error_reports), 0,
  'Carol is an engineer, not an administrator, so she reads none of it — not even the one she reported herself');
reset role;

set local role authenticated;
select test.sign_in(:'alice');
select test.eq((select count(*)::int from public.error_reports), 1,
  'Alpha''s administrator sees Alpha''s one failure');
select test.eq((select message from public.error_reports), 'Alpha broke',
  'and it is Alpha''s, not Beta''s');
select test.eq((select count(*)::int from public.v_error_reports where company_name is not null), 1,
  'the view names the company and the person, and hides nothing extra');
reset role;

set local role authenticated;
select test.sign_in(:'master');
select test.eq((select count(*)::int from public.error_reports), 2,
  'the master administrator sees both companies, which is how support works');
rollback;

-- === Old rows delete themselves ==============================================
begin;
set local role authenticated;
select test.sign_in(:'carol');
select app.report_error('render', '/old', 'from last quarter');
reset role;

-- Age it past the horizon, then report anything at all.
update public.error_reports set last_seen_at = now() - interval '91 days' where path = '/old';

set local role authenticated;
select test.sign_in(:'carol');
select app.report_error('render', '/new', 'today');
reset role;
select test.eq((select count(*)::int from public.error_reports where path = '/old'), 0,
  'a report older than ninety days is swept the next time anything is recorded');
select test.eq((select count(*)::int from public.error_reports where path = '/new'), 1,
  'and today''s is still there');
rollback;

-- === Nothing here moves a price ==============================================
select test.eq((select material_cost from public.v_costing_panel_costs c
                 join public.costings k on k.id = c.costing_id
                where k.title = 'NPP-192 Option 1, from the seed'),
               3622781.80, 'NPP-192 is where it has always been: 3,622,781.80');
