-- Is the staging database actually carrying everything the advanced app expects?
--
-- Paste the whole file into the Supabase SQL editor (staging project) and run it.
-- Every row should read `present = true`. A false row means that feature's
-- migration has not reached this project, whatever the deploy log said — the app
-- will show the screen and the screen will fail when it calls the missing piece.
--
-- It is also `supabase/tests/41_deployed_features.sql`, so CI fails if a migration
-- ever stops providing one of these. One list, two uses.

-- A temporary view, so the same file can both print the answer for a person and be
-- asserted on by the test that guards it.
create or replace temporary view deployed_features as
with wanted(feature, kind, name) as (values
  ('F9 imports',              'table',    'public.import_jobs'),
  ('F9 imports',              'table',    'public.import_rows'),
  ('F10 company options',     'table',    'public.company_options'),
  ('F11 assistant',           'table',    'public.assistant_conversations'),
  ('F11 assistant',           'table',    'public.assistant_proposals'),
  ('F6 activity log',         'table',    'public.activity_log'),
  ('F5 documents',            'table',    'public.documents'),
  ('F3 labour actuals',       'table',    'public.labour_actuals'),
  ('F12 dimensions',          'table',    'public.panel_layouts'),
  ('F7 approval rules',       'table',    'public.approval_rules'),
  ('2.2 price lists',         'function', 'app.start_price_list'),
  ('2.2 price lists',         'function', 'app.accept_price_rows'),
  ('2.3 BOM import',          'function', 'app.start_bom_import'),
  ('2.3 BOM import',          'function', 'app.apply_bom_import'),
  ('2.4 assistant',           'function', 'app.assistant_allowance'),
  ('2.4 assistant',           'function', 'app.apply_proposal'),
  ('2.5 approval rules',      'function', 'app.approval_review'),
  ('2.6 validity',            'view',     'public.v_quotation_validity'),
  ('2.6 validity',            'function', 'app.expire_quotations'),
  ('2.6 re-issue',            'function', 'app.reissue_costing'),
  ('2.7 options and extras',  'view',     'public.v_costing_option_choice'),
  ('2.8 labour actuals',      'view',     'public.v_panel_labour_variance'),
  ('2.8 labour actuals',      'view',     'public.v_kit_group_labour_variance'),
  ('2.8 labour actuals',      'function', 'app.record_actual_hours'),
  ('2.8 labour actuals',      'function', 'app.apply_labour_suggestion'),
  ('3.1 board configurator',  'view',     'public.v_board_kits'),
  ('3.1 board configurator',  'function', 'app.propose_board'),
  ('3.1 board configurator',  'function', 'app.apply_board'),
  ('3.2 APFC',                'function', 'app.propose_apfc'),
  ('3.2 APFC',                'function', 'app.apply_apfc_steps'),
  ('3.6 sales analytics',     'view',     'public.v_sales_outcomes'),
  ('3.6 sales analytics',     'view',     'public.v_margin_achieved'),
  ('3.6 sales analytics',     'view',     'public.v_sales_pipeline'),
  ('3.6 sales analytics',     'function', 'app.value_band'),
  ('F12 dimensions',          'function', 'app.panel_fit'),
  ('2.7 options and extras',  'column',   'public.costings.chosen_option_label'),
  ('2.7 options and extras',  'column',   'public.costing_panels.is_option'),
  ('3.1 board configurator',  'column',   'public.costing_panels.parameters'),
  ('3.3 parameterised kits',  'table',    'public.kit_parameters'),
  ('3.3 parameterised kits',  'function', 'app.eval_qty_expression'),
  ('3.4 compatibility',       'table',    'public.compatibility_rules'),
  ('3.4 compatibility',       'view',     'public.v_panel_warnings'),
  ('Feature switches',        'table',    'public.features'),
  ('Feature switches',        'view',     'public.v_company_features'),
  ('Feature switches',        'function', 'app.feature_on'),
  ('4.1 busbar runs',         'view',     'public.v_busbar_bars'),
  ('4.1 busbar runs',         'view',     'public.v_panel_busbar_runs'),
  ('4.1 busbar runs',         'view',     'public.v_panel_busbar_check'),
  ('4.1 busbar runs',         'function', 'app.busbar_run_totals'),
  ('4.1 busbar runs',         'function', 'app.starting_busbar_runs'),
  ('4.1 busbar runs',         'function', 'app.apply_busbar_runs')
)
select
  w.feature,
  w.kind,
  w.name,
  case w.kind
    when 'function' then exists (
      select 1 from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname || '.' || p.proname = w.name)
    when 'column' then exists (
      select 1 from information_schema.columns c
      where c.table_schema || '.' || c.table_name || '.' || c.column_name = w.name)
    else to_regclass(w.name) is not null
  end as present
from wanted w;

select * from deployed_features order by present, feature, kind, name;
