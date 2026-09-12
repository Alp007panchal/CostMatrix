-- The other half: compare the two phases and refuse any difference.
do $$
declare
  r record;
  differences integer := 0;
begin
  for r in
    select b.label, b.value as before_value, a.value as after_value
      from test.rehearsal b
      join test.rehearsal a on a.label = b.label and a.phase = 'after'
     where b.phase = 'before'
     order by b.label
  loop
    if r.before_value is distinct from r.after_value then
      differences := differences + 1;
      raise warning 'CHANGED  %  before: %  after: %', r.label, r.before_value, r.after_value;
    else
      raise notice 'same     %  (%)', r.label,
        case when length(r.before_value) > 60
             then left(r.before_value, 57) || '…' else r.before_value end;
    end if;
  end loop;

  if (select count(*) from test.rehearsal where phase = 'before') = 0 then
    raise exception 'nothing was written down before the upgrade';
  end if;
  if differences > 0 then
    raise exception 'the upgrade changed % figure(s) on a database that already held rows', differences;
  end if;
  raise notice 'The upgrade moved nothing: % figures identical either side of it',
    (select count(*) from test.rehearsal where phase = 'before');
end;
$$;
