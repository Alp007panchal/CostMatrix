-- Compare the two phases and refuse any difference. Used by both drills, so it
-- says "between the two" rather than naming one of them.
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
    raise exception 'nothing was written down beforehand, so there is nothing to compare';
  end if;
  if differences > 0 then
    raise exception '% figure(s) changed between the two readings', differences;
  end if;
  raise notice 'Nothing moved: % figures identical on both sides',
    (select count(*) from test.rehearsal where phase = 'before');
end;
$$;
