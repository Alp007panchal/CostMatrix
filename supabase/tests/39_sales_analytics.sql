-- Sales analytics (migration 0116, roadmap 3.6). Read-only: every assertion here
-- is about what the views say, and the last block proves they changed nothing.
--
-- Four jobs for one customer: one won (offered twice, the second offer winning),
-- one lost with a reason, one open with no offer out, one quoted and waiting.

\set alpha  '00000000-0000-0000-0000-0000000000c2'
\set alice  '00000000-0000-0000-0000-0000000000a2'
\set carol  '00000000-0000-0000-0000-0000000000a4'
\set bob    '00000000-0000-0000-0000-0000000000a3'

select id as part_id from public.components
 where company_id is null and pricing_mode = 'fixed' and purchase_price is not null
   and not is_placeholder order by code limit 1 \gset

insert into public.kit_groups (id, company_id, name)
values ('00000000-0000-0000-0000-00000000fa01', null, 'ANALYTICS GROUP');
insert into public.kit_group_labour (kit_group_id, process_type, hours) values
  ('00000000-0000-0000-0000-00000000fa01', 'assembly', 5);
insert into public.assemblies (id, company_id, code, name, kit_group_id)
values ('00000000-0000-0000-0000-00000000faa1', null, 'ANALYTICS-KIT', 'ANALYTICS TEST KIT',
        '00000000-0000-0000-0000-00000000fa01');
insert into public.assembly_components (assembly_id, component_id, quantity, is_main_device)
values ('00000000-0000-0000-0000-00000000faa1', :'part_id'::uuid, 1, true);

-- === The value bands are the company's own ==================================
begin;
set local role authenticated;
select test.sign_in(:'carol');
select app.value_band(400000)    as band_small \gset
select app.value_band(1500000)   as band_mid \gset
select app.value_band(5000000)   as band_large \gset
select app.value_band(20000000)  as band_huge \gset
select app.value_band(null)      as band_none \gset
rollback;

select test.eq(:'band_small'::text, 'under 500 K', 'a small job reads in the smallest band');
select test.eq(:'band_mid'::text, '500 K to 2 M', 'and the bands read as an engineer would say them');
select test.eq(:'band_large'::text, '2 M to 10 M', 'the band above that');
select test.eq(:'band_huge'::text, 'over 10 M', 'and the top band is open-ended');
select test.eq(:'band_none'::text, 'no value yet', 'a job with no costing yet is not forced into a band');

-- The setting is a company administrator's to change, so it is changed as one.
begin;
set local role authenticated;
select test.sign_in(:'alice');
update public.company_options set value = '"1000,5000"'::jsonb
 where company_id = :'alpha'::uuid and key = 'analytics_value_bands';
select app.value_band(2000) as band_changed \gset
rollback;
select test.eq(:'band_changed'::text, '1 K to 5 K',
  'changing the setting changes the bands, with no deploy');

-- === Four jobs ==============================================================
begin;
set local role authenticated;
select test.sign_in(:'carol');
insert into public.customers (company_id, name, city)
values (:'alpha'::uuid, 'Analytics Test Limited', 'Nairobi') returning id as cust \gset
insert into public.customers (company_id, name, city)
values (:'alpha'::uuid, 'Other Customer Limited', 'Mombasa') returning id as cust2 \gset

-- The job that was won, offered twice.
select id as enq_won from public.create_enquiry(
  jsonb_build_object('customer_id', :'cust', 'title', 'Won: factory board')) \gset
select id as won_a from public.create_costing('Won offer A', null, :'enq_won'::uuid) \gset
insert into public.costing_panels (costing_id, company_id, name, quantity)
values (:'won_a'::uuid, :'alpha'::uuid, 'BOARD A', 1) returning id as won_a_panel \gset
select app.add_assembly_to_costing(:'won_a_panel'::uuid, '00000000-0000-0000-0000-00000000faa1'::uuid, 2);
select app.submit_costing(:'won_a'::uuid);

select id as won_b from public.create_costing('Won offer B', null, :'enq_won'::uuid) \gset
insert into public.costing_panels (costing_id, company_id, name, quantity)
values (:'won_b'::uuid, :'alpha'::uuid, 'BOARD B', 1) returning id as won_b_panel \gset
select app.add_assembly_to_costing(:'won_b_panel'::uuid, '00000000-0000-0000-0000-00000000faa1'::uuid, 5);
select app.submit_costing(:'won_b'::uuid);

-- The job that was lost.
select id as enq_lost from public.create_enquiry(
  jsonb_build_object('customer_id', :'cust', 'title', 'Lost: warehouse board')) \gset
select id as lost_c from public.create_costing('Lost offer', null, :'enq_lost'::uuid) \gset
insert into public.costing_panels (costing_id, company_id, name, quantity)
values (:'lost_c'::uuid, :'alpha'::uuid, 'BOARD C', 1) returning id as lost_panel \gset
select app.add_assembly_to_costing(:'lost_panel'::uuid, '00000000-0000-0000-0000-00000000faa1'::uuid, 3);
select app.submit_costing(:'lost_c'::uuid);

-- The job still being worked on, with nothing out.
select id as enq_open from public.create_enquiry(
  jsonb_build_object('customer_id', :'cust2', 'title', 'Open: nothing out yet')) \gset
select id as open_d from public.create_costing('Open draft', null, :'enq_open'::uuid) \gset
insert into public.costing_panels (costing_id, company_id, name, quantity)
values (:'open_d'::uuid, :'alpha'::uuid, 'BOARD D', 1) returning id as open_panel \gset
select app.add_assembly_to_costing(:'open_panel'::uuid, '00000000-0000-0000-0000-00000000faa1'::uuid, 1);

-- The job quoted and waiting for an answer.
select id as enq_quoted from public.create_enquiry(
  jsonb_build_object('customer_id', :'cust2', 'title', 'Quoted: waiting')) \gset
select id as quoted_e from public.create_costing('Quoted offer', null, :'enq_quoted'::uuid) \gset
insert into public.costing_panels (costing_id, company_id, name, quantity)
values (:'quoted_e'::uuid, :'alpha'::uuid, 'BOARD E', 1) returning id as quoted_panel \gset
select app.add_assembly_to_costing(:'quoted_panel'::uuid, '00000000-0000-0000-0000-00000000faa1'::uuid, 4);
select app.submit_costing(:'quoted_e'::uuid);
commit;

begin;
set local role authenticated;
select test.sign_in(:'alice');
select app.approve_costing(:'won_a'::uuid);
select app.approve_costing(:'won_b'::uuid);
select app.approve_costing(:'lost_c'::uuid);
select app.approve_costing(:'quoted_e'::uuid);
-- A is released first, B second: the winner is B, so the view must take the
-- winner's value rather than the most recent offer's.
select id as q_won_a from public.release_quotation(:'won_a'::uuid, format('%s/wa.pdf', :'alpha'),
  jsonb_build_object('customer_name', 'ANALYTICS TEST LIMITED', 'customer_id', :'cust')) \gset
select id as q_won_b from public.release_quotation(:'won_b'::uuid, format('%s/wb.pdf', :'alpha'),
  jsonb_build_object('customer_name', 'ANALYTICS TEST LIMITED', 'customer_id', :'cust')) \gset
select id as q_lost from public.release_quotation(:'lost_c'::uuid, format('%s/lc.pdf', :'alpha'),
  jsonb_build_object('customer_name', 'ANALYTICS TEST LIMITED', 'customer_id', :'cust')) \gset
select id as q_quoted from public.release_quotation(:'quoted_e'::uuid, format('%s/qe.pdf', :'alpha'),
  jsonb_build_object('customer_name', 'OTHER CUSTOMER LIMITED', 'customer_id', :'cust2')) \gset
select public.set_quotation_status(:'q_quoted'::uuid, 'sent', null);
commit;

begin;
set local role authenticated;
select test.sign_in(:'carol');
select public.decide_enquiry(:'enq_won'::uuid, 'won', :'q_won_b'::uuid);
select public.decide_enquiry(:'enq_lost'::uuid, 'lost', null, 'price: 12 % above the Chinese offer');
commit;

-- === What happened to each job ==============================================
select test.eq((select status::text from public.v_sales_outcomes where enquiry_id = :'enq_won'::uuid),
  'won', 'the won job reads as won');
select test.eq((select costing_id from public.v_sales_outcomes where enquiry_id = :'enq_won'::uuid),
  :'won_b'::uuid,
  'and is valued on the offer that won it, not the one released last');
select test.eq((select value_ex_vat from public.v_sales_outcomes where enquiry_id = :'enq_won'::uuid),
  (select subtotal from public.v_costing_totals where costing_id = :'won_b'::uuid),
  'at that costing''s own ex-VAT subtotal, VAT left out of a sales figure');
select test.eq((select quotations_released from public.v_sales_outcomes where enquiry_id = :'enq_won'::uuid),
  2, 'counting both offers that went out');
select test.eq((select days_to_decide from public.v_sales_outcomes where enquiry_id = :'enq_won'::uuid),
  0, 'decided the day it came in, in this test');
select test.ok((select lost_reason is null from public.v_sales_outcomes where enquiry_id = :'enq_won'::uuid),
  'a won job has no reason for being lost');

select test.eq((select status::text from public.v_sales_outcomes where enquiry_id = :'enq_lost'::uuid),
  'lost', 'the lost job reads as lost');
select test.eq((select lost_reason from public.v_sales_outcomes where enquiry_id = :'enq_lost'::uuid),
  'price: 12 % above the Chinese offer',
  'in the words of whoever heard it — which is what the report is built on');
select test.ok((select value_ex_vat > 0 from public.v_sales_outcomes where enquiry_id = :'enq_lost'::uuid),
  'a lost job still carries what it was worth, or the loss cannot be weighed');

select test.eq((select status::text from public.v_sales_outcomes where enquiry_id = :'enq_open'::uuid),
  'open', 'the job with nothing out is open');
select test.ok((select value_ex_vat > 0 from public.v_sales_outcomes where enquiry_id = :'enq_open'::uuid),
  'valued on the draft being worked on, because that is the best estimate there is');

-- === By product group =======================================================
select test.eq((select kit_group_name from public.v_sales_group_outcomes
                where enquiry_id = :'enq_won'::uuid), 'ANALYTICS GROUP',
  'the won job is counted against the kit group it used');
select test.ok((select material > 0 and labour > 0 and hours > 0
                  from public.v_sales_group_outcomes where enquiry_id = :'enq_won'::uuid),
  'with the money and hours that group came to on it');
select test.eq((select status::text from public.v_sales_group_outcomes
                where enquiry_id = :'enq_lost'::uuid), 'lost',
  'and a lost job the same way, so a hit rate by group can be worked out');
select test.eq((select count(*)::int from public.v_sales_group_outcomes
                where enquiry_id = :'enq_open'::uuid and kit_group_name = 'ANALYTICS GROUP'), 1,
  'the open job too: what is at stake in a group is not only what was decided');

-- === Margin quoted against margin achieved ==================================
select margin_quoted_pct as quoted_pct from public.v_margin_achieved
 where costing_id = :'won_b'::uuid \gset
select test.ok(:'quoted_pct'::numeric is not null, 'a costing has a quoted margin');
select test.eq((select labour_measured_pct from public.v_margin_achieved where costing_id = :'won_b'::uuid),
  0::numeric, 'and no measured labour until somebody records hours');
select test.eq((select margin_achieved_pct from public.v_margin_achieved where costing_id = :'won_b'::uuid),
  :'quoted_pct'::numeric,
  'so the achieved figure is the quoted one: the estimate is all there is to go on');

begin;
set local role authenticated;
select test.sign_in(:'carol');
-- The shop took half again as long as the standards said.
select app.record_actual_hours(:'won_b_panel'::uuid, 'assembly',
  (select hours * 1.5 from public.v_costing_panel_costs where panel_id = :'won_b_panel'::uuid));
commit;

select test.eq((select labour_measured_pct from public.v_margin_achieved where costing_id = :'won_b'::uuid),
  100::numeric, 'once the hours are in, the whole of this job''s labour is measured');
select test.ok((select margin_achieved_pct < margin_quoted_pct
                  from public.v_margin_achieved where costing_id = :'won_b'::uuid),
  'and the margin achieved is below the margin quoted, because it took longer');
select test.ok((select hours_achieved > hours_quoted
                  from public.v_margin_achieved where costing_id = :'won_b'::uuid),
  'on the hours the shop actually recorded');
select test.eq((select price_ex_vat from public.v_margin_achieved where costing_id = :'won_b'::uuid),
  (select subtotal from public.v_costing_totals where costing_id = :'won_b'::uuid),
  'against the price the customer was given, which has not moved');

-- === What is still out there =================================================
select test.eq((select count(*)::int from public.v_sales_pipeline
                where enquiry_id in (:'enq_won'::uuid, :'enq_lost'::uuid)), 0,
  'a decided job is out of the pipeline');
select test.eq((select count(*)::int from public.v_sales_pipeline
                where enquiry_id in (:'enq_open'::uuid, :'enq_quoted'::uuid)), 2,
  'and the two undecided ones are in it');
select test.eq((select latest_quotation from public.v_sales_pipeline where enquiry_id = :'enq_quoted'::uuid),
  (select reference_no from public.quotations where id = :'q_quoted'::uuid),
  'the quoted job names the offer it is waiting on');
select test.eq((select quotation_status::text from public.v_sales_pipeline where enquiry_id = :'enq_quoted'::uuid),
  'sent', 'and that it has been sent');
select test.ok((select days_left is not null from public.v_sales_pipeline where enquiry_id = :'enq_quoted'::uuid),
  'with how long it has left to run');
select test.ok((select latest_quotation is null from public.v_sales_pipeline where enquiry_id = :'enq_open'::uuid),
  'while the job with nothing out says so');
select test.ok((select age_days >= 0 from public.v_sales_pipeline where enquiry_id = :'enq_open'::uuid),
  'both carry how long they have been waiting');

-- === It is a report, and reports change nothing ==============================
select test.eq((select subtotal from public.v_costing_totals where costing_id = :'won_b'::uuid),
  (select value_ex_vat from public.v_sales_outcomes where enquiry_id = :'enq_won'::uuid),
  'reading the reports has moved no price');
select test.eq((select status::text from public.quotations where id = :'q_won_b'::uuid), 'won',
  'nor any quotation''s state');

-- === Isolation ==============================================================
begin;
set local role authenticated;
select test.sign_in(:'bob');
select test.eq((select count(*)::int from public.v_sales_outcomes where company_id = :'alpha'::uuid), 0,
  'another company sees none of these jobs');
select test.eq((select count(*)::int from public.v_sales_pipeline where company_id = :'alpha'::uuid), 0,
  'nor what is in their pipeline');
select test.eq((select count(*)::int from public.v_margin_achieved where company_id = :'alpha'::uuid), 0,
  'nor what they make on it');
rollback;
