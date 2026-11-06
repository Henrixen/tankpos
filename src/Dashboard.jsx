-- New RPC; leaves the original function untouched. Run in Supabase SQL Editor.
CREATE OR REPLACE FUNCTION public.dashboard_fixing_window_segments_coating()
 RETURNS TABLE(snapshot_date date, region text, segment text, coating text, avg_days numeric, ships bigint)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
with recent as materialized (
  select
    pe.vessel_name,
    pe.dwt::numeric dwt,
    pe.open_date::text open_txt,
    pe.super_region,
    pe.coating_type_2,
    pe.last_update_spotship,
    (pe.last_update_spotship at time zone 'UTC')::date report_date
  from public.positions_external pe
  where pe.last_update_spotship >= now() - interval '45 days'
    and pe.vessel_name is not null
    and pe.open_date is not null
),
dedup as (
  select distinct on (report_date,vessel_name)
    report_date,
    vessel_name,
    dwt,
    open_txt,
    super_region,
    coating_type_2,
    last_update_spotship
  from recent
  order by report_date,vessel_name,last_update_spotship desc
),
parsed as (
  select *,
    case
      when open_txt ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}'
        then to_date(substring(open_txt from 1 for 10),'YYYY-MM-DD')
      when open_txt ~* '^[0-9]{1,2} [A-Z]{3} [0-9]{4}$'
        then to_date(open_txt,'DD Mon YYYY')
      when open_txt ~* '^[0-9]{1,2} [A-Z]{3} [0-9]{2}$'
        then to_date(open_txt,'DD Mon YY')
      when open_txt ~* '^[0-9]{1,2} [A-Z]{3}$'
        then case
          when to_date(open_txt||' '||extract(year from report_date)::int,'DD Mon YYYY') < report_date - 45
            then to_date(open_txt||' '||(extract(year from report_date)::int+1),'DD Mon YYYY')
          else to_date(open_txt||' '||extract(year from report_date)::int,'DD Mon YYYY')
        end
      else null
    end open_dt
  from dedup
),
classified as (
  select
    report_date,
    case
      when coalesce(super_region,'') ilike any(array[
        '%north west europe%','%northwest europe%','%uk continent%','%ukc%','%nwe%'
      ]) then 'NWE / UKC'
      when coalesce(super_region,'') ilike '%baltic%' then 'Baltic'
      when coalesce(super_region,'') ilike any(array[
        '%med-black%','%mediterranean%','%black sea%'
      ]) then 'Med / Black Sea'
      when coalesce(super_region,'') ilike any(array[
        '%us gulf%','%u.s. gulf%','%usg%','%gulf of mexico%',
        '%us east%','%u.s. east%','%usec%',
        '%us atlantic%','%u.s. atlantic%','%usac%',
        '%north america east%','%north america atlantic%','%east coast north america%'
      ]) then 'USG / USEC / USAC'
      when coalesce(super_region,'') ilike any(array['%carib%','%west indies%'])
        then 'Caribs'
      when coalesce(super_region,'') ilike any(array[
        '%arabian gulf%','%persian gulf%','%middle east gulf%','%india%','%red sea%'
      ]) then 'MEG / WCI / Red Sea'
      when coalesce(super_region,'') ilike any(array[
        '%south-east-asia%','%south east asia%','%far-east%','%far east%','%east asia%'
      ]) then 'SEA / FEA'
      when coalesce(super_region,'') ilike '%africa%' then 'Africa'
      when coalesce(super_region,'') ilike '%south america%' then 'South America'
      else 'Other'
    end region,
    case
      when dwt < 10000 then 'Sub 10'
      when dwt < 14000 then 'City'
      when dwt < 19000 then 'Inter'
      when dwt < 23000 then 'J19'
      when dwt < 30000 then 'Flexi'
      when dwt < 40000 then 'Handy'
      else 'MR'
    end segment,
    case
      when coating_type_2 is null or btrim(coating_type_2) = '' then 'Unspecified'
      when upper(coating_type_2) like '%STAINLESS%' or upper(coating_type_2) in ('SS','STST') then 'Stainless'
      when upper(replace(replace(coating_type_2,' ',''),'-','')) like '%MARINELINE%' or upper(coating_type_2) = 'ML' then 'Marineline'
      when upper(coating_type_2) like '%ZINC%' then 'Zinc'
      when upper(coating_type_2) like '%EPOXY%' then 'Epoxy'
      else initcap(btrim(coating_type_2))
    end coating,
    (open_dt-report_date)::int days_until_open
  from parsed
  where open_dt is not null
)
select
  report_date as snapshot_date,
  region,
  segment,
  coating,
  round(avg(days_until_open)::numeric,1) as avg_days,
  count(*)::bigint as ships
from classified
where days_until_open between 0 and 45
group by report_date,region,segment,coating
order by report_date,region,segment,coating;
$function$

